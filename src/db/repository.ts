import crypto from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { bugReports, tasks, testCases, users } from './schema.ts';
import { DEFAULT_TEST_CASES } from '../lib/qaTemplates.ts';
import type {
  BugReportRecord,
  BugStatus,
  QaPriority,
  Task,
  TaskPriority,
  TaskStatus,
  TestCaseRecord,
  TestCaseStatus,
  TestType,
  UserProfile,
} from '../lib/types.ts';

export class DuplicateEmailError extends Error {
  constructor(message = 'An account with this email address already exists.') {
    super(message);
    this.name = 'DuplicateEmailError';
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; cause?: { code?: string } };
  return err.code === '23505' || err.cause?.code === '23505';
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

function mapTestCaseRow(row: typeof testCases.$inferSelect): TestCaseRecord {
  return {
    id: row.id,
    userId: row.userId,
    testId: row.testId,
    requirementId: row.requirementId,
    module: row.module,
    testType: row.testType as TestType,
    scenario: row.scenario,
    preconditions: row.preconditions,
    testData: row.testData,
    executionSteps: row.executionSteps,
    expectedResult: row.expectedResult,
    actualResult: row.actualResult,
    priority: row.priority as QaPriority,
    status: row.status as TestCaseStatus,
    defectId: row.defectId,
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBugRow(row: typeof bugReports.$inferSelect): BugReportRecord {
  return {
    id: row.id,
    userId: row.userId,
    bugCode: row.bugCode,
    title: row.title,
    module: row.module,
    environment: row.environment,
    precondition: row.precondition,
    stepsToReproduce: row.stepsToReproduce,
    expectedResult: row.expectedResult,
    actualResult: row.actualResult,
    severity: row.severity as QaPriority,
    priority: row.priority as QaPriority,
    status: row.status as BugStatus,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
  };
}

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
        set: {
          email: normalizedEmail,
        },
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
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Database update failed (updateUserPasswordHash):', error);
    throw new Error('Failed to update password.', { cause: error });
  }
}

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
        description: 'Validate status codes, schema payloads, and auth guards across all 9 REST endpoints.',
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

export async function listOrInitTestCases(userId: number): Promise<TestCaseRecord[]> {
  try {
    const existing = await db
      .select()
      .from(testCases)
      .where(eq(testCases.userId, userId))
      .orderBy(asc(testCases.testId), asc(testCases.id));

    if (existing.length > 0) {
      return existing.map(mapTestCaseRow);
    }

    const inserted = await db
      .insert(testCases)
      .values(
        DEFAULT_TEST_CASES.map((tpl) => ({
          userId,
          testId: tpl.testId,
          requirementId: tpl.requirementId,
          module: tpl.module,
          testType: tpl.testType,
          scenario: tpl.scenario,
          preconditions: tpl.preconditions,
          testData: tpl.testData,
          executionSteps: tpl.executionSteps,
          expectedResult: tpl.expectedResult,
          actualResult: '',
          priority: tpl.priority,
          status: 'Not Executed',
          defectId: '',
        }))
      )
      .returning();

    return inserted.map(mapTestCaseRow);
  } catch (error) {
    console.error('Database query failed (listOrInitTestCases):', error);
    throw new Error('Failed to load QA test cases.', { cause: error });
  }
}

export async function updateTestCaseRecord(
  id: number,
  userId: number,
  patch: {
    status?: TestCaseStatus;
    actualResult?: string;
    defectId?: string;
    scenario?: string;
    expectedResult?: string;
    priority?: QaPriority;
  }
): Promise<TestCaseRecord | null> {
  try {
    const updateValues: Partial<typeof testCases.$inferInsert> = {};
    if (patch.status !== undefined) {
      updateValues.status = patch.status;
      updateValues.executedAt = patch.status === 'Not Executed' ? null : new Date();
    }
    if (patch.actualResult !== undefined) updateValues.actualResult = patch.actualResult;
    if (patch.defectId !== undefined) updateValues.defectId = patch.defectId;
    if (patch.scenario !== undefined) updateValues.scenario = patch.scenario;
    if (patch.expectedResult !== undefined) updateValues.expectedResult = patch.expectedResult;
    if (patch.priority !== undefined) updateValues.priority = patch.priority;

    const updated = await db
      .update(testCases)
      .set(updateValues)
      .where(and(eq(testCases.id, id), eq(testCases.userId, userId)))
      .returning();

    return updated[0] ? mapTestCaseRow(updated[0]) : null;
  } catch (error) {
    console.error('Database update failed (updateTestCaseRecord):', error);
    throw new Error('Failed to update test case.', { cause: error });
  }
}

export async function createTestCaseRecord(
  userId: number,
  input: {
    testId: string;
    requirementId: string;
    module: string;
    testType: TestType;
    scenario: string;
    preconditions: string;
    testData: string;
    executionSteps: string;
    expectedResult: string;
    priority: QaPriority;
  }
): Promise<TestCaseRecord> {
  try {
    const inserted = await db
      .insert(testCases)
      .values({
        userId,
        ...input,
        actualResult: '',
        status: 'Not Executed',
        defectId: '',
      })
      .returning();
    return mapTestCaseRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (createTestCaseRecord):', error);
    throw new Error('Failed to create test case.', { cause: error });
  }
}

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

export async function createBugReportRecord(
  userId: number,
  input: {
    title: string;
    module: string;
    environment: string;
    precondition: string;
    stepsToReproduce: string;
    expectedResult: string;
    actualResult: string;
    severity: QaPriority;
    priority: QaPriority;
    evidence: string;
  }
): Promise<BugReportRecord> {
  try {
    const existing = await db
      .select({ id: bugReports.id })
      .from(bugReports)
      .where(eq(bugReports.userId, userId));
    const nextNum = existing.length + 1;
    const bugCode = `BUG-${String(nextNum).padStart(3, '0')}`;

    const inserted = await db
      .insert(bugReports)
      .values({
        userId,
        bugCode,
        title: input.title,
        module: input.module,
        environment: input.environment || 'Chrome, Desktop',
        precondition: input.precondition,
        stepsToReproduce: input.stepsToReproduce,
        expectedResult: input.expectedResult,
        actualResult: input.actualResult,
        severity: input.severity,
        priority: input.priority,
        status: 'Open',
        evidence: input.evidence,
      })
      .returning();
    return mapBugRow(inserted[0]);
  } catch (error) {
    console.error('Database insert failed (createBugReportRecord):', error);
    throw new Error('Failed to create bug report.', { cause: error });
  }
}

export async function updateBugReportStatus(
  id: number,
  userId: number,
  status: BugStatus
): Promise<BugReportRecord | null> {
  try {
    const updated = await db
      .update(bugReports)
      .set({ status })
      .where(and(eq(bugReports.id, id), eq(bugReports.userId, userId)))
      .returning();
    return updated[0] ? mapBugRow(updated[0]) : null;
  } catch (error) {
    console.error('Database update failed (updateBugReportStatus):', error);
    throw new Error('Failed to update bug report status.', { cause: error });
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
