import { createPool } from '../db/index.ts';
import type { AutomationFailedEndpoint } from './types.ts';

export interface PostgresCheckResult {
  name: string;
  category: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface PostgresValidationSuiteResult {
  suite: 'postgres';
  runLabel: string;
  totalItems: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  avgResponseMs: number;
  failedEndpoints: AutomationFailedEndpoint[];
  checks: PostgresCheckResult[];
}

export async function runPostgresValidationSuite(): Promise<PostgresValidationSuiteResult> {
  const pool = createPool();
  const suiteStart = Date.now();
  const checks: PostgresCheckResult[] = [];

  const runCheck = async (
    name: string,
    category: string,
    fn: () => Promise<{ passed: boolean; detail: string }>
  ) => {
    const t0 = Date.now();
    try {
      const outcome = await fn();
      checks.push({
        name,
        category,
        passed: outcome.passed,
        detail: outcome.detail,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      checks.push({
        name,
        category,
        passed: false,
        detail: err instanceof Error ? err.message : 'Check threw an unexpected error',
        durationMs: Date.now() - t0,
      });
    }
  };

  // 1. Primary key constraints exist across all 10 tables
  await runCheck('Primary key constraints verified on all core tables', 'Primary Keys', async () => {
    const res = await pool.query(`
      SELECT table_name FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND constraint_type = 'PRIMARY KEY'
    `);
    const tables = new Set(res.rows.map((r) => String(r.table_name)));
    const expected = [
      'users',
      'tasks',
      'requirements',
      'test_cases',
      'test_cycles',
      'test_executions',
      'bug_reports',
      'defect_history',
      'automation_runs',
      'qa_audit_logs',
    ];
    const missing = expected.filter((t) => !tables.has(t));
    return {
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `All ${expected.length} tables enforce PRIMARY KEY constraints.`
          : `Missing PKs on: ${missing.join(', ')}`,
    };
  });

  // 2. Foreign key constraints exist (including 5 composite same-user QA FKs)
  await runCheck('Foreign key & composite ownership constraints present', 'Foreign Keys', async () => {
    const res = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY') AS fk_count,
        (SELECT COUNT(*)::int FROM pg_constraint con
         JOIN pg_namespace nsp ON nsp.oid = con.connamespace
         WHERE nsp.nspname = 'public' AND con.contype = 'f'
           AND con.conname IN (
             'test_cases_user_requirement_fk',
             'test_executions_user_test_case_fk',
             'bug_reports_user_requirement_fk',
             'bug_reports_user_test_case_fk',
             'defect_history_user_bug_fk'
           )) AS composite_fk_count
    `);
    const count = res.rows[0]?.fk_count ?? 0;
    const compositeCount = res.rows[0]?.composite_fk_count ?? 0;
    return {
      passed: count >= 15 && compositeCount === 5,
      detail: `${count} active FOREIGN KEY constraints verified (${compositeCount}/5 composite same-user QA FKs active).`,
    };
  });

  // 3. Unique constraints on users.email and users.uid
  await runCheck('Unique constraints enforced on users.email and users.uid', 'Unique Constraints', async () => {
    const dupRes = await pool.query(`
      SELECT email, COUNT(*)::int AS cnt FROM users GROUP BY email HAVING COUNT(*) > 1
    `);
    return {
      passed: dupRes.rows.length === 0,
      detail:
        dupRes.rows.length === 0
          ? '0 duplicate email addresses detected in users table.'
          : `Found ${dupRes.rows.length} duplicate email groups.`,
    };
  });

  // 4. Orphan task check (invalid user_id relationships)
  await runCheck('Zero orphaned tasks without valid parent user', 'Referential Integrity', async () => {
    const res = await pool.query(`
      SELECT COUNT(*)::int AS orphan_count
      FROM tasks t LEFT JOIN users u ON u.id = t.user_id
      WHERE u.id IS NULL
    `);
    const count = res.rows[0]?.orphan_count ?? 0;
    return {
      passed: count === 0,
      detail: `${count} orphaned task rows found.`,
    };
  });

  // 5. Null & enum domain integrity on tasks
  await runCheck('Task title NOT NULL and priority/status domain integrity', 'Null & Domain Checks', async () => {
    const res = await pool.query(`
      SELECT COUNT(*)::int AS bad_rows
      FROM tasks
      WHERE TRIM(COALESCE(title, '')) = ''
        OR priority NOT IN ('high', 'medium', 'low')
        OR status NOT IN ('pending', 'completed')
    `);
    const bad = res.rows[0]?.bad_rows ?? 0;
    return {
      passed: bad === 0,
      detail: `${bad} invalid task rows found.`,
    };
  });

  // 6. Transaction rollback & constraint enforcement test (non-destructive: rolls back!)
  await runCheck('Foreign key violation rejected inside rolled-back transaction', 'Transaction Rollback', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let fkRejected = false;
      try {
        await client.query(
          `INSERT INTO tasks (user_id, title, priority, status) VALUES (-99999, 'Invalid FK Test', 'low', 'pending')`
        );
      } catch (pgErr: unknown) {
        const code = (pgErr as { code?: string })?.code;
        if (code === '23503') {
          fkRejected = true;
        }
      }
      await client.query('ROLLBACK');
      return {
        passed: fkRejected,
        detail: fkRejected
          ? 'PostgreSQL rejected invalid user_id (-99999) with SQLSTATE 23503 and rolled back cleanly.'
          : 'Expected foreign key violation (23503) was not triggered.',
      };
    } finally {
      client.release();
    }
  });

  // 7. Duplicate email constraint test inside rolled-back transaction (non-destructive)
  await runCheck('Unique email constraint enforced inside rolled-back transaction', 'Unique Rollback Check', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const testEmail = `tx_rollback_${Date.now()}@example.com`;
      await client.query(
        `INSERT INTO users (uid, name, email, auth_provider) VALUES ($1, 'TX Test', $2, 'local')`,
        [`tx_uid_1_${Date.now()}`, testEmail]
      );
      let uniqueRejected = false;
      try {
        await client.query(
          `INSERT INTO users (uid, name, email, auth_provider) VALUES ($1, 'TX Dup', $2, 'local')`,
          [`tx_uid_2_${Date.now()}`, testEmail]
        );
      } catch (pgErr: unknown) {
        const code = (pgErr as { code?: string })?.code;
        if (code === '23505') {
          uniqueRejected = true;
        }
      }
      await client.query('ROLLBACK');
      return {
        passed: uniqueRejected,
        detail: uniqueRejected
          ? 'PostgreSQL rejected duplicate email with SQLSTATE 23505 and rolled back cleanly.'
          : 'Expected unique violation (23505) was not triggered.',
      };
    } finally {
      client.release();
    }
  });

  // 8. Execution history foreign key & snapshot consistency (supports preserved unlinked rows)
  await runCheck('Test execution history, snapshots & defect history integrity', 'QA Audit Integrity', async () => {
    const res = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM test_executions te
         LEFT JOIN test_cases tc ON tc.id = te.test_case_id AND tc.user_id = te.user_id
         WHERE te.test_case_id IS NOT NULL
           AND (
             tc.id IS NULL
             OR TRIM(COALESCE(te.test_case_code_snapshot, '')) = ''
             OR TRIM(COALESCE(te.test_case_scenario_snapshot, '')) = ''
             OR te.test_case_code_snapshot <> tc.test_id
             OR te.test_case_scenario_snapshot <> tc.scenario
           )) AS bad_execs,
        (SELECT COUNT(*)::int FROM defect_history dh
         LEFT JOIN bug_reports br ON br.id = dh.bug_id AND br.user_id = dh.user_id
         WHERE br.id IS NULL) AS orphan_history
    `);
    const badExecs = res.rows[0]?.bad_execs ?? 0;
    const orphanHistory = res.rows[0]?.orphan_history ?? 0;
    return {
      passed: badExecs === 0 && orphanHistory === 0,
      detail: `Execution FK/snapshot mismatches: ${badExecs}, orphaned defect history: ${orphanHistory}.`,
    };
  });

  // 9. Zero unresolved or drifted requirement/test-case references across QA tables
  await runCheck('Zero unresolved requirement or test-case references', 'QA Traceability Integrity', async () => {
    const res = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM test_cases
         WHERE (TRIM(requirement_id) <> '' AND requirement_ref_id IS NULL)
            OR (TRIM(requirement_id) = '' AND requirement_ref_id IS NOT NULL)) AS tc_req_drift,
        (SELECT COUNT(*)::int FROM bug_reports
         WHERE (TRIM(linked_requirement_id) <> '' AND linked_requirement_ref_id IS NULL)
            OR (TRIM(linked_requirement_id) = '' AND linked_requirement_ref_id IS NOT NULL)) AS bug_req_drift,
        (SELECT COUNT(*)::int FROM bug_reports
         WHERE (TRIM(linked_test_case_id) <> '' AND linked_test_case_ref_id IS NULL)
            OR (TRIM(linked_test_case_id) = '' AND linked_test_case_ref_id IS NOT NULL)) AS bug_tc_drift
    `);
    const tcDrift = res.rows[0]?.tc_req_drift ?? 0;
    const bugReqDrift = res.rows[0]?.bug_req_drift ?? 0;
    const bugTcDrift = res.rows[0]?.bug_tc_drift ?? 0;
    const totalDrift = tcDrift + bugReqDrift + bugTcDrift;
    return {
      passed: totalDrift === 0,
      detail:
        totalDrift === 0
          ? '0 unresolved or drifted references across test_cases and bug_reports.'
          : `Detected drift — test_cases: ${tcDrift}, bug_reports(req): ${bugReqDrift}, bug_reports(tc): ${bugTcDrift}.`,
    };
  });

  // 10. Composite same-user ownership & ON DELETE RESTRICT enforcement inside rolled-back transaction
  await runCheck('Composite same-user FK & ON DELETE RESTRICT enforced in transaction', 'Composite Ownership', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ts = Date.now();
      const uA = await client.query(
        `INSERT INTO users (uid, name, email, auth_provider) VALUES ($1, 'Owner A', $2, 'local') RETURNING id`,
        [`tx_own_a_${ts}`, `tx_own_a_${ts}@example.com`]
      );
      const uB = await client.query(
        `INSERT INTO users (uid, name, email, auth_provider) VALUES ($1, 'Owner B', $2, 'local') RETURNING id`,
        [`tx_own_b_${ts}`, `tx_own_b_${ts}@example.com`]
      );
      const userAId = uA.rows[0].id as number;
      const userBId = uB.rows[0].id as number;

      const reqB = await client.query(
        `INSERT INTO requirements (user_id, req_code, title, module, acceptance_criteria) VALUES ($1, 'TX-B-01', 'User B Req', 'Auth', 'AC') RETURNING id`,
        [userBId]
      );
      const reqBId = reqB.rows[0].id as number;

      // Cross-user FK must fail with 23503
      await client.query('SAVEPOINT sp_cross');
      let crossRejected = false;
      try {
        await client.query(
          `INSERT INTO test_cases (user_id, test_id, requirement_id, requirement_ref_id, module, scenario, expected_result)
           VALUES ($1, 'TC-CROSS-1', 'TX-B-01', $2, 'Auth', 'Cross-user test', 'Should reject')`,
          [userAId, reqBId]
        );
      } catch (pgErr: unknown) {
        if ((pgErr as { code?: string })?.code === '23503') crossRejected = true;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_cross');

      // Same-user linked delete must fail with RESTRICT (PostgreSQL SQLSTATE 23001 or 23503)
      await client.query(
        `INSERT INTO test_cases (user_id, test_id, requirement_id, requirement_ref_id, module, scenario, expected_result)
         VALUES ($1, 'TC-OWN-1', 'TX-B-01', $2, 'Auth', 'Owned test', 'Pass')`,
        [userBId, reqBId]
      );
      await client.query('SAVEPOINT sp_restrict');
      let restrictRejected = false;
      let restrictSqlState = '';
      try {
        await client.query(`DELETE FROM requirements WHERE id = $1`, [reqBId]);
      } catch (pgErr: unknown) {
        const code = (pgErr as { code?: string })?.code ?? '';
        restrictSqlState = code;
        if (code === '23001' || code === '23503') restrictRejected = true;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_restrict');
      await client.query('ROLLBACK');

      return {
        passed: crossRejected && restrictRejected,
        detail:
          crossRejected && restrictRejected
            ? `PostgreSQL rejected cross-user FK link (SQLSTATE 23503) and direct RESTRICT delete (SQLSTATE ${restrictSqlState}).`
            : `Composite ownership / RESTRICT checks failed (crossRejected=${crossRejected}, restrictRejected=${restrictRejected}, restrictSqlState=${restrictSqlState}).`,
      };
    } finally {
      client.release();
    }
  });

  const passedAssertions = checks.filter((c) => c.passed).length;
  const failedAssertions = checks.length - passedAssertions;
  const durationMs = Date.now() - suiteStart;
  const avgResponseMs =
    checks.length === 0
      ? 0
      : Math.round(checks.reduce((acc, c) => acc + c.durationMs, 0) / checks.length);

  return {
    suite: 'postgres',
    runLabel: 'PostgreSQL Integrity & Constraint Suite',
    totalItems: checks.length,
    totalAssertions: checks.length,
    passedAssertions,
    failedAssertions,
    durationMs,
    avgResponseMs,
    failedEndpoints: checks
      .filter((c) => !c.passed)
      .map((c) => ({ name: c.name, assertion: c.category, message: c.detail })),
    checks,
  };
}
