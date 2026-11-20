import crypto from 'node:crypto';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  automationRuns,
  bugReports,
  defectHistory,
  qaAuditLogs,
  requirements,
  tasks,
  testCases,
  testCycles,
  testExecutions,
  users,
} from './schema.ts';
import { DEFAULT_REQUIREMENTS, DEFAULT_TEST_CASES } from '../lib/qaTemplates.ts';
import { normalizeTestCaseStatus } from '../lib/analytics.ts';
import type {
  AutomationFailedEndpoint,
  AutomationRunRecord,
  BugReportRecord,
  BugStatus,
  CycleStatus,
  DefectHistoryRecord,
  ExecutionOrigin,
  QaAuditLogRecord,
  QaPriority,
  QaRecoveryPreview,
  QaRecoveryResult,
  RequirementCategory,
  RequirementDependencies,
  RequirementRecord,
  Task,
  TaskPriority,
  TaskStatus,
  TestCaseDependencies,
  TestCaseRecord,
  TestCaseStatus,
  TestCycleRecord,
  TestExecutionRecord,
  TestTechnique,
  TestType,
  UserProfile,
} from '../lib/types.ts';

export class DuplicateEmailError extends Error {
  constructor(message = 'An account with this email address already exists.') {
    super(message);
    this.name = 'DuplicateEmailError';
  }
}

export class ReferenceValidationError extends Error {
  details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = 'ReferenceValidationError';
    this.details = details;
  }
}

export class DuplicateCodeError extends Error {
  field: string;

  constructor(message: string, field = 'code') {
    super(message);
    this.name = 'DuplicateCodeError';
    this.field = field;
  }
}

export class LinkedDependenciesError extends Error {
  dependencies: RequirementDependencies | TestCaseDependencies;

  constructor(message: string, dependencies: RequirementDependencies | TestCaseDependencies) {
    super(message);
    this.name = 'LinkedDependenciesError';
    this.dependencies = dependencies;
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; cause?: { code?: string } };
  return err.code === '23505' || err.cause?.code === '23505';
}

function normalizeCode(code: string | undefined | null): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function nextSequentialCode(prefix: string, existingCodes: string[], padLength: number): string {
  const used = new Set(existingCodes.map((c) => c.toUpperCase()));
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  for (const code of existingCodes) {
    const match = code.trim().match(regex);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxNum) maxNum = parsed;
    }
  }
  let candidateNum = Math.max(maxNum + 1, existingCodes.length + 1);
  let candidate = `${prefix}-${String(candidateNum).padStart(padLength, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    candidateNum += 1;
    candidate = `${prefix}-${String(candidateNum).padStart(padLength, '0')}`;
  }
  return candidate;
}

function mapUserRow(row: typeof users.$inferSelect): UserProfile {
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    email: row.email,
    authProvider: row.authProvider === 'google' ? 'google' : 'local',
    createdAt: row.createdAt.toISOString(),
  };
}

function mapTaskRow(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    dueDate: row.dueDate ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRequirementRow(row: typeof requirements.$inferSelect): RequirementRecord {
  return {
    id: row.id,
    userId: row.userId,
    reqCode: row.reqCode,
    title: row.title,
    category: (row.category === 'Non-Functional' ? 'Non-Functional' : 'Functional') as RequirementCategory,
    module: row.module,
    userStory: row.userStory,
    acceptanceCriteria: row.acceptanceCriteria,
    priority: row.priority as QaPriority,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTestCaseRow(row: typeof testCases.$inferSelect): TestCaseRecord {
  return {
    id: row.id,
    userId: row.userId,
    testId: row.testId,
    requirementId: row.requirementId,
    requirementRefId: row.requirementRefId ?? null,
    module: row.module,
    testType: row.testType as TestType,
    technique: (row.technique || 'Positive Testing') as TestTechnique,
    scenario: row.scenario,
    preconditions: row.preconditions,
    testData: row.testData,
    executionSteps: row.executionSteps,
    expectedResult: row.expectedResult,
    actualResult: row.actualResult,
    priority: row.priority as QaPriority,
    status: normalizeTestCaseStatus(row.status),
    tester: row.tester || '',
    defectId: row.defectId,
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapTestCycleRow(row: typeof testCycles.$inferSelect): TestCycleRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    scope: row.scope,
    executionOrigin:
      row.executionOrigin === 'External User / Client'
        ? 'External User / Client'
        : 'Internal QA',
    environment: row.environment,
    status: row.status as CycleStatus,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBugRow(row: typeof bugReports.$inferSelect): BugReportRecord {
  return {
    id: row.id,
    userId: row.userId,
    bugCode: row.bugCode,
    title: row.title,
    description: row.description,
    module: row.module,
    environment: row.environment,
    browserDevice: row.browserDevice,
    precondition: row.precondition,
    stepsToReproduce: row.stepsToReproduce,
    expectedResult: row.expectedResult,
    actualResult: row.actualResult,
    severity: row.severity as QaPriority,
    priority: row.priority as QaPriority,
    status: row.status as BugStatus,
    assignedDeveloper: row.assignedDeveloper,
    reporter: row.reporter,
    linkedRequirementId: row.linkedRequirementId,
    linkedRequirementRefId: row.linkedRequirementRefId ?? null,
    linkedTestCaseId: row.linkedTestCaseId,
    linkedTestCaseRefId: row.linkedTestCaseRefId ?? null,
    gitlabIssueId: row.gitlabIssueId,
    gitlabIssueUrl: row.gitlabIssueUrl,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDefectHistoryRow(row: typeof defectHistory.$inferSelect): DefectHistoryRecord {
  return {
    id: row.id,
    userId: row.userId,
    bugId: row.bugId,
    actor: row.actor,
    action: row.action as DefectHistoryRecord['action'],
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapQaAuditLogRow(row: typeof qaAuditLogs.$inferSelect): QaAuditLogRecord {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.detailsJson);
    if (parsed && typeof parsed === 'object') details = parsed as Record<string, unknown>;
  } catch {
    details = {};
  }
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    entityCode: row.entityCode,
    action: row.action,
    actor: row.actor,
    details,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAutomationRunRow(row: typeof automationRuns.$inferSelect): AutomationRunRecord {
  let parsedFailed: AutomationFailedEndpoint[] = [];
  try {
    const raw = JSON.parse(row.failedEndpointsJson);
    if (Array.isArray(raw)) parsedFailed = raw;
  } catch {
    parsedFailed = [];
  }
  return {
    id: row.id,
    userId: row.userId,
    suite: row.suite as AutomationRunRecord['suite'],
    runLabel: row.runLabel,
    totalItems: row.totalItems,
    totalAssertions: row.totalAssertions,
    passedAssertions: row.passedAssertions,
    failedAssertions: row.failedAssertions,
    durationMs: row.durationMs,
    avgResponseMs: row.avgResponseMs,
    failedEndpoints: parsedFailed,
    reportPath: row.reportPath,
    executedAt: row.executedAt.toISOString(),
  };
}

// ── Users ────────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed (findUserByEmail):', error);
    throw new Error('Failed to look up user account.', { cause: error });
  }
}

export async function findUserById(id: number): Promise<UserProfile | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  } catch (error) {
    console.error('Database query failed (findUserById):', error);
    throw new Error('Failed to retrieve user profile.', { cause: error });
  }
}

export async function findUserRecordById(id: number) {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed (findUserRecordById):', error);
    throw new Error('Failed to retrieve user credentials.', { cause: error });
  }
}

export async function createLocalUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<UserProfile> {
  try {
    const normalizedEmail = input.email.toLowerCase();
    const uid = `local_${crypto.randomUUID()}`;
    const inserted = await db
      .insert(users)
      .values({
        uid,
        name: input.name,
        email: normalizedEmail,
        passwordHash: input.passwordHash,
        authProvider: 'local',
      })
      .returning();
    return mapUserRow(inserted[0]);
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new DuplicateEmailError();
    }
    console.error('Database insert failed (createLocalUser):', error);
    throw new Error('Failed to create user account.', { cause: error });
  }
}

export async function getOrCreateGoogleUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  try {
    const normalizedEmail = email.toLowerCase();
    const safeName = (displayName && displayName.trim()) || normalizedEmail.split('@')[0];

    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail[0] && existingByEmail[0].uid !== uid) {
      const updated = await db
        .update(users)
        .set({ uid, name: existingByEmail[0].name || safeName })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      return mapUserRow(updated[0]);
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        name: safeName,
        email: normalizedEmail,
        authProvider: 'google',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: normalizedEmail },
      })
      .returning();

    return mapUserRow(result[0]);
  } catch (error) {
    console.error('Database upsert failed (getOrCreateGoogleUser):', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function updateUserProfile(
  userId: number,
  input: { name: string; email: string }
): Promise<UserProfile> {
  try {
    const normalizedEmail = input.email.toLowerCase();
    const updated = await db
      .update(users)
      .set({ name: input.name, email: normalizedEmail })
      .where(eq(users.id, userId))
      .returning();
    if (!updated[0]) {
      throw new Error('User not found.');
    }
    return mapUserRow(updated[0]);
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new DuplicateEmailError('That email address is already registered to another account.');
    }
    console.error('Database update failed (updateUserProfile):', error);
    throw new Error('Failed to update profile.', { cause: error });
  }
}

export async function updateUserPasswordHash(userId: number, passwordHash: string): Promise<void> {
  try {
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  } catch (error) {
    console.error('Database update failed (updateUserPasswordHash):', error);
    throw new Error('Failed to update password.', { cause: error });
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────

export async function listUserTasks(userId: number): Promise<Task[]> {
  try {
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt), desc(tasks.id));
    return rows.map(mapTaskRow);
  } catch (error) {
    console.error('Database query failed (listUserTasks):', error);
    throw new Error('Failed to retrieve tasks.', { cause: error });
  }
}

export async function findTaskById(taskId: number): Promise<Task | null> {
  try {
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    return rows[0] ? mapTaskRow(rows[0]) : null;
  } catch (error) {
    console.error('Database query failed (findTaskById):', error);
    throw new Error('Failed to retrieve task.', { cause: error });
  }
}

export async function createTaskRecord(
  userId: number,
  input: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
  }
): Promise<Task> {
  try {
    const inserted = await db
      .insert(tasks)
      .values({
        userId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate,
      })
      .returning();
    return mapTaskRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (createTaskRecord):', error);
    throw new Error('Failed to create task.', { cause: error });
  }
}

export async function updateTaskRecord(
  taskId: number,
  userId: number,
  input: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
  }
): Promise<Task | null> {
  try {
    const updated = await db
      .update(tasks)
      .set({
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning();
    return updated[0] ? mapTaskRow(updated[0]) : null;
  } catch (error) {
    console.error('Database update failed (updateTaskRecord):', error);
    throw new Error('Failed to update task.', { cause: error });
  }
}

export async function updateTaskStatusRecord(
  taskId: number,
  userId: number,
  status: TaskStatus
): Promise<Task | null> {
  try {
    const updated = await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning();
    return updated[0] ? mapTaskRow(updated[0]) : null;
  } catch (error) {
    console.error('Database update failed (updateTaskStatusRecord):', error);
    throw new Error('Failed to update task status.', { cause: error });
  }
}

export async function deleteTaskRecord(taskId: number, userId: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database delete failed (deleteTaskRecord):', error);
    throw new Error('Failed to delete task.', { cause: error });
  }
}

export async function seedSampleTasksForUser(userId: number): Promise<Task[]> {
  try {
    const now = new Date();
    const formatOffset = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const sampleRows = [
      {
        userId,
        title: 'Execute Postman API regression suite',
        description: 'Validate status codes, schema payloads, and auth guards across all REST endpoints.',
        priority: 'high',
        status: 'pending',
        dueDate: formatOffset(-2),
      },
      {
        userId,
        title: 'Verify PostgreSQL user isolation queries',
        description: 'Ensure cross-account task access returns HTTP 403 and leaves foreign records intact.',
        priority: 'high',
        status: 'pending',
        dueDate: formatOffset(2),
      },
      {
        userId,
        title: 'Document registration form boundary test cases',
        description: 'Cover invalid email strings, duplicate addresses, and password strength rules.',
        priority: 'medium',
        status: 'completed',
        dueDate: formatOffset(-1),
      },
      {
        userId,
        title: 'Audit dashboard completion percentage calculation',
        description: 'Compare UI KPI strip against GET /api/dashboard/stats and SQL FILTER counts.',
        priority: 'low',
        status: 'pending',
        dueDate: formatOffset(5),
      },
    ];

    const inserted = await db.insert(tasks).values(sampleRows).returning();
    return inserted.map(mapTaskRow);
  } catch (error) {
    console.error('Database seed failed (seedSampleTasksForUser):', error);
    throw new Error('Failed to load sample tasks.', { cause: error });
  }
}

// ── Requirements Engineering (SRS & RTM) ─────────────────────────────────

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveOwnedRequirement(
  executor: DbExecutor,
  userId: number,
  rawCode: string | undefined | null
): Promise<{ reqCode: string; requirementRefId: number | null }> {
  const code = normalizeCode(rawCode);
  if (!code) {
    return { reqCode: '', requirementRefId: null };
  }
  const rows = await executor
    .select({ id: requirements.id, reqCode: requirements.reqCode })
    .from(requirements)
    .where(
      and(
        eq(requirements.userId, userId),
        sql`UPPER(TRIM(${requirements.reqCode})) = ${code}`
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new ReferenceValidationError(
      `Requirement "${code}" does not exist in your workspace.`,
      { requirementId: `Requirement "${code}" was not found for your account.` }
    );
  }
  return { reqCode: rows[0].reqCode, requirementRefId: rows[0].id };
}

async function resolveOwnedTestCase(
  executor: DbExecutor,
  userId: number,
  rawCode: string | undefined | null
): Promise<{ testId: string; testCaseRefId: number | null }> {
  const code = normalizeCode(rawCode);
  if (!code) {
    return { testId: '', testCaseRefId: null };
  }
  const rows = await executor
    .select({ id: testCases.id, testId: testCases.testId })
    .from(testCases)
    .where(
      and(
        eq(testCases.userId, userId),
        sql`UPPER(TRIM(${testCases.testId})) = ${code}`
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new ReferenceValidationError(
      `Test case "${code}" does not exist in your workspace.`,
      { linkedTestCaseId: `Test case "${code}" was not found for your account.` }
    );
  }
  return { testId: rows[0].testId, testCaseRefId: rows[0].id };
}

export async function ensureRequirementsSeeded(userId: number): Promise<RequirementRecord[]> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`qa_seed_req:${userId}`}))`
      );

      const userRows = await tx
        .select({ initialized: users.qaRequirementsInitialized })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userRows[0]?.initialized) {
        const existing = await tx
          .select()
          .from(requirements)
          .where(eq(requirements.userId, userId))
          .orderBy(asc(requirements.reqCode), asc(requirements.id));
        return existing.map(mapRequirementRow);
      }

      // Fresh or partially-initialised workspace: reconcile missing defaults without duplicating or overwriting existing/custom rows
      await tx
        .insert(requirements)
        .values(
          DEFAULT_REQUIREMENTS.map((tpl) => ({
            userId,
            reqCode: tpl.reqCode,
            title: tpl.title,
            category: tpl.category,
            module: tpl.module,
            userStory: tpl.userStory,
            acceptanceCriteria: tpl.acceptanceCriteria,
            priority: tpl.priority,
          }))
        )
        .onConflictDoNothing({
          target: [requirements.userId, requirements.reqCode],
        });

      const reconciled = await tx
        .select()
        .from(requirements)
        .where(eq(requirements.userId, userId))
        .orderBy(asc(requirements.reqCode), asc(requirements.id));

      await tx
        .update(users)
        .set({ qaRequirementsInitialized: true })
        .where(eq(users.id, userId));

      return reconciled.map(mapRequirementRow);
    });
  } catch (error) {
    console.error('Database query failed (ensureRequirementsSeeded):', error);
    throw new Error('Failed to load SRS requirements.', { cause: error });
  }
}

export async function listOrInitRequirements(userId: number): Promise<RequirementRecord[]> {
  return ensureRequirementsSeeded(userId);
}

export async function createRequirementRecord(
  userId: number,
  input: {
    reqCode: string;
    title: string;
    category: RequirementCategory;
    module: string;
    userStory: string;
    acceptanceCriteria: string;
    priority: QaPriority;
  }
): Promise<RequirementRecord> {
  try {
    const normalizedReqCode = normalizeCode(input.reqCode);
    const inserted = await db
      .insert(requirements)
      .values({
        userId,
        reqCode: normalizedReqCode,
        title: input.title,
        category: input.category,
        module: input.module,
        userStory: input.userStory,
        acceptanceCriteria: input.acceptanceCriteria,
        priority: input.priority,
      })
      .returning();
    return mapRequirementRow(inserted[0]);
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new DuplicateCodeError(
        `Requirement ID "${normalizeCode(input.reqCode)}" already exists in your workspace.`,
        'reqCode'
      );
    }
    console.error('Database insert failed (createRequirementRecord):', error);
    throw new Error('Failed to create requirement.', { cause: error });
  }
}

export async function updateRequirementRecord(
  id: number,
  userId: number,
  input: {
    reqCode?: string;
    title?: string;
    category?: RequirementCategory;
    module?: string;
    userStory?: string;
    acceptanceCriteria?: string;
    priority?: QaPriority;
  },
  actor = 'QA Engineer'
): Promise<RequirementRecord | null> {
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(requirements)
        .where(and(eq(requirements.id, id), eq(requirements.userId, userId)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) return null;

      const patch: Partial<typeof requirements.$inferInsert> = { updatedAt: new Date() };
      const normalizedNewCode =
        input.reqCode !== undefined ? normalizeCode(input.reqCode) : undefined;
      if (normalizedNewCode !== undefined) patch.reqCode = normalizedNewCode;
      if (input.title !== undefined) patch.title = input.title;
      if (input.category !== undefined) patch.category = input.category;
      if (input.module !== undefined) patch.module = input.module;
      if (input.userStory !== undefined) patch.userStory = input.userStory;
      if (input.acceptanceCriteria !== undefined)
        patch.acceptanceCriteria = input.acceptanceCriteria;
      if (input.priority !== undefined) patch.priority = input.priority;

      const updated = await tx
        .update(requirements)
        .set(patch)
        .where(and(eq(requirements.id, id), eq(requirements.userId, userId)))
        .returning();
      const saved = updated[0];
      if (!saved) return null;

      if (normalizedNewCode && normalizedNewCode !== existing.reqCode) {
        const updatedTcs = await tx
          .update(testCases)
          .set({ requirementId: normalizedNewCode })
          .where(and(eq(testCases.userId, userId), eq(testCases.requirementRefId, id)))
          .returning({ id: testCases.id, testId: testCases.testId });

        const updatedBugs = await tx
          .update(bugReports)
          .set({ linkedRequirementId: normalizedNewCode, updatedAt: new Date() })
          .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedRequirementRefId, id)))
          .returning({ id: bugReports.id, bugCode: bugReports.bugCode });

        await tx.insert(qaAuditLogs).values({
          userId,
          entityType: 'requirement',
          entityId: id,
          entityCode: normalizedNewCode,
          action: 'reference_renamed',
          actor,
          detailsJson: JSON.stringify({
            previousCode: existing.reqCode,
            newCode: normalizedNewCode,
            propagatedTestCases: updatedTcs.map((t) => ({ id: t.id, testId: t.testId })),
            propagatedBugReports: updatedBugs.map((b) => ({ id: b.id, bugCode: b.bugCode })),
          }),
        });
      }

      return mapRequirementRow(saved);
    });
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new DuplicateCodeError(
        `Requirement ID "${normalizeCode(input.reqCode)}" already exists in your workspace.`,
        'reqCode'
      );
    }
    console.error('Database update failed (updateRequirementRecord):', error);
    throw new Error('Failed to update requirement.', { cause: error });
  }
}

export async function getRequirementDependencies(
  id: number,
  userId: number,
  executor: DbExecutor = db
): Promise<RequirementDependencies | null> {
  const reqRows = await executor
    .select({ id: requirements.id, reqCode: requirements.reqCode, title: requirements.title })
    .from(requirements)
    .where(and(eq(requirements.id, id), eq(requirements.userId, userId)))
    .limit(1);
  const reqRow = reqRows[0];
  if (!reqRow) return null;

  const linkedTcs = await executor
    .select({ id: testCases.id, testId: testCases.testId, scenario: testCases.scenario })
    .from(testCases)
    .where(and(eq(testCases.userId, userId), eq(testCases.requirementRefId, id)))
    .orderBy(asc(testCases.testId));

  const linkedBugs = await executor
    .select({
      id: bugReports.id,
      bugCode: bugReports.bugCode,
      title: bugReports.title,
      status: bugReports.status,
    })
    .from(bugReports)
    .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedRequirementRefId, id)))
    .orderBy(asc(bugReports.bugCode));

  return {
    requirement: reqRow,
    linkedTestCases: linkedTcs,
    linkedBugReports: linkedBugs,
    totalLinked: linkedTcs.length + linkedBugs.length,
  };
}

export async function deleteRequirementRecord(
  id: number,
  userId: number,
  actor = 'QA Engineer',
  options: { confirmUnlink?: boolean } = {}
): Promise<{
  deleted: boolean;
  unlinkedTestCasesCount: number;
  unlinkedBugReportsCount: number;
}> {
  try {
    return await db.transaction(async (tx) => {
      const deps = await getRequirementDependencies(id, userId, tx);
      if (!deps) {
        return { deleted: false, unlinkedTestCasesCount: 0, unlinkedBugReportsCount: 0 };
      }

      if (deps.totalLinked > 0 && !options.confirmUnlink) {
        throw new LinkedDependenciesError(
          `Requirement ${deps.requirement.reqCode} is linked to ${deps.linkedTestCases.length} test case(s) and ${deps.linkedBugReports.length} defect(s). Explicit confirmation is required to unlink before deletion.`,
          deps
        );
      }

      if (deps.linkedTestCases.length > 0) {
        await tx
          .update(testCases)
          .set({ requirementRefId: null, requirementId: '' })
          .where(and(eq(testCases.userId, userId), eq(testCases.requirementRefId, id)));
      }

      if (deps.linkedBugReports.length > 0) {
        await tx
          .update(bugReports)
          .set({ linkedRequirementRefId: null, linkedRequirementId: '', updatedAt: new Date() })
          .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedRequirementRefId, id)));

        await tx.insert(defectHistory).values(
          deps.linkedBugReports.map((bug) => ({
            userId,
            bugId: bug.id,
            actor,
            action: 'Reference Unlinked',
            fromStatus: bug.status,
            toStatus: bug.status,
            comment: `Unlinked deleted requirement ${deps.requirement.reqCode} (ID #${deps.requirement.id}) prior to confirmed requirement deletion.`,
          }))
        );
      }

      if (deps.totalLinked > 0) {
        await tx.insert(qaAuditLogs).values({
          userId,
          entityType: 'requirement',
          entityId: deps.requirement.id,
          entityCode: deps.requirement.reqCode,
          action: 'unlink_and_delete',
          actor,
          detailsJson: JSON.stringify({
            requirementTitle: deps.requirement.title,
            unlinkedTestCases: deps.linkedTestCases,
            unlinkedBugReports: deps.linkedBugReports,
          }),
        });
      }

      const deleted = await tx
        .delete(requirements)
        .where(and(eq(requirements.id, id), eq(requirements.userId, userId)))
        .returning({ id: requirements.id });

      return {
        deleted: deleted.length > 0,
        unlinkedTestCasesCount: deps.linkedTestCases.length,
        unlinkedBugReportsCount: deps.linkedBugReports.length,
      };
    });
  } catch (error) {
    if (error instanceof LinkedDependenciesError) throw error;
    console.error('Database delete failed (deleteRequirementRecord):', error);
    throw new Error('Failed to delete requirement.', { cause: error });
  }
}

// ── Test Design & Test Cases ─────────────────────────────────────────────

export async function listOrInitTestCases(userId: number): Promise<TestCaseRecord[]> {
  try {
    // Always ensure requirements exist first in canonical lock order
    await ensureRequirementsSeeded(userId);

    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`qa_seed_tc:${userId}`}))`
      );

      const userRows = await tx
        .select({ initialized: users.qaTestCasesInitialized })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userRows[0]?.initialized) {
        const existing = await tx
          .select()
          .from(testCases)
          .where(eq(testCases.userId, userId))
          .orderBy(asc(testCases.testId), asc(testCases.id));
        return existing.map(mapTestCaseRow);
      }

      const ownedReqs = await tx
        .select({ id: requirements.id, reqCode: requirements.reqCode })
        .from(requirements)
        .where(eq(requirements.userId, userId));
      const reqMap = new Map<string, { id: number; reqCode: string }>();
      for (const r of ownedReqs) {
        reqMap.set(normalizeCode(r.reqCode), r);
      }

      // Reconcile any partial pre-existing test cases missing requirement_ref_id
      const partialUnresolved = await tx
        .select({ id: testCases.id, requirementId: testCases.requirementId })
        .from(testCases)
        .where(and(eq(testCases.userId, userId), isNull(testCases.requirementRefId)));
      for (const tc of partialUnresolved) {
        const match = reqMap.get(normalizeCode(tc.requirementId));
        if (match) {
          await tx
            .update(testCases)
            .set({ requirementId: match.reqCode, requirementRefId: match.id })
            .where(and(eq(testCases.id, tc.id), eq(testCases.userId, userId)));
        }
      }

      await tx
        .insert(testCases)
        .values(
          DEFAULT_TEST_CASES.map((tpl) => {
            const matchedReq = reqMap.get(normalizeCode(tpl.requirementId));
            return {
              userId,
              testId: tpl.testId,
              requirementId: matchedReq ? matchedReq.reqCode : '',
              requirementRefId: matchedReq ? matchedReq.id : null,
              module: tpl.module,
              testType: tpl.testType,
              technique: tpl.technique,
              scenario: tpl.scenario,
              preconditions: tpl.preconditions,
              testData: tpl.testData,
              executionSteps: tpl.executionSteps,
              expectedResult: tpl.expectedResult,
              actualResult: '',
              priority: tpl.priority,
              status: 'Not Run',
              tester: '',
              defectId: '',
            };
          })
        )
        .onConflictDoNothing({
          target: [testCases.userId, testCases.testId],
        });

      const reconciled = await tx
        .select()
        .from(testCases)
        .where(eq(testCases.userId, userId))
        .orderBy(asc(testCases.testId), asc(testCases.id));

      await tx
        .update(users)
        .set({ qaTestCasesInitialized: true })
        .where(eq(users.id, userId));

      return reconciled.map(mapTestCaseRow);
    });
  } catch (error) {
    console.error('Database query failed (listOrInitTestCases):', error);
    throw new Error('Failed to load QA test cases.', { cause: error });
  }
}

export async function createTestCaseRecord(
  userId: number,
  input: {
    testId: string;
    requirementId: string;
    module: string;
    testType: TestType;
    technique: TestTechnique;
    scenario: string;
    preconditions: string;
    testData: string;
    executionSteps: string;
    expectedResult: string;
    priority: QaPriority;
  }
): Promise<TestCaseRecord> {
  try {
    const resolvedReq = await resolveOwnedRequirement(db, userId, input.requirementId);
    const normalizedTestId = normalizeCode(input.testId);

    const inserted = await db
      .insert(testCases)
      .values({
        userId,
        testId: normalizedTestId,
        requirementId: resolvedReq.reqCode,
        requirementRefId: resolvedReq.requirementRefId,
        module: input.module,
        testType: input.testType,
        technique: input.technique,
        scenario: input.scenario,
        preconditions: input.preconditions,
        testData: input.testData,
        executionSteps: input.executionSteps,
        expectedResult: input.expectedResult,
        actualResult: '',
        status: 'Not Run',
        tester: '',
        defectId: '',
      })
      .returning();
    return mapTestCaseRow(inserted[0]);
  } catch (error) {
    if (error instanceof ReferenceValidationError) throw error;
    if (isPgUniqueViolation(error)) {
      throw new DuplicateCodeError(
        `Test case ID "${normalizeCode(input.testId)}" already exists in your workspace.`,
        'testId'
      );
    }
    console.error('Database insert failed (createTestCaseRecord):', error);
    throw new Error('Failed to create test case.', { cause: error });
  }
}

export async function updateTestCaseRecord(
  id: number,
  userId: number,
  patch: {
    testId?: string;
    requirementId?: string;
    module?: string;
    testType?: TestType;
    technique?: TestTechnique;
    scenario?: string;
    preconditions?: string;
    testData?: string;
    executionSteps?: string;
    expectedResult?: string;
    actualResult?: string;
    priority?: QaPriority;
    status?: TestCaseStatus;
    tester?: string;
    defectId?: string;
  },
  actor = 'QA Engineer'
): Promise<TestCaseRecord | null> {
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(testCases)
        .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) return null;

      const updateValues: Partial<typeof testCases.$inferInsert> = {};
      const normalizedTestId =
        patch.testId !== undefined ? normalizeCode(patch.testId) : undefined;
      if (normalizedTestId !== undefined) updateValues.testId = normalizedTestId;
      if (patch.requirementId !== undefined) {
        const resolvedReq = await resolveOwnedRequirement(tx, userId, patch.requirementId);
        updateValues.requirementId = resolvedReq.reqCode;
        updateValues.requirementRefId = resolvedReq.requirementRefId;
      }
      if (patch.module !== undefined) updateValues.module = patch.module;
      if (patch.testType !== undefined) updateValues.testType = patch.testType;
      if (patch.technique !== undefined) updateValues.technique = patch.technique;
      if (patch.scenario !== undefined) updateValues.scenario = patch.scenario;
      if (patch.preconditions !== undefined) updateValues.preconditions = patch.preconditions;
      if (patch.testData !== undefined) updateValues.testData = patch.testData;
      if (patch.executionSteps !== undefined) updateValues.executionSteps = patch.executionSteps;
      if (patch.expectedResult !== undefined) updateValues.expectedResult = patch.expectedResult;
      if (patch.actualResult !== undefined) updateValues.actualResult = patch.actualResult;
      if (patch.priority !== undefined) updateValues.priority = patch.priority;
      if (patch.tester !== undefined) updateValues.tester = patch.tester;
      if (patch.defectId !== undefined) updateValues.defectId = patch.defectId;
      if (patch.status !== undefined) {
        const normalized = normalizeTestCaseStatus(patch.status);
        updateValues.status = normalized;
        updateValues.executedAt = normalized === 'Not Run' ? null : new Date();
      }

      const updated = await tx
        .update(testCases)
        .set(updateValues)
        .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
        .returning();
      const saved = updated[0];
      if (!saved) return null;

      const testIdChanged = Boolean(normalizedTestId && normalizedTestId !== existing.testId);
      const scenarioChanged = Boolean(
        patch.scenario !== undefined && patch.scenario !== existing.scenario
      );

      if (testIdChanged) {
        const updatedBugs = await tx
          .update(bugReports)
          .set({ linkedTestCaseId: saved.testId, updatedAt: new Date() })
          .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedTestCaseRefId, id)))
          .returning({ id: bugReports.id, bugCode: bugReports.bugCode });

        await tx.insert(qaAuditLogs).values({
          userId,
          entityType: 'test_case',
          entityId: id,
          entityCode: saved.testId,
          action: 'reference_renamed',
          actor,
          detailsJson: JSON.stringify({
            previousCode: existing.testId,
            newCode: saved.testId,
            propagatedBugReports: updatedBugs.map((b) => ({ id: b.id, bugCode: b.bugCode })),
          }),
        });
      }

      if (testIdChanged || scenarioChanged) {
        await tx
          .update(testExecutions)
          .set({
            testCaseCodeSnapshot: saved.testId,
            testCaseScenarioSnapshot: saved.scenario,
          })
          .where(and(eq(testExecutions.userId, userId), eq(testExecutions.testCaseId, id)));
      }

      return mapTestCaseRow(saved);
    });
  } catch (error) {
    if (error instanceof ReferenceValidationError) throw error;
    if (isPgUniqueViolation(error)) {
      throw new DuplicateCodeError(
        `Test case ID "${normalizeCode(patch.testId)}" already exists in your workspace.`,
        'testId'
      );
    }
    console.error('Database update failed (updateTestCaseRecord):', error);
    throw new Error('Failed to update test case.', { cause: error });
  }
}

export async function duplicateTestCaseRecord(
  id: number,
  userId: number
): Promise<TestCaseRecord | null> {
  try {
    const existingRows = await db
      .select()
      .from(testCases)
      .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
      .limit(1);
    const source = existingRows[0];
    if (!source) return null;

    const allForUser = await db
      .select({ testId: testCases.testId })
      .from(testCases)
      .where(eq(testCases.userId, userId));
    const newTestId = nextSequentialCode(
      'TC',
      allForUser.map((r) => r.testId),
      3
    );

    const inserted = await db
      .insert(testCases)
      .values({
        userId,
        testId: newTestId,
        requirementId: source.requirementId,
        requirementRefId: source.requirementRefId ?? null,
        module: source.module,
        testType: source.testType,
        technique: source.technique,
        scenario: `${source.scenario} (Copy)`.slice(0, 240),
        preconditions: source.preconditions,
        testData: source.testData,
        executionSteps: source.executionSteps,
        expectedResult: source.expectedResult,
        actualResult: '',
        priority: source.priority,
        status: 'Not Run',
        tester: '',
        defectId: '',
        executedAt: null,
      })
      .returning();

    return mapTestCaseRow(inserted[0]);
  } catch (error) {
    console.error('Database duplicate failed (duplicateTestCaseRecord):', error);
    throw new Error('Failed to duplicate test case.', { cause: error });
  }
}

export async function getTestCaseDependencies(
  id: number,
  userId: number,
  executor: DbExecutor = db
): Promise<TestCaseDependencies | null> {
  const tcRows = await executor
    .select({ id: testCases.id, testId: testCases.testId, scenario: testCases.scenario })
    .from(testCases)
    .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
    .limit(1);
  const tcRow = tcRows[0];
  if (!tcRow) return null;

  const execRows = await executor
    .select({ id: testExecutions.id })
    .from(testExecutions)
    .where(and(eq(testExecutions.userId, userId), eq(testExecutions.testCaseId, id)));

  const linkedBugs = await executor
    .select({
      id: bugReports.id,
      bugCode: bugReports.bugCode,
      title: bugReports.title,
      status: bugReports.status,
    })
    .from(bugReports)
    .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedTestCaseRefId, id)))
    .orderBy(asc(bugReports.bugCode));

  return {
    testCase: tcRow,
    linkedExecutionsCount: execRows.length,
    linkedBugReports: linkedBugs,
    totalLinked: execRows.length + linkedBugs.length,
  };
}

export async function deleteTestCaseRecord(
  id: number,
  userId: number,
  actor = 'QA Engineer',
  options: { confirmUnlink?: boolean } = {}
): Promise<{
  deleted: boolean;
  preservedExecutionsCount: number;
  unlinkedBugReportsCount: number;
}> {
  try {
    return await db.transaction(async (tx) => {
      const deps = await getTestCaseDependencies(id, userId, tx);
      if (!deps) {
        return { deleted: false, preservedExecutionsCount: 0, unlinkedBugReportsCount: 0 };
      }

      if (deps.totalLinked > 0 && !options.confirmUnlink) {
        throw new LinkedDependenciesError(
          `Test case ${deps.testCase.testId} is linked to ${deps.linkedExecutionsCount} execution run(s) and ${deps.linkedBugReports.length} defect(s). Explicit confirmation is required to preserve history and unlink before deletion.`,
          deps
        );
      }

      let preservedExecutionIds: number[] = [];
      if (deps.linkedExecutionsCount > 0) {
        const preserved = await tx
          .update(testExecutions)
          .set({
            testCaseCodeSnapshot: deps.testCase.testId,
            testCaseScenarioSnapshot: deps.testCase.scenario,
            testCaseId: null,
          })
          .where(and(eq(testExecutions.userId, userId), eq(testExecutions.testCaseId, id)))
          .returning({ id: testExecutions.id });
        preservedExecutionIds = preserved.map((r) => r.id);
      }

      if (deps.linkedBugReports.length > 0) {
        await tx
          .update(bugReports)
          .set({ linkedTestCaseRefId: null, linkedTestCaseId: '', updatedAt: new Date() })
          .where(and(eq(bugReports.userId, userId), eq(bugReports.linkedTestCaseRefId, id)));

        await tx.insert(defectHistory).values(
          deps.linkedBugReports.map((bug) => ({
            userId,
            bugId: bug.id,
            actor,
            action: 'Reference Unlinked',
            fromStatus: bug.status,
            toStatus: bug.status,
            comment: `Unlinked deleted test case ${deps.testCase.testId} (ID #${deps.testCase.id}) prior to confirmed test case deletion.`,
          }))
        );
      }

      if (deps.totalLinked > 0) {
        await tx.insert(qaAuditLogs).values({
          userId,
          entityType: 'test_case',
          entityId: deps.testCase.id,
          entityCode: deps.testCase.testId,
          action: 'unlink_and_delete',
          actor,
          detailsJson: JSON.stringify({
            scenario: deps.testCase.scenario,
            preservedExecutionsCount: preservedExecutionIds.length,
            preservedExecutionIds,
            unlinkedBugReports: deps.linkedBugReports,
          }),
        });
      }

      const deleted = await tx
        .delete(testCases)
        .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
        .returning({ id: testCases.id });

      return {
        deleted: deleted.length > 0,
        preservedExecutionsCount: preservedExecutionIds.length,
        unlinkedBugReportsCount: deps.linkedBugReports.length,
      };
    });
  } catch (error) {
    if (error instanceof LinkedDependenciesError) throw error;
    console.error('Database delete failed (deleteTestCaseRecord):', error);
    throw new Error('Failed to delete test case.', { cause: error });
  }
}

// ── Test Cycles & Immutable Execution History ────────────────────────────

export async function listTestCycles(userId: number): Promise<TestCycleRecord[]> {
  try {
    const rows = await db
      .select()
      .from(testCycles)
      .where(eq(testCycles.userId, userId))
      .orderBy(desc(testCycles.createdAt), desc(testCycles.id));
    return rows.map(mapTestCycleRow);
  } catch (error) {
    console.error('Database query failed (listTestCycles):', error);
    throw new Error('Failed to load test cycles.', { cause: error });
  }
}

export async function createTestCycleRecord(
  userId: number,
  input: {
    name: string;
    scope: string;
    executionOrigin: ExecutionOrigin;
    environment: string;
    status: CycleStatus;
    notes: string;
  }
): Promise<TestCycleRecord> {
  try {
    const inserted = await db
      .insert(testCycles)
      .values({
        userId,
        name: input.name,
        scope: input.scope,
        executionOrigin: input.executionOrigin,
        environment: input.environment,
        status: input.status,
        notes: input.notes,
      })
      .returning();
    return mapTestCycleRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (createTestCycleRecord):', error);
    throw new Error('Failed to create test cycle.', { cause: error });
  }
}

export async function updateTestCycleStatus(
  id: number,
  userId: number,
  status: CycleStatus
): Promise<TestCycleRecord | null> {
  try {
    const updated = await db
      .update(testCycles)
      .set({ status })
      .where(and(eq(testCycles.id, id), eq(testCycles.userId, userId)))
      .returning();
    return updated[0] ? mapTestCycleRow(updated[0]) : null;
  } catch (error) {
    console.error('Database update failed (updateTestCycleStatus):', error);
    throw new Error('Failed to update test cycle status.', { cause: error });
  }
}

export async function listTestExecutions(userId: number): Promise<TestExecutionRecord[]> {
  try {
    const rows = await db
      .select({
        exec: testExecutions,
        tcTestId: testCases.testId,
        tcScenario: testCases.scenario,
        cycleName: testCycles.name,
      })
      .from(testExecutions)
      .leftJoin(testCases, eq(testExecutions.testCaseId, testCases.id))
      .leftJoin(testCycles, eq(testExecutions.cycleId, testCycles.id))
      .where(eq(testExecutions.userId, userId))
      .orderBy(desc(testExecutions.executedAt), desc(testExecutions.id));

    return rows.map((r) => ({
      id: r.exec.id,
      userId: r.exec.userId,
      testCaseId: r.exec.testCaseId ?? null,
      cycleId: r.exec.cycleId ?? null,
      testId: r.tcTestId ?? (r.exec.testCaseCodeSnapshot || undefined),
      scenario: r.tcScenario ?? (r.exec.testCaseScenarioSnapshot || undefined),
      testCaseCodeSnapshot: r.exec.testCaseCodeSnapshot,
      testCaseScenarioSnapshot: r.exec.testCaseScenarioSnapshot,
      cycleName: r.cycleName ?? null,
      testType: r.exec.testType,
      executionOrigin:
        r.exec.executionOrigin === 'External User / Client'
          ? 'External User / Client'
          : 'Internal QA',
      environment: r.exec.environment,
      browserDevice: r.exec.browserDevice,
      tester: r.exec.tester,
      testData: r.exec.testData,
      expectedResult: r.exec.expectedResult,
      actualResult: r.exec.actualResult,
      status: normalizeTestCaseStatus(r.exec.status),
      evidence: r.exec.evidence,
      defectId: r.exec.defectId,
      executedAt: r.exec.executedAt.toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed (listTestExecutions):', error);
    throw new Error('Failed to load test execution history.', { cause: error });
  }
}

export async function recordTestExecution(
  userId: number,
  input: {
    testCaseId: number;
    cycleId: number | null;
    testType: string;
    executionOrigin: ExecutionOrigin;
    environment: string;
    browserDevice: string;
    tester: string;
    testData: string;
    expectedResult: string;
    actualResult: string;
    status: 'Pass' | 'Fail' | 'Blocked' | 'Not Run';
    evidence: string;
    defectId: string;
  }
): Promise<{ execution: TestExecutionRecord; testCase: TestCaseRecord } | null> {
  try {
    const tcRows = await db
      .select()
      .from(testCases)
      .where(and(eq(testCases.id, input.testCaseId), eq(testCases.userId, userId)))
      .limit(1);
    const tc = tcRows[0];
    if (!tc) return null;

    let cycleName: string | null = null;
    let validCycleId: number | null = null;
    if (input.cycleId) {
      const cycleRows = await db
        .select()
        .from(testCycles)
        .where(and(eq(testCycles.id, input.cycleId), eq(testCycles.userId, userId)))
        .limit(1);
      if (cycleRows[0]) {
        validCycleId = cycleRows[0].id;
        cycleName = cycleRows[0].name;
      }
    }

    const now = new Date();
    const inserted = await db
      .insert(testExecutions)
      .values({
        userId,
        testCaseId: tc.id,
        testCaseCodeSnapshot: tc.testId,
        testCaseScenarioSnapshot: tc.scenario,
        cycleId: validCycleId,
        testType: input.testType || tc.testType,
        executionOrigin: input.executionOrigin,
        environment: input.environment || 'Localhost / Staging',
        browserDevice: input.browserDevice || 'Chrome · Desktop',
        tester: input.tester,
        testData: input.testData,
        expectedResult: input.expectedResult || tc.expectedResult,
        actualResult: input.actualResult,
        status: input.status,
        evidence: input.evidence,
        defectId: input.defectId,
        executedAt: now,
      })
      .returning();

    const updatedTcRows = await db
      .update(testCases)
      .set({
        status: input.status,
        actualResult: input.actualResult,
        tester: input.tester,
        defectId: input.defectId,
        executedAt: input.status === 'Not Run' ? null : now,
      })
      .where(and(eq(testCases.id, tc.id), eq(testCases.userId, userId)))
      .returning();

    const ex = inserted[0];
    return {
      execution: {
        id: ex.id,
        userId: ex.userId,
        testCaseId: ex.testCaseId ?? null,
        cycleId: ex.cycleId ?? null,
        testId: tc.testId,
        scenario: tc.scenario,
        testCaseCodeSnapshot: ex.testCaseCodeSnapshot,
        testCaseScenarioSnapshot: ex.testCaseScenarioSnapshot,
        cycleName,
        testType: ex.testType,
        executionOrigin:
          ex.executionOrigin === 'External User / Client'
            ? 'External User / Client'
            : 'Internal QA',
        environment: ex.environment,
        browserDevice: ex.browserDevice,
        tester: ex.tester,
        testData: ex.testData,
        expectedResult: ex.expectedResult,
        actualResult: ex.actualResult,
        status: normalizeTestCaseStatus(ex.status),
        evidence: ex.evidence,
        defectId: ex.defectId,
        executedAt: ex.executedAt.toISOString(),
      },
      testCase: mapTestCaseRow(updatedTcRows[0]),
    };
  } catch (error) {
    console.error('Database insert failed (recordTestExecution):', error);
    throw new Error('Failed to record test execution.', { cause: error });
  }
}

// ── Defects & Defect History ─────────────────────────────────────────────

export async function listBugReports(userId: number): Promise<BugReportRecord[]> {
  try {
    const rows = await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.userId, userId))
      .orderBy(desc(bugReports.createdAt), desc(bugReports.id));
    return rows.map(mapBugRow);
  } catch (error) {
    console.error('Database query failed (listBugReports):', error);
    throw new Error('Failed to retrieve bug reports.', { cause: error });
  }
}

export async function findBugReportById(
  id: number,
  userId: number
): Promise<BugReportRecord | null> {
  try {
    const rows = await db
      .select()
      .from(bugReports)
      .where(and(eq(bugReports.id, id), eq(bugReports.userId, userId)))
      .limit(1);
    return rows[0] ? mapBugRow(rows[0]) : null;
  } catch (error) {
    console.error('Database query failed (findBugReportById):', error);
    throw new Error('Failed to retrieve bug report.', { cause: error });
  }
}

export async function createBugReportRecord(
  userId: number,
  input: {
    title: string;
    description: string;
    module: string;
    environment: string;
    browserDevice: string;
    precondition: string;
    stepsToReproduce: string;
    expectedResult: string;
    actualResult: string;
    severity: QaPriority;
    priority: QaPriority;
    assignedDeveloper: string;
    reporter: string;
    linkedRequirementId: string;
    linkedTestCaseId: string;
    evidence: string;
  }
): Promise<BugReportRecord> {
  try {
    return await db.transaction(async (tx) => {
      const resolvedReq = await resolveOwnedRequirement(tx, userId, input.linkedRequirementId);
      const resolvedTc = await resolveOwnedTestCase(tx, userId, input.linkedTestCaseId);

      const existing = await tx
        .select({ bugCode: bugReports.bugCode })
        .from(bugReports)
        .where(eq(bugReports.userId, userId));
      const bugCode = nextSequentialCode(
        'BUG',
        existing.map((r) => r.bugCode),
        3
      );

      const inserted = await tx
        .insert(bugReports)
        .values({
          userId,
          bugCode,
          title: input.title,
          description: input.description,
          module: input.module,
          environment: input.environment || 'Localhost / Staging',
          browserDevice: input.browserDevice || 'Chrome · Desktop',
          precondition: input.precondition,
          stepsToReproduce: input.stepsToReproduce,
          expectedResult: input.expectedResult,
          actualResult: input.actualResult,
          severity: input.severity,
          priority: input.priority,
          status: 'Open',
          assignedDeveloper: input.assignedDeveloper || 'Unassigned',
          reporter: input.reporter || 'QA Engineer',
          linkedRequirementId: resolvedReq.reqCode,
          linkedRequirementRefId: resolvedReq.requirementRefId,
          linkedTestCaseId: resolvedTc.testId,
          linkedTestCaseRefId: resolvedTc.testCaseRefId,
          gitlabIssueId: '',
          gitlabIssueUrl: '',
          evidence: input.evidence,
        })
        .returning();

      const created = inserted[0];
      await tx.insert(defectHistory).values({
        userId,
        bugId: created.id,
        actor: input.reporter || 'QA Engineer',
        action: 'Created',
        fromStatus: '',
        toStatus: 'Open',
        comment: `Logged ${bugCode} (${input.severity} severity · ${input.priority} priority).`,
      });

      return mapBugRow(created);
    });
  } catch (error) {
    if (error instanceof ReferenceValidationError) throw error;
    if (isPgUniqueViolation(error)) {
      throw new DuplicateCodeError('Duplicate bug code generated. Please retry.', 'bugCode');
    }
    console.error('Database insert failed (createBugReportRecord):', error);
    throw new Error('Failed to create bug report.', { cause: error });
  }
}

export async function updateBugReportRecord(
  id: number,
  userId: number,
  actor: string,
  patch: {
    status?: BugStatus;
    title?: string;
    description?: string;
    module?: string;
    environment?: string;
    browserDevice?: string;
    precondition?: string;
    stepsToReproduce?: string;
    expectedResult?: string;
    actualResult?: string;
    severity?: QaPriority;
    priority?: QaPriority;
    assignedDeveloper?: string;
    linkedRequirementId?: string;
    linkedTestCaseId?: string;
    evidence?: string;
    comment?: string;
  }
): Promise<BugReportRecord | null> {
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(bugReports)
        .where(and(eq(bugReports.id, id), eq(bugReports.userId, userId)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) return null;

      const updateValues: Partial<typeof bugReports.$inferInsert> = { updatedAt: new Date() };
      if (patch.status !== undefined) updateValues.status = patch.status;
      if (patch.title !== undefined) updateValues.title = patch.title;
      if (patch.description !== undefined) updateValues.description = patch.description;
      if (patch.module !== undefined) updateValues.module = patch.module;
      if (patch.environment !== undefined) updateValues.environment = patch.environment;
      if (patch.browserDevice !== undefined) updateValues.browserDevice = patch.browserDevice;
      if (patch.precondition !== undefined) updateValues.precondition = patch.precondition;
      if (patch.stepsToReproduce !== undefined) updateValues.stepsToReproduce = patch.stepsToReproduce;
      if (patch.expectedResult !== undefined) updateValues.expectedResult = patch.expectedResult;
      if (patch.actualResult !== undefined) updateValues.actualResult = patch.actualResult;
      if (patch.severity !== undefined) updateValues.severity = patch.severity;
      if (patch.priority !== undefined) updateValues.priority = patch.priority;
      if (patch.assignedDeveloper !== undefined) updateValues.assignedDeveloper = patch.assignedDeveloper;
      if (patch.linkedRequirementId !== undefined) {
        const resolvedReq = await resolveOwnedRequirement(tx, userId, patch.linkedRequirementId);
        updateValues.linkedRequirementId = resolvedReq.reqCode;
        updateValues.linkedRequirementRefId = resolvedReq.requirementRefId;
      }
      if (patch.linkedTestCaseId !== undefined) {
        const resolvedTc = await resolveOwnedTestCase(tx, userId, patch.linkedTestCaseId);
        updateValues.linkedTestCaseId = resolvedTc.testId;
        updateValues.linkedTestCaseRefId = resolvedTc.testCaseRefId;
      }
      if (patch.evidence !== undefined) updateValues.evidence = patch.evidence;

      const updated = await tx
        .update(bugReports)
        .set(updateValues)
        .where(and(eq(bugReports.id, id), eq(bugReports.userId, userId)))
        .returning();

      if (patch.status && patch.status !== existing.status) {
        await tx.insert(defectHistory).values({
          userId,
          bugId: id,
          actor,
          action: 'Status Change',
          fromStatus: existing.status,
          toStatus: patch.status,
          comment: patch.comment || `Transitioned status from ${existing.status} to ${patch.status}.`,
        });
      }

      return updated[0] ? mapBugRow(updated[0]) : null;
    });
  } catch (error) {
    if (error instanceof ReferenceValidationError) throw error;
    console.error('Database update failed (updateBugReportRecord):', error);
    throw new Error('Failed to update bug report.', { cause: error });
  }
}

export async function listDefectHistory(
  bugId: number,
  userId: number
): Promise<DefectHistoryRecord[]> {
  try {
    const rows = await db
      .select()
      .from(defectHistory)
      .where(and(eq(defectHistory.bugId, bugId), eq(defectHistory.userId, userId)))
      .orderBy(desc(defectHistory.createdAt), desc(defectHistory.id));
    return rows.map(mapDefectHistoryRow);
  } catch (error) {
    console.error('Database query failed (listDefectHistory):', error);
    throw new Error('Failed to retrieve defect history.', { cause: error });
  }
}

export async function addBugCommentRecord(
  bugId: number,
  userId: number,
  actor: string,
  comment: string
): Promise<DefectHistoryRecord | null> {
  try {
    const bug = await findBugReportById(bugId, userId);
    if (!bug) return null;

    const inserted = await db
      .insert(defectHistory)
      .values({
        userId,
        bugId,
        actor,
        action: 'Comment',
        fromStatus: bug.status,
        toStatus: bug.status,
        comment,
      })
      .returning();
    return mapDefectHistoryRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (addBugCommentRecord):', error);
    throw new Error('Failed to add comment to defect.', { cause: error });
  }
}

export async function attachGitLabIssueToBug(
  bugId: number,
  userId: number,
  issueId: string,
  issueUrl: string,
  actor: string
): Promise<BugReportRecord | null> {
  try {
    const updated = await db
      .update(bugReports)
      .set({
        gitlabIssueId: issueId,
        gitlabIssueUrl: issueUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(bugReports.id, bugId), eq(bugReports.userId, userId)))
      .returning();

    if (!updated[0]) return null;

    await db.insert(defectHistory).values({
      userId,
      bugId,
      actor,
      action: 'GitLab Sync',
      fromStatus: updated[0].status,
      toStatus: updated[0].status,
      comment: `Created GitLab issue ${issueId} (${issueUrl}).`,
    });

    return mapBugRow(updated[0]);
  } catch (error) {
    console.error('Database update failed (attachGitLabIssueToBug):', error);
    throw new Error('Failed to save GitLab issue reference.', { cause: error });
  }
}

export async function deleteBugReportRecord(id: number, userId: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(bugReports)
      .where(and(eq(bugReports.id, id), eq(bugReports.userId, userId)))
      .returning({ id: bugReports.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database delete failed (deleteBugReportRecord):', error);
    throw new Error('Failed to delete bug report.', { cause: error });
  }
}

// ── Automation Runs (Newman · Playwright · PostgreSQL) ───────────────────

export async function listAutomationRuns(userId: number): Promise<AutomationRunRecord[]> {
  try {
    const rows = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.userId, userId))
      .orderBy(desc(automationRuns.executedAt), desc(automationRuns.id));
    return rows.map(mapAutomationRunRow);
  } catch (error) {
    console.error('Database query failed (listAutomationRuns):', error);
    throw new Error('Failed to load automation runs.', { cause: error });
  }
}

export async function saveAutomationRun(
  userId: number,
  input: {
    suite: 'newman' | 'playwright' | 'postgres';
    runLabel: string;
    totalItems: number;
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
    durationMs: number;
    avgResponseMs: number;
    failedEndpoints: AutomationFailedEndpoint[];
    reportPath?: string;
  }
): Promise<AutomationRunRecord> {
  try {
    const inserted = await db
      .insert(automationRuns)
      .values({
        userId,
        suite: input.suite,
        runLabel: input.runLabel,
        totalItems: input.totalItems,
        totalAssertions: input.totalAssertions,
        passedAssertions: input.passedAssertions,
        failedAssertions: input.failedAssertions,
        durationMs: input.durationMs,
        avgResponseMs: input.avgResponseMs,
        failedEndpointsJson: JSON.stringify(input.failedEndpoints ?? []),
        reportPath: input.reportPath ?? '',
      })
      .returning();
    return mapAutomationRunRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (saveAutomationRun):', error);
    throw new Error('Failed to save automation execution summary.', { cause: error });
  }
}

// ── QA Audit Logs & Administrative Workspace Recovery ────────────────────

export async function listQaAuditLogs(userId: number, limit = 100): Promise<QaAuditLogRecord[]> {
  try {
    const safeLimit = Math.max(1, Math.min(250, limit));
    const rows = await db
      .select()
      .from(qaAuditLogs)
      .where(eq(qaAuditLogs.userId, userId))
      .orderBy(desc(qaAuditLogs.createdAt), desc(qaAuditLogs.id))
      .limit(safeLimit);
    return rows.map(mapQaAuditLogRow);
  } catch (error) {
    console.error('Database query failed (listQaAuditLogs):', error);
    throw new Error('Failed to load QA audit logs.', { cause: error });
  }
}

export async function previewQaWorkspaceRecovery(userId: number): Promise<QaRecoveryPreview> {
  try {
    const [userRow] = await db
      .select({
        qaRequirementsInitialized: users.qaRequirementsInitialized,
        qaTestCasesInitialized: users.qaTestCasesInitialized,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const existingReqs = await db
      .select({ id: requirements.id, reqCode: requirements.reqCode })
      .from(requirements)
      .where(eq(requirements.userId, userId));

    const existingTcs = await db
      .select({
        id: testCases.id,
        testId: testCases.testId,
        scenario: testCases.scenario,
        requirementId: testCases.requirementId,
        requirementRefId: testCases.requirementRefId,
      })
      .from(testCases)
      .where(eq(testCases.userId, userId));

    const existingBugs = await db
      .select({
        id: bugReports.id,
        bugCode: bugReports.bugCode,
        linkedRequirementId: bugReports.linkedRequirementId,
        linkedRequirementRefId: bugReports.linkedRequirementRefId,
        linkedTestCaseId: bugReports.linkedTestCaseId,
        linkedTestCaseRefId: bugReports.linkedTestCaseRefId,
      })
      .from(bugReports)
      .where(eq(bugReports.userId, userId));

    const existingExecs = await db
      .select({
        id: testExecutions.id,
        testCaseId: testExecutions.testCaseId,
        codeSnapshot: testExecutions.testCaseCodeSnapshot,
        scenarioSnapshot: testExecutions.testCaseScenarioSnapshot,
      })
      .from(testExecutions)
      .where(eq(testExecutions.userId, userId));

    const reqCodeSet = new Set(existingReqs.map((r) => normalizeCode(r.reqCode)));
    const reqById = new Map(existingReqs.map((r) => [r.id, r]));
    const tcCodeSet = new Set(existingTcs.map((t) => normalizeCode(t.testId)));
    const tcById = new Map(existingTcs.map((t) => [t.id, t]));

    const missingDefaultRequirements = DEFAULT_REQUIREMENTS.filter(
      (tpl) => !reqCodeSet.has(normalizeCode(tpl.reqCode))
    ).map((tpl) => tpl.reqCode);

    const missingDefaultTestCases = DEFAULT_TEST_CASES.filter(
      (tpl) => !tcCodeSet.has(normalizeCode(tpl.testId))
    ).map((tpl) => tpl.testId);

    const unresolvedTestCases = existingTcs
      .filter((tc) => {
        const code = normalizeCode(tc.requirementId);
        if (!code && tc.requirementRefId === null) return false;
        if (code && tc.requirementRefId === null) return true;
        if (tc.requirementRefId !== null) {
          const linkedReq = reqById.get(tc.requirementRefId);
          return !linkedReq || normalizeCode(linkedReq.reqCode) !== code;
        }
        return false;
      })
      .map((tc) => ({ id: tc.id, testId: tc.testId, requirementId: tc.requirementId }));

    const unresolvedBugReports = existingBugs
      .filter((bug) => {
        const reqCode = normalizeCode(bug.linkedRequirementId);
        const tcCode = normalizeCode(bug.linkedTestCaseId);
        const badReq =
          (Boolean(reqCode) && bug.linkedRequirementRefId === null) ||
          (bug.linkedRequirementRefId !== null &&
            (!reqById.has(bug.linkedRequirementRefId) ||
              normalizeCode(reqById.get(bug.linkedRequirementRefId)!.reqCode) !== reqCode));
        const badTc =
          (Boolean(tcCode) && bug.linkedTestCaseRefId === null) ||
          (bug.linkedTestCaseRefId !== null &&
            (!tcById.has(bug.linkedTestCaseRefId) ||
              normalizeCode(tcById.get(bug.linkedTestCaseRefId)!.testId) !== tcCode));
        return badReq || badTc;
      })
      .map((bug) => ({
        id: bug.id,
        bugCode: bug.bugCode,
        linkedRequirementId: bug.linkedRequirementId,
        linkedTestCaseId: bug.linkedTestCaseId,
      }));

    let missingExecutionSnapshotsCount = 0;
    for (const ex of existingExecs) {
      const codeSnap = ex.codeSnapshot.trim();
      const scenSnap = ex.scenarioSnapshot.trim();
      if (!codeSnap || !scenSnap) {
        missingExecutionSnapshotsCount++;
        continue;
      }
      if (ex.testCaseId !== null) {
        const tc = tcById.get(ex.testCaseId);
        if (!tc || codeSnap !== tc.testId || scenSnap !== tc.scenario) {
          missingExecutionSnapshotsCount++;
        }
      }
    }

    const qaRequirementsInitialized = Boolean(userRow?.qaRequirementsInitialized);
    const qaTestCasesInitialized = Boolean(userRow?.qaTestCasesInitialized);
    const requiresRecovery =
      !qaRequirementsInitialized ||
      !qaTestCasesInitialized ||
      missingDefaultRequirements.length > 0 ||
      missingDefaultTestCases.length > 0 ||
      unresolvedTestCases.length > 0 ||
      unresolvedBugReports.length > 0 ||
      missingExecutionSnapshotsCount > 0;

    return {
      userId,
      qaRequirementsInitialized,
      qaTestCasesInitialized,
      missingDefaultRequirements,
      missingDefaultTestCases,
      unresolvedTestCases,
      unresolvedBugReports,
      missingExecutionSnapshotsCount,
      requiresRecovery,
    };
  } catch (error) {
    console.error('Database query failed (previewQaWorkspaceRecovery):', error);
    throw new Error('Failed to preview QA workspace recovery.', { cause: error });
  }
}

export async function executeQaWorkspaceRecovery(
  userId: number,
  actor = 'QA Engineer'
): Promise<QaRecoveryResult> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`qa_seed_req:${userId}`}))`
      );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`qa_seed_tc:${userId}`}))`
      );

      // 1. Insert any missing default requirements without overwriting customisations
      const insertedReqRows = await tx
        .insert(requirements)
        .values(
          DEFAULT_REQUIREMENTS.map((tpl) => ({
            userId,
            reqCode: tpl.reqCode,
            title: tpl.title,
            category: tpl.category,
            module: tpl.module,
            userStory: tpl.userStory,
            acceptanceCriteria: tpl.acceptanceCriteria,
            priority: tpl.priority,
          }))
        )
        .onConflictDoNothing({
          target: [requirements.userId, requirements.reqCode],
        })
        .returning({ reqCode: requirements.reqCode });

      const allReqs = await tx
        .select({ id: requirements.id, reqCode: requirements.reqCode })
        .from(requirements)
        .where(eq(requirements.userId, userId));
      const reqByCode = new Map(allReqs.map((r) => [normalizeCode(r.reqCode), r]));
      const reqById = new Map(allReqs.map((r) => [r.id, r]));

      // 2. Insert any missing default test cases with valid same-user requirement FK
      const insertedTcRows = await tx
        .insert(testCases)
        .values(
          DEFAULT_TEST_CASES.map((tpl) => {
            const matchedReq = reqByCode.get(normalizeCode(tpl.requirementId));
            return {
              userId,
              testId: tpl.testId,
              requirementId: matchedReq ? matchedReq.reqCode : '',
              requirementRefId: matchedReq ? matchedReq.id : null,
              module: tpl.module,
              testType: tpl.testType,
              technique: tpl.technique,
              scenario: tpl.scenario,
              preconditions: tpl.preconditions,
              testData: tpl.testData,
              executionSteps: tpl.executionSteps,
              expectedResult: tpl.expectedResult,
              actualResult: '',
              priority: tpl.priority,
              status: 'Not Run',
              tester: '',
              defectId: '',
            };
          })
        )
        .onConflictDoNothing({
          target: [testCases.userId, testCases.testId],
        })
        .returning({ testId: testCases.testId });

      // 3. Reconcile unresolved or drifted test_cases -> requirements references
      const allTcs = await tx
        .select({
          id: testCases.id,
          testId: testCases.testId,
          scenario: testCases.scenario,
          requirementId: testCases.requirementId,
          requirementRefId: testCases.requirementRefId,
        })
        .from(testCases)
        .where(eq(testCases.userId, userId));

      let repairedTestCaseRefs = 0;
      for (const tc of allTcs) {
        const code = normalizeCode(tc.requirementId);
        if (tc.requirementRefId !== null) {
          const linked = reqById.get(tc.requirementRefId);
          if (linked && linked.reqCode !== tc.requirementId) {
            await tx
              .update(testCases)
              .set({ requirementId: linked.reqCode })
              .where(and(eq(testCases.id, tc.id), eq(testCases.userId, userId)));
            repairedTestCaseRefs++;
          }
        } else if (code) {
          const matched = reqByCode.get(code);
          await tx
            .update(testCases)
            .set({
              requirementId: matched ? matched.reqCode : '',
              requirementRefId: matched ? matched.id : null,
            })
            .where(and(eq(testCases.id, tc.id), eq(testCases.userId, userId)));
          repairedTestCaseRefs++;
        }
      }

      const tcByCode = new Map(allTcs.map((t) => [normalizeCode(t.testId), t]));
      const tcById = new Map(allTcs.map((t) => [t.id, t]));

      // 4. Reconcile unresolved or drifted bug_reports -> requirements & test_cases references
      const allBugs = await tx
        .select({
          id: bugReports.id,
          linkedRequirementId: bugReports.linkedRequirementId,
          linkedRequirementRefId: bugReports.linkedRequirementRefId,
          linkedTestCaseId: bugReports.linkedTestCaseId,
          linkedTestCaseRefId: bugReports.linkedTestCaseRefId,
        })
        .from(bugReports)
        .where(eq(bugReports.userId, userId));

      let repairedBugRefs = 0;
      for (const bug of allBugs) {
        const bugPatch: Partial<typeof bugReports.$inferInsert> = {};
        const reqCode = normalizeCode(bug.linkedRequirementId);
        if (bug.linkedRequirementRefId !== null) {
          const linkedReq = reqById.get(bug.linkedRequirementRefId);
          if (linkedReq && linkedReq.reqCode !== bug.linkedRequirementId) {
            bugPatch.linkedRequirementId = linkedReq.reqCode;
          }
        } else if (reqCode) {
          const matchedReq = reqByCode.get(reqCode);
          bugPatch.linkedRequirementId = matchedReq ? matchedReq.reqCode : '';
          bugPatch.linkedRequirementRefId = matchedReq ? matchedReq.id : null;
        }

        const tcCode = normalizeCode(bug.linkedTestCaseId);
        if (bug.linkedTestCaseRefId !== null) {
          const linkedTc = tcById.get(bug.linkedTestCaseRefId);
          if (linkedTc && linkedTc.testId !== bug.linkedTestCaseId) {
            bugPatch.linkedTestCaseId = linkedTc.testId;
          }
        } else if (tcCode) {
          const matchedTc = tcByCode.get(tcCode);
          bugPatch.linkedTestCaseId = matchedTc ? matchedTc.testId : '';
          bugPatch.linkedTestCaseRefId = matchedTc ? matchedTc.id : null;
        }

        if (Object.keys(bugPatch).length > 0) {
          bugPatch.updatedAt = new Date();
          await tx
            .update(bugReports)
            .set(bugPatch)
            .where(and(eq(bugReports.id, bug.id), eq(bugReports.userId, userId)));
          repairedBugRefs++;
        }
      }

      // 5. Repair missing or drifted snapshots on active executions
      const activeExecs = await tx
        .select({
          id: testExecutions.id,
          testCaseId: testExecutions.testCaseId,
          codeSnapshot: testExecutions.testCaseCodeSnapshot,
          scenarioSnapshot: testExecutions.testCaseScenarioSnapshot,
        })
        .from(testExecutions)
        .where(and(eq(testExecutions.userId, userId), isNotNull(testExecutions.testCaseId)));

      let repairedExecutionSnapshots = 0;
      for (const ex of activeExecs) {
        const tc = ex.testCaseId !== null ? tcById.get(ex.testCaseId) : undefined;
        if (tc && (ex.codeSnapshot !== tc.testId || ex.scenarioSnapshot !== tc.scenario)) {
          await tx
            .update(testExecutions)
            .set({
              testCaseCodeSnapshot: tc.testId,
              testCaseScenarioSnapshot: tc.scenario,
            })
            .where(and(eq(testExecutions.id, ex.id), eq(testExecutions.userId, userId)));
          repairedExecutionSnapshots++;
        }
      }

      // 6. Mark workspace initialisation flags true
      await tx
        .update(users)
        .set({ qaRequirementsInitialized: true, qaTestCasesInitialized: true })
        .where(eq(users.id, userId));

      const summary = {
        insertedRequirements: insertedReqRows.map((r) => r.reqCode),
        insertedTestCases: insertedTcRows.map((t) => t.testId),
        repairedTestCaseRefs,
        repairedBugRefs,
        repairedExecutionSnapshots,
      };

      // 7. Always log every recovery execution in qa_audit_logs
      const [auditRow] = await tx
        .insert(qaAuditLogs)
        .values({
          userId,
          entityType: 'workspace',
          entityId: userId,
          entityCode: 'QA-WORKSPACE',
          action: 'admin_recovery',
          actor,
          detailsJson: JSON.stringify(summary),
        })
        .returning({ id: qaAuditLogs.id });

      return {
        recovered: true,
        auditLogId: auditRow.id,
        summary,
      };
    });
  } catch (error) {
    console.error('Database recovery failed (executeQaWorkspaceRecovery):', error);
    throw new Error('Failed to execute QA workspace recovery.', { cause: error });
  }
}

