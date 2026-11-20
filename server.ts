import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  addBugCommentRecord,
  attachGitLabIssueToBug,
  createBugReportRecord,
  createLocalUser,
  createRequirementRecord,
  createTaskRecord,
  createTestCaseRecord,
  createTestCycleRecord,
  deleteBugReportRecord,
  deleteRequirementRecord,
  deleteTaskRecord,
  deleteTestCaseRecord,
  DuplicateCodeError,
  DuplicateEmailError,
  duplicateTestCaseRecord,
  executeQaWorkspaceRecovery,
  findBugReportById,
  findTaskById,
  findUserByEmail,
  findUserRecordById,
  getRequirementDependencies,
  getTestCaseDependencies,
  LinkedDependenciesError,
  listAutomationRuns,
  listBugReports,
  listDefectHistory,
  listOrInitRequirements,
  listOrInitTestCases,
  listQaAuditLogs,
  listTestCycles,
  listTestExecutions,
  listUserTasks,
  previewQaWorkspaceRecovery,
  recordTestExecution,
  ReferenceValidationError,
  saveAutomationRun,
  seedSampleTasksForUser,
  updateBugReportRecord,
  updateRequirementRecord,
  updateTaskRecord,
  updateTaskStatusRecord,
  updateTestCaseRecord,
  updateTestCycleStatus,
  updateUserPasswordHash,
  updateUserProfile,
} from './src/db/repository.ts';
import {
  extractTokenFromRequest,
  requireAuth,
  SESSION_COOKIE_NAME,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  hashPassword,
  revokeSessionToken,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './src/lib/authCrypto.ts';
import {
  validateLoginInput,
  validatePasswordChangeInput,
  validateProfileInput,
  validateRegistrationInput,
  validateTaskInput,
  validateTaskStatus,
} from './src/lib/validation.ts';
import {
  computeDashboardStats,
  filterAndSortTasks,
  normalizeTestCaseStatus,
} from './src/lib/analytics.ts';
import {
  createRealGitLabIssue,
  getGitLabStatus,
  GitLabNotConfiguredError,
} from './src/lib/gitlabClient.ts';
import { runTaskFlowNewmanSuite } from './src/lib/newmanRunner.ts';
import { runPostgresValidationSuite } from './src/lib/postgresValidator.ts';
import type {
  BugStatus,
  CycleStatus,
  ExecutionOrigin,
  QaPriority,
  RequirementCategory,
  SortOrder,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseStatus,
  TestTechnique,
  TestType,
} from './src/lib/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 7}`,
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function parsePositiveIntId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const num = Number(raw);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

const VALID_TC_STATUSES: readonly TestCaseStatus[] = [
  'Not Run',
  'Not Executed',
  'Pass',
  'Fail',
  'Blocked',
];
const VALID_QA_PRIORITIES: readonly QaPriority[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_REQ_CATEGORIES: readonly RequirementCategory[] = ['Functional', 'Non-Functional'];
const VALID_TEST_TYPES: readonly TestType[] = [
  'Manual',
  'Functional',
  'Integration',
  'Regression',
  'Exploratory',
  'UAT',
  'API',
  'SQL',
];
const VALID_TEST_TECHNIQUES: readonly TestTechnique[] = [
  'Positive Testing',
  'Negative Testing',
  'Boundary Value Analysis',
  'Equivalence Partitioning',
  'Decision Table Testing',
  'State Transition Testing',
  'Error Guessing',
];
const VALID_BUG_STATUSES: readonly BugStatus[] = [
  'Open',
  'In Progress',
  'Fixed',
  'Retesting',
  'Closed',
  'Reopened',
];
const VALID_CYCLE_STATUSES: readonly CycleStatus[] = ['Planned', 'Active', 'Completed'];
const VALID_EXECUTION_ORIGINS: readonly ExecutionOrigin[] = [
  'Internal QA',
  'External User / Client',
];

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use(
    (err: Error & { status?: number }, _req: Request, res: Response, next: express.NextFunction) => {
      if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON request body.' });
        return;
      }
      next(err);
    }
  );

  // ── Module 1: Authentication ──────────────────────────────────────────

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const validation = validateRegistrationInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const existing = await findUserByEmail(validation.data.email);
      if (existing) {
        res.status(409).json({
          error: 'An account with this email address already exists.',
          details: { email: 'This email is already registered.' },
        });
        return;
      }

      const passwordHash = hashPassword(validation.data.password);
      const user = await createLocalUser({
        name: validation.data.name,
        email: validation.data.email,
        passwordHash,
      });

      const token = signSessionToken(user.id, user.email);
      setSessionCookie(req, res, token);

      res.status(201).json({
        message: 'Account registered successfully.',
        token,
        user,
      });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        res.status(409).json({
          error: error.message,
          details: { email: 'This email is already registered.' },
        });
        return;
      }
      console.error('POST /api/auth/register failed:', error);
      res.status(500).json({ error: 'Unable to complete registration. Please try again.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const validation = validateLoginInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const record = await findUserByEmail(validation.data.email);
      if (!record || !record.passwordHash) {
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      const isValid = verifyPassword(validation.data.password, record.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      const token = signSessionToken(record.id, record.email);
      setSessionCookie(req, res, token);

      res.status(200).json({
        message: 'Signed in successfully.',
        token,
        user: {
          id: record.id,
          uid: record.uid,
          name: record.name,
          email: record.email,
          authProvider: record.authProvider === 'google' ? 'google' : 'local',
          createdAt: record.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('POST /api/auth/login failed:', error);
      res.status(500).json({ error: 'Unable to sign in. Please try again.' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractTokenFromRequest(req);
    if (token && token.startsWith('tf_')) {
      revokeSessionToken(token);
    }
    clearSessionCookie(req, res);
    res.status(200).json({ message: 'Signed out successfully.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
    res.status(200).json({
      user: req.authUser,
      token: req.authToken?.startsWith('tf_') ? req.authToken : undefined,
    });
  });

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    const token = extractTokenFromRequest(req);
    if (!token || !token.startsWith('tf_')) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }
    try {
      const payload = verifySessionToken(token);
      if (!payload) {
        res.status(200).json({ authenticated: false, user: null });
        return;
      }
      const userRecord = await findUserRecordById(payload.userId);
      if (!userRecord) {
        res.status(200).json({ authenticated: false, user: null });
        return;
      }
      res.status(200).json({
        authenticated: true,
        token,
        user: {
          id: userRecord.id,
          uid: userRecord.uid,
          name: userRecord.name,
          email: userRecord.email,
          authProvider: userRecord.authProvider === 'google' ? 'google' : 'local',
          createdAt: userRecord.createdAt.toISOString(),
        },
      });
    } catch {
      res.status(200).json({ authenticated: false, user: null });
    }
  });

  // ── Module 4: User Profile ────────────────────────────────────────────

  app.put('/api/profile', requireAuth, async (req: AuthRequest, res: Response) => {
    const validation = validateProfileInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const updated = await updateUserProfile(req.authUser!.id, validation.data);
      res.status(200).json({ message: 'Profile updated successfully.', user: updated });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        res.status(409).json({ error: error.message, details: { email: error.message } });
        return;
      }
      console.error('PUT /api/profile failed:', error);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.put('/api/profile/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const validation = validatePasswordChangeInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const userRecord = await findUserRecordById(req.authUser!.id);
      if (!userRecord) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }
      if (!userRecord.passwordHash) {
        res.status(400).json({
          error: 'Password changes are managed through your Google account.',
        });
        return;
      }

      const matches = verifyPassword(validation.data.currentPassword, userRecord.passwordHash);
      if (!matches) {
        res.status(401).json({
          error: 'Current password is incorrect.',
          details: { currentPassword: 'Current password is incorrect.' },
        });
        return;
      }

      const newHash = hashPassword(validation.data.newPassword);
      await updateUserPasswordHash(userRecord.id, newHash);
      res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
      console.error('PUT /api/profile/password failed:', error);
      res.status(500).json({ error: 'Failed to update password.' });
    }
  });

  // ── Module 2 & 3: Task Management, Search, Filtering & Sorting ────────

  app.get('/api/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const allTasks = await listUserTasks(req.authUser!.id);

      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const rawStatus =
        typeof req.query.status === 'string' ? req.query.status.toLowerCase() : 'all';
      const rawPriority =
        typeof req.query.priority === 'string' ? req.query.priority.toLowerCase() : 'all';
      const rawSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
      const rawSortOrder =
        typeof req.query.sortOrder === 'string' ? req.query.sortOrder.toLowerCase() : 'desc';

      const status =
        rawStatus === 'pending' || rawStatus === 'completed' ? (rawStatus as TaskStatus) : 'all';
      const priority =
        rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low'
          ? (rawPriority as TaskPriority)
          : 'all';
      const sortBy: TaskSortBy = rawSortBy === 'dueDate' ? 'dueDate' : 'createdAt';
      const sortOrder: SortOrder = rawSortOrder === 'asc' ? 'asc' : 'desc';

      const filtered = filterAndSortTasks(allTasks, {
        search,
        status,
        priority,
        sortBy,
        sortOrder,
      });

      res.status(200).json({ tasks: filtered, total: filtered.length });
    } catch (error) {
      console.error('GET /api/tasks failed:', error);
      res.status(500).json({ error: 'Failed to load tasks.' });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
    const validation = validateTaskInput(req.body ?? {}, { isUpdate: false });
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const task = await createTaskRecord(req.authUser!.id, validation.data);
      res.status(201).json({ task });
    } catch (error) {
      console.error('POST /api/tasks failed:', error);
      res.status(500).json({ error: 'Failed to create task.' });
    }
  });

  app.post('/api/tasks/seed', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const seeded = await seedSampleTasksForUser(req.authUser!.id);
      res.status(201).json({ tasks: seeded });
    } catch (error) {
      console.error('POST /api/tasks/seed failed:', error);
      res.status(500).json({ error: 'Failed to load sample tasks.' });
    }
  });

  app.get('/api/tasks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const taskId = parsePositiveIntId(String(req.params.id));
    if (!taskId) {
      res.status(400).json({ error: 'Invalid task ID. Must be a positive integer.' });
      return;
    }

    try {
      const task = await findTaskById(taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (task.userId !== req.authUser!.id) {
        res.status(403).json({ error: 'Forbidden: You do not have access to this task.' });
        return;
      }
      res.status(200).json({ task });
    } catch (error) {
      console.error('GET /api/tasks/:id failed:', error);
      res.status(500).json({ error: 'Failed to retrieve task.' });
    }
  });

  app.put('/api/tasks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const taskId = parsePositiveIntId(String(req.params.id));
    if (!taskId) {
      res.status(400).json({ error: 'Invalid task ID. Must be a positive integer.' });
      return;
    }

    const validation = validateTaskInput(req.body ?? {}, { isUpdate: true });
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const existing = await findTaskById(taskId);
      if (!existing) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (existing.userId !== req.authUser!.id) {
        res.status(403).json({ error: "Forbidden: You cannot modify another user's task." });
        return;
      }

      const updated = await updateTaskRecord(taskId, req.authUser!.id, validation.data);
      res.status(200).json({ task: updated });
    } catch (error) {
      console.error('PUT /api/tasks/:id failed:', error);
      res.status(500).json({ error: 'Failed to update task.' });
    }
  });

  app.patch('/api/tasks/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const taskId = parsePositiveIntId(String(req.params.id));
    if (!taskId) {
      res.status(400).json({ error: 'Invalid task ID. Must be a positive integer.' });
      return;
    }

    const validation = validateTaskStatus(req.body?.status);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: 'Validation failed.', details: validation.errors });
      return;
    }

    try {
      const existing = await findTaskById(taskId);
      if (!existing) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (existing.userId !== req.authUser!.id) {
        res.status(403).json({ error: "Forbidden: You cannot modify another user's task." });
        return;
      }

      const updated = await updateTaskStatusRecord(
        taskId,
        req.authUser!.id,
        validation.data.status
      );
      res.status(200).json({ task: updated });
    } catch (error) {
      console.error('PATCH /api/tasks/:id/status failed:', error);
      res.status(500).json({ error: 'Failed to update task status.' });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const taskId = parsePositiveIntId(String(req.params.id));
    if (!taskId) {
      res.status(400).json({ error: 'Invalid task ID. Must be a positive integer.' });
      return;
    }

    try {
      const existing = await findTaskById(taskId);
      if (!existing) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (existing.userId !== req.authUser!.id) {
        res.status(403).json({ error: "Forbidden: You cannot delete another user's task." });
        return;
      }

      await deleteTaskRecord(taskId, req.authUser!.id);
      res.status(200).json({ message: 'Task deleted successfully.', id: taskId });
    } catch (error) {
      console.error('DELETE /api/tasks/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete task.' });
    }
  });

  // ── Module 5: Dashboard Analytics ─────────────────────────────────────

  app.get('/api/dashboard/stats', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const allTasks = await listUserTasks(req.authUser!.id);
      const stats = computeDashboardStats(allTasks);
      res.status(200).json({ stats });
    } catch (error) {
      console.error('GET /api/dashboard/stats failed:', error);
      res.status(500).json({ error: 'Failed to compute dashboard statistics.' });
    }
  });

  // ── QA Portfolio: Requirements Engineering (SRS & RTM) ────────────────

  app.get('/api/qa/requirements', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const reqs = await listOrInitRequirements(req.authUser!.id);
      res.status(200).json({ requirements: reqs });
    } catch (error) {
      console.error('GET /api/qa/requirements failed:', error);
      res.status(500).json({ error: 'Failed to load SRS requirements.' });
    }
  });

  app.post('/api/qa/requirements', requireAuth, async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const reqCode = typeof body.reqCode === 'string' ? body.reqCode.trim().toUpperCase() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const moduleName = typeof body.module === 'string' ? body.module.trim() : '';
    const acceptanceCriteria =
      typeof body.acceptanceCriteria === 'string' ? body.acceptanceCriteria.trim() : '';
    const userStory = typeof body.userStory === 'string' ? body.userStory.trim() : '';
    const category: RequirementCategory = VALID_REQ_CATEGORIES.includes(body.category)
      ? body.category
      : 'Functional';
    const priority: QaPriority = VALID_QA_PRIORITIES.includes(body.priority)
      ? body.priority
      : 'High';

    if (!reqCode || !title || !moduleName || !acceptanceCriteria) {
      res.status(400).json({
        error: 'Requirement ID, title, module, and acceptance criteria are required.',
      });
      return;
    }

    try {
      const requirement = await createRequirementRecord(req.authUser!.id, {
        reqCode,
        title,
        category,
        module: moduleName,
        userStory,
        acceptanceCriteria,
        priority,
      });
      res.status(201).json({ requirement });
    } catch (error) {
      if (error instanceof DuplicateCodeError) {
        res.status(409).json({ error: error.message, code: 'DUPLICATE_CODE', field: error.field });
        return;
      }
      console.error('POST /api/qa/requirements failed:', error);
      res.status(500).json({ error: 'Failed to create requirement.' });
    }
  });

  app.get(
    '/api/qa/requirements/:id/dependencies',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const id = parsePositiveIntId(String(req.params.id));
      if (!id) {
        res.status(400).json({ error: 'Invalid requirement ID.' });
        return;
      }
      try {
        const dependencies = await getRequirementDependencies(id, req.authUser!.id);
        if (!dependencies) {
          res.status(404).json({ error: 'Requirement not found.' });
          return;
        }
        res.status(200).json({ dependencies });
      } catch (error) {
        console.error('GET /api/qa/requirements/:id/dependencies failed:', error);
        res.status(500).json({ error: 'Failed to inspect requirement dependencies.' });
      }
    }
  );

  app.put('/api/qa/requirements/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid requirement ID.' });
      return;
    }

    const body = req.body ?? {};
    try {
      const updated = await updateRequirementRecord(
        id,
        req.authUser!.id,
        {
          reqCode: typeof body.reqCode === 'string' ? body.reqCode.trim().toUpperCase() : undefined,
          title: typeof body.title === 'string' ? body.title.trim() : undefined,
          category: VALID_REQ_CATEGORIES.includes(body.category) ? body.category : undefined,
          module: typeof body.module === 'string' ? body.module.trim() : undefined,
          userStory: typeof body.userStory === 'string' ? body.userStory.trim() : undefined,
          acceptanceCriteria:
            typeof body.acceptanceCriteria === 'string'
              ? body.acceptanceCriteria.trim()
              : undefined,
          priority: VALID_QA_PRIORITIES.includes(body.priority) ? body.priority : undefined,
        },
        req.authUser!.name
      );
      if (!updated) {
        res.status(404).json({ error: 'Requirement not found.' });
        return;
      }
      res.status(200).json({ requirement: updated });
    } catch (error) {
      if (error instanceof DuplicateCodeError) {
        res.status(409).json({ error: error.message, code: 'DUPLICATE_CODE', field: error.field });
        return;
      }
      console.error('PUT /api/qa/requirements/:id failed:', error);
      res.status(500).json({ error: 'Failed to update requirement.' });
    }
  });

  app.delete('/api/qa/requirements/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid requirement ID.' });
      return;
    }
    const confirmUnlink =
      req.query.confirmUnlink === 'true' ||
      req.query.confirmUnlink === '1' ||
      req.body?.confirmUnlink === true;

    try {
      const result = await deleteRequirementRecord(id, req.authUser!.id, req.authUser!.name, {
        confirmUnlink,
      });
      if (!result.deleted) {
        res.status(404).json({ error: 'Requirement not found.' });
        return;
      }
      res.status(200).json({
        message: 'Requirement deleted.',
        id,
        unlinkedTestCasesCount: result.unlinkedTestCasesCount,
        unlinkedBugReportsCount: result.unlinkedBugReportsCount,
      });
    } catch (error) {
      if (error instanceof LinkedDependenciesError) {
        res.status(409).json({
          error: error.message,
          code: 'LINKED_DEPENDENCIES_EXIST',
          requiresConfirmation: true,
          dependencies: error.dependencies,
        });
        return;
      }
      console.error('DELETE /api/qa/requirements/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete requirement.' });
    }
  });

  // ── QA Portfolio: Test Design & Test Cases ────────────────────────────

  app.get('/api/qa/test-cases', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const testCasesList = await listOrInitTestCases(req.authUser!.id);
      res.status(200).json({ testCases: testCasesList });
    } catch (error) {
      console.error('GET /api/qa/test-cases failed:', error);
      res.status(500).json({ error: 'Failed to load QA test cases.' });
    }
  });

  app.post('/api/qa/test-cases', requireAuth, async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const scenario = typeof body.scenario === 'string' ? body.scenario.trim() : '';
    const expectedResult = typeof body.expectedResult === 'string' ? body.expectedResult.trim() : '';
    const testId = typeof body.testId === 'string' ? body.testId.trim() : '';
    const requirementId =
      typeof body.requirementId === 'string' && body.requirementId.trim()
        ? body.requirementId.trim().toUpperCase()
        : '';
    const moduleName =
      typeof body.module === 'string' && body.module.trim()
        ? body.module.trim()
        : 'Task Management';
    const testType: TestType = VALID_TEST_TYPES.includes(body.testType)
      ? body.testType
      : 'Functional';
    const technique: TestTechnique = VALID_TEST_TECHNIQUES.includes(body.technique)
      ? body.technique
      : 'Positive Testing';
    const priority: QaPriority = VALID_QA_PRIORITIES.includes(body.priority)
      ? body.priority
      : 'Medium';

    if (!testId || !scenario || !expectedResult) {
      res.status(400).json({
        error: 'Test ID, scenario, and expected result are required.',
      });
      return;
    }

    try {
      const created = await createTestCaseRecord(req.authUser!.id, {
        testId,
        requirementId,
        module: moduleName,
        testType,
        technique,
        scenario,
        preconditions: typeof body.preconditions === 'string' ? body.preconditions.trim() : '',
        testData: typeof body.testData === 'string' ? body.testData.trim() : '',
        executionSteps: typeof body.executionSteps === 'string' ? body.executionSteps.trim() : '',
        expectedResult,
        priority,
      });
      res.status(201).json({ testCase: created });
    } catch (error) {
      if (error instanceof ReferenceValidationError) {
        res.status(400).json({ error: error.message, details: error.details });
        return;
      }
      if (error instanceof DuplicateCodeError) {
        res.status(409).json({ error: error.message, code: 'DUPLICATE_CODE', field: error.field });
        return;
      }
      console.error('POST /api/qa/test-cases failed:', error);
      res.status(500).json({ error: 'Failed to create test case.' });
    }
  });

  app.get(
    '/api/qa/test-cases/:id/dependencies',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const id = parsePositiveIntId(String(req.params.id));
      if (!id) {
        res.status(400).json({ error: 'Invalid test case ID.' });
        return;
      }
      try {
        const dependencies = await getTestCaseDependencies(id, req.authUser!.id);
        if (!dependencies) {
          res.status(404).json({ error: 'Test case not found.' });
          return;
        }
        res.status(200).json({ dependencies });
      } catch (error) {
        console.error('GET /api/qa/test-cases/:id/dependencies failed:', error);
        res.status(500).json({ error: 'Failed to inspect test case dependencies.' });
      }
    }
  );

  app.put('/api/qa/test-cases/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid test case ID.' });
      return;
    }

    const body = req.body ?? {};
    const patch: Parameters<typeof updateTestCaseRecord>[2] = {};

    if (body.status !== undefined) {
      if (!VALID_TC_STATUSES.includes(body.status)) {
        res.status(400).json({ error: 'Invalid test case status.' });
        return;
      }
      patch.status = normalizeTestCaseStatus(body.status);
    }
    if (typeof body.testId === 'string' && body.testId.trim()) patch.testId = body.testId.trim();
    if (typeof body.requirementId === 'string') {
      patch.requirementId = body.requirementId.trim().toUpperCase();
    }
    if (typeof body.module === 'string' && body.module.trim()) patch.module = body.module.trim();
    if (VALID_TEST_TYPES.includes(body.testType)) patch.testType = body.testType;
    if (VALID_TEST_TECHNIQUES.includes(body.technique)) patch.technique = body.technique;
    if (typeof body.scenario === 'string' && body.scenario.trim()) {
      patch.scenario = body.scenario.trim();
    }
    if (typeof body.preconditions === 'string') patch.preconditions = body.preconditions.trim();
    if (typeof body.testData === 'string') patch.testData = body.testData.trim();
    if (typeof body.executionSteps === 'string') patch.executionSteps = body.executionSteps.trim();
    if (typeof body.expectedResult === 'string' && body.expectedResult.trim()) {
      patch.expectedResult = body.expectedResult.trim();
    }
    if (typeof body.actualResult === 'string') patch.actualResult = body.actualResult.trim();
    if (VALID_QA_PRIORITIES.includes(body.priority)) patch.priority = body.priority;
    if (typeof body.tester === 'string') patch.tester = body.tester.trim();
    if (typeof body.defectId === 'string') patch.defectId = body.defectId.trim();

    try {
      const updated = await updateTestCaseRecord(id, req.authUser!.id, patch, req.authUser!.name);
      if (!updated) {
        res.status(404).json({ error: 'Test case not found.' });
        return;
      }
      res.status(200).json({ testCase: updated });
    } catch (error) {
      if (error instanceof ReferenceValidationError) {
        res.status(400).json({ error: error.message, details: error.details });
        return;
      }
      if (error instanceof DuplicateCodeError) {
        res.status(409).json({ error: error.message, code: 'DUPLICATE_CODE', field: error.field });
        return;
      }
      console.error('PUT /api/qa/test-cases/:id failed:', error);
      res.status(500).json({ error: 'Failed to update test case.' });
    }
  });

  app.post('/api/qa/test-cases/:id/duplicate', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid test case ID.' });
      return;
    }
    try {
      const duplicated = await duplicateTestCaseRecord(id, req.authUser!.id);
      if (!duplicated) {
        res.status(404).json({ error: 'Test case not found.' });
        return;
      }
      res.status(201).json({ testCase: duplicated });
    } catch (error) {
      console.error('POST /api/qa/test-cases/:id/duplicate failed:', error);
      res.status(500).json({ error: 'Failed to duplicate test case.' });
    }
  });

  app.delete('/api/qa/test-cases/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid test case ID.' });
      return;
    }
    const confirmUnlink =
      req.query.confirmUnlink === 'true' ||
      req.query.confirmUnlink === '1' ||
      req.body?.confirmUnlink === true;

    try {
      const result = await deleteTestCaseRecord(id, req.authUser!.id, req.authUser!.name, {
        confirmUnlink,
      });
      if (!result.deleted) {
        res.status(404).json({ error: 'Test case not found.' });
        return;
      }
      res.status(200).json({
        message: 'Test case deleted.',
        id,
        preservedExecutionsCount: result.preservedExecutionsCount,
        unlinkedBugReportsCount: result.unlinkedBugReportsCount,
      });
    } catch (error) {
      if (error instanceof LinkedDependenciesError) {
        res.status(409).json({
          error: error.message,
          code: 'LINKED_DEPENDENCIES_EXIST',
          requiresConfirmation: true,
          dependencies: error.dependencies,
        });
        return;
      }
      console.error('DELETE /api/qa/test-cases/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete test case.' });
    }
  });

  // ── QA Portfolio: Test Cycles & Immutable Execution History ───────────

  app.get('/api/qa/cycles', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const cycles = await listTestCycles(req.authUser!.id);
      res.status(200).json({ cycles });
    } catch (error) {
      console.error('GET /api/qa/cycles failed:', error);
      res.status(500).json({ error: 'Failed to load test cycles.' });
    }
  });

  app.post('/api/qa/cycles', requireAuth, async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const scope = typeof body.scope === 'string' && body.scope.trim() ? body.scope.trim() : 'Regression';
    const executionOrigin: ExecutionOrigin = VALID_EXECUTION_ORIGINS.includes(body.executionOrigin)
      ? body.executionOrigin
      : 'Internal QA';
    const environment =
      typeof body.environment === 'string' && body.environment.trim()
        ? body.environment.trim()
        : 'Localhost / Staging';
    const status: CycleStatus = VALID_CYCLE_STATUSES.includes(body.status) ? body.status : 'Active';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    if (!name) {
      res.status(400).json({ error: 'Cycle name is required.' });
      return;
    }

    try {
      const cycle = await createTestCycleRecord(req.authUser!.id, {
        name,
        scope,
        executionOrigin,
        environment,
        status,
        notes,
      });
      res.status(201).json({ cycle });
    } catch (error) {
      console.error('POST /api/qa/cycles failed:', error);
      res.status(500).json({ error: 'Failed to create test cycle.' });
    }
  });

  app.patch('/api/qa/cycles/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid cycle ID.' });
      return;
    }
    const status = req.body?.status as CycleStatus;
    if (!VALID_CYCLE_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid cycle status.' });
      return;
    }
    try {
      const cycle = await updateTestCycleStatus(id, req.authUser!.id, status);
      if (!cycle) {
        res.status(404).json({ error: 'Test cycle not found.' });
        return;
      }
      res.status(200).json({ cycle });
    } catch (error) {
      console.error('PATCH /api/qa/cycles/:id failed:', error);
      res.status(500).json({ error: 'Failed to update test cycle.' });
    }
  });

  app.get('/api/qa/executions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const executions = await listTestExecutions(req.authUser!.id);
      res.status(200).json({ executions });
    } catch (error) {
      console.error('GET /api/qa/executions failed:', error);
      res.status(500).json({ error: 'Failed to load execution history.' });
    }
  });

  app.post('/api/qa/executions', requireAuth, async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const testCaseId = parsePositiveIntId(String(body.testCaseId ?? ''));
    if (!testCaseId) {
      res.status(400).json({ error: 'Valid testCaseId is required.' });
      return;
    }
    if (!VALID_TC_STATUSES.includes(body.status)) {
      res.status(400).json({ error: 'Execution status must be Pass, Fail, Blocked, or Not Run.' });
      return;
    }
    const actualResult = typeof body.actualResult === 'string' ? body.actualResult.trim() : '';
    if (!actualResult) {
      res.status(400).json({ error: 'Actual result observation is required to record an execution.' });
      return;
    }

    const cycleId = body.cycleId ? parsePositiveIntId(String(body.cycleId)) : null;
    const executionOrigin: ExecutionOrigin = VALID_EXECUTION_ORIGINS.includes(body.executionOrigin)
      ? body.executionOrigin
      : 'Internal QA';
    const tester =
      typeof body.tester === 'string' && body.tester.trim()
        ? body.tester.trim()
        : req.authUser!.name;

    try {
      const recorded = await recordTestExecution(req.authUser!.id, {
        testCaseId,
        cycleId,
        testType: typeof body.testType === 'string' ? body.testType.trim() : 'Functional',
        executionOrigin,
        environment:
          typeof body.environment === 'string' && body.environment.trim()
            ? body.environment.trim()
            : 'Localhost / Staging',
        browserDevice:
          typeof body.browserDevice === 'string' && body.browserDevice.trim()
            ? body.browserDevice.trim()
            : 'Chrome · Desktop',
        tester,
        testData: typeof body.testData === 'string' ? body.testData.trim() : '',
        expectedResult: typeof body.expectedResult === 'string' ? body.expectedResult.trim() : '',
        actualResult,
        status: normalizeTestCaseStatus(body.status),
        evidence: typeof body.evidence === 'string' ? body.evidence.trim() : '',
        defectId: typeof body.defectId === 'string' ? body.defectId.trim() : '',
      });

      if (!recorded) {
        res.status(404).json({ error: 'Test case not found.' });
        return;
      }

      res.status(201).json(recorded);
    } catch (error) {
      console.error('POST /api/qa/executions failed:', error);
      res.status(500).json({ error: 'Failed to record test execution.' });
    }
  });

  // ── QA Portfolio: Upgraded Defect Lifecycle & GitLab Integration ──────

  app.get('/api/qa/bugs', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const bugs = await listBugReports(req.authUser!.id);
      res.status(200).json({ bugs });
    } catch (error) {
      console.error('GET /api/qa/bugs failed:', error);
      res.status(500).json({ error: 'Failed to load bug reports.' });
    }
  });

  app.post('/api/qa/bugs', requireAuth, async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const moduleName = typeof body.module === 'string' ? body.module.trim() : '';
    const stepsToReproduce =
      typeof body.stepsToReproduce === 'string' ? body.stepsToReproduce.trim() : '';
    const expectedResult =
      typeof body.expectedResult === 'string' ? body.expectedResult.trim() : '';
    const actualResult = typeof body.actualResult === 'string' ? body.actualResult.trim() : '';

    const errors: Record<string, string> = {};
    if (!title) errors.title = 'Bug title is required.';
    if (!moduleName) errors.module = 'Module is required.';
    if (!stepsToReproduce) errors.stepsToReproduce = 'Steps to reproduce are required.';
    if (!expectedResult) errors.expectedResult = 'Expected result is required.';
    if (!actualResult) errors.actualResult = 'Actual result is required.';

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed.', details: errors });
      return;
    }

    const severity: QaPriority = VALID_QA_PRIORITIES.includes(body.severity)
      ? body.severity
      : 'High';
    const priority: QaPriority = VALID_QA_PRIORITIES.includes(body.priority)
      ? body.priority
      : 'High';

    try {
      const bug = await createBugReportRecord(req.authUser!.id, {
        title,
        description: typeof body.description === 'string' ? body.description.trim() : '',
        module: moduleName,
        environment:
          typeof body.environment === 'string' && body.environment.trim()
            ? body.environment.trim()
            : 'Localhost / Staging',
        browserDevice:
          typeof body.browserDevice === 'string' && body.browserDevice.trim()
            ? body.browserDevice.trim()
            : 'Chrome · Desktop',
        precondition: typeof body.precondition === 'string' ? body.precondition.trim() : '',
        stepsToReproduce,
        expectedResult,
        actualResult,
        severity,
        priority,
        assignedDeveloper:
          typeof body.assignedDeveloper === 'string' && body.assignedDeveloper.trim()
            ? body.assignedDeveloper.trim()
            : 'Unassigned',
        reporter:
          typeof body.reporter === 'string' && body.reporter.trim()
            ? body.reporter.trim()
            : req.authUser!.name,
        linkedRequirementId:
          typeof body.linkedRequirementId === 'string'
            ? body.linkedRequirementId.trim().toUpperCase()
            : '',
        linkedTestCaseId:
          typeof body.linkedTestCaseId === 'string'
            ? body.linkedTestCaseId.trim().toUpperCase()
            : '',
        evidence: typeof body.evidence === 'string' ? body.evidence.trim() : '',
      });
      res.status(201).json({ bug });
    } catch (error) {
      if (error instanceof ReferenceValidationError) {
        res.status(400).json({ error: error.message, details: error.details });
        return;
      }
      if (error instanceof DuplicateCodeError) {
        res.status(409).json({ error: error.message, code: 'DUPLICATE_CODE', field: error.field });
        return;
      }
      console.error('POST /api/qa/bugs failed:', error);
      res.status(500).json({ error: 'Failed to create bug report.' });
    }
  });

  app.put('/api/qa/bugs/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid bug ID.' });
      return;
    }
    const body = req.body ?? {};
    if (body.status !== undefined && !VALID_BUG_STATUSES.includes(body.status)) {
      res.status(400).json({ error: 'Invalid bug status.' });
      return;
    }

    try {
      const updated = await updateBugReportRecord(id, req.authUser!.id, req.authUser!.name, {
        status: body.status,
        title: typeof body.title === 'string' ? body.title.trim() : undefined,
        description: typeof body.description === 'string' ? body.description.trim() : undefined,
        module: typeof body.module === 'string' ? body.module.trim() : undefined,
        environment: typeof body.environment === 'string' ? body.environment.trim() : undefined,
        browserDevice:
          typeof body.browserDevice === 'string' ? body.browserDevice.trim() : undefined,
        precondition: typeof body.precondition === 'string' ? body.precondition.trim() : undefined,
        stepsToReproduce:
          typeof body.stepsToReproduce === 'string' ? body.stepsToReproduce.trim() : undefined,
        expectedResult:
          typeof body.expectedResult === 'string' ? body.expectedResult.trim() : undefined,
        actualResult: typeof body.actualResult === 'string' ? body.actualResult.trim() : undefined,
        severity: VALID_QA_PRIORITIES.includes(body.severity) ? body.severity : undefined,
        priority: VALID_QA_PRIORITIES.includes(body.priority) ? body.priority : undefined,
        assignedDeveloper:
          typeof body.assignedDeveloper === 'string' ? body.assignedDeveloper.trim() : undefined,
        linkedRequirementId:
          typeof body.linkedRequirementId === 'string'
            ? body.linkedRequirementId.trim().toUpperCase()
            : undefined,
        linkedTestCaseId:
          typeof body.linkedTestCaseId === 'string'
            ? body.linkedTestCaseId.trim().toUpperCase()
            : undefined,
        evidence: typeof body.evidence === 'string' ? body.evidence.trim() : undefined,
        comment: typeof body.comment === 'string' ? body.comment.trim() : undefined,
      });

      if (!updated) {
        res.status(404).json({ error: 'Bug report not found.' });
        return;
      }
      res.status(200).json({ bug: updated });
    } catch (error) {
      if (error instanceof ReferenceValidationError) {
        res.status(400).json({ error: error.message, details: error.details });
        return;
      }
      console.error('PUT /api/qa/bugs/:id failed:', error);
      res.status(500).json({ error: 'Failed to update bug report.' });
    }
  });

  app.get('/api/qa/bugs/:id/history', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid bug ID.' });
      return;
    }
    try {
      const history = await listDefectHistory(id, req.authUser!.id);
      res.status(200).json({ history });
    } catch (error) {
      console.error('GET /api/qa/bugs/:id/history failed:', error);
      res.status(500).json({ error: 'Failed to load defect history.' });
    }
  });

  app.post('/api/qa/bugs/:id/history', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid bug ID.' });
      return;
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!comment) {
      res.status(400).json({ error: 'Comment text is required.' });
      return;
    }
    try {
      const entry = await addBugCommentRecord(id, req.authUser!.id, req.authUser!.name, comment);
      if (!entry) {
        res.status(404).json({ error: 'Bug report not found.' });
        return;
      }
      res.status(201).json({ entry });
    } catch (error) {
      console.error('POST /api/qa/bugs/:id/history failed:', error);
      res.status(500).json({ error: 'Failed to add comment.' });
    }
  });

  app.get('/api/qa/gitlab/status', requireAuth, (_req: AuthRequest, res: Response) => {
    res.status(200).json({ gitlab: getGitLabStatus() });
  });

  app.post('/api/qa/bugs/:id/gitlab', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid bug ID.' });
      return;
    }
    try {
      const bug = await findBugReportById(id, req.authUser!.id);
      if (!bug) {
        res.status(404).json({ error: 'Bug report not found.' });
        return;
      }
      const created = await createRealGitLabIssue(bug);
      const updated = await attachGitLabIssueToBug(
        bug.id,
        req.authUser!.id,
        created.issueId,
        created.issueUrl,
        req.authUser!.name
      );
      res.status(201).json({ bug: updated, gitlabIssue: created });
    } catch (error) {
      if (error instanceof GitLabNotConfiguredError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('POST /api/qa/bugs/:id/gitlab failed:', error);
      res.status(502).json({
        error:
          error instanceof Error ? error.message : 'Failed to create issue via GitLab REST API.',
      });
    }
  });

  app.delete('/api/qa/bugs/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid bug ID.' });
      return;
    }
    try {
      const deleted = await deleteBugReportRecord(id, req.authUser!.id);
      if (!deleted) {
        res.status(404).json({ error: 'Bug report not found.' });
        return;
      }
      res.status(200).json({ message: 'Bug report deleted.', id });
    } catch (error) {
      console.error('DELETE /api/qa/bugs/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete bug report.' });
    }
  });

  // ── QA Portfolio: Audit Logs & Authorised Administrative Recovery ─────

  app.get('/api/qa/audit-logs', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const limit = parsePositiveIntId(String(req.query.limit ?? '')) ?? 100;
      const logs = await listQaAuditLogs(req.authUser!.id, limit);
      res.status(200).json({ logs });
    } catch (error) {
      console.error('GET /api/qa/audit-logs failed:', error);
      res.status(500).json({ error: 'Failed to load QA audit logs.' });
    }
  });

  app.get(
    '/api/qa/admin/recovery/preview',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const preview = await previewQaWorkspaceRecovery(req.authUser!.id);
        res.status(200).json({ preview });
      } catch (error) {
        console.error('GET /api/qa/admin/recovery/preview failed:', error);
        res.status(500).json({ error: 'Failed to preview workspace recovery.' });
      }
    }
  );

  app.post(
    '/api/qa/admin/recovery/execute',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      if (req.body?.confirmRecovery !== true) {
        res.status(400).json({
          error:
            'Explicit confirmation (confirmRecovery: true) is required to execute workspace recovery.',
          code: 'RECOVERY_CONFIRMATION_REQUIRED',
        });
        return;
      }
      try {
        const result = await executeQaWorkspaceRecovery(req.authUser!.id, req.authUser!.name);
        res.status(200).json(result);
      } catch (error) {
        console.error('POST /api/qa/admin/recovery/execute failed:', error);
        res.status(500).json({ error: 'Failed to execute workspace recovery.' });
      }
    }
  );

  // ── QA Portfolio: Live Automation Runners (Newman · PostgreSQL) ───────

  app.get('/api/qa/automation/runs', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const runs = await listAutomationRuns(req.authUser!.id);
      res.status(200).json({ runs });
    } catch (error) {
      console.error('GET /api/qa/automation/runs failed:', error);
      res.status(500).json({ error: 'Failed to load automation runs.' });
    }
  });

  app.post('/api/qa/automation/run-newman', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const port = Number(process.env.PORT) || 3000;
      const result = await runTaskFlowNewmanSuite(`http://127.0.0.1:${port}`);
      const saved = await saveAutomationRun(req.authUser!.id, result);
      res.status(201).json({ run: saved });
    } catch (error) {
      console.error('POST /api/qa/automation/run-newman failed:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? `Newman execution failed: ${error.message}`
            : 'Newman execution failed.',
      });
    }
  });

  app.get('/api/qa/automation/newman-report', requireAuth, (_req: AuthRequest, res: Response) => {
    const reportFile = path.resolve(process.cwd(), 'reports/newman/api-guard-report.html');
    if (!fs.existsSync(reportFile)) {
      res.status(404).json({
        error: 'No Newman HTML report generated yet. Run TaskFlow API Guard first.',
      });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(reportFile);
  });

  app.post(
    '/api/qa/automation/run-postgres',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const result = await runPostgresValidationSuite();
        const saved = await saveAutomationRun(req.authUser!.id, {
          suite: 'postgres',
          runLabel: result.runLabel,
          totalItems: result.totalItems,
          totalAssertions: result.totalAssertions,
          passedAssertions: result.passedAssertions,
          failedAssertions: result.failedAssertions,
          durationMs: result.durationMs,
          avgResponseMs: result.avgResponseMs,
          failedEndpoints: result.failedEndpoints,
          reportPath: '',
        });
        res.status(201).json({ run: saved, checks: result.checks });
      } catch (error) {
        console.error('POST /api/qa/automation/run-postgres failed:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? `PostgreSQL validation failed: ${error.message}`
              : 'PostgreSQL validation failed.',
        });
      }
    }
  );

  // Catch-all JSON 404 for unknown API paths
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // ── Frontend Serving (Vite dev middleware or production dist/) ────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TaskFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TaskFlow server:', err);
  process.exit(1);
});
