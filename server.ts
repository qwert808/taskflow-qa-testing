import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  createBugReportRecord,
  createLocalUser,
  createTaskRecord,
  createTestCaseRecord,
  deleteBugReportRecord,
  deleteTaskRecord,
  DuplicateEmailError,
  findTaskById,
  findUserByEmail,
  findUserRecordById,
  listBugReports,
  listOrInitTestCases,
  listUserTasks,
  seedSampleTasksForUser,
  updateBugReportStatus,
  updateTaskRecord,
  updateTaskStatusRecord,
  updateTestCaseRecord,
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
import { computeDashboardStats, filterAndSortTasks } from './src/lib/analytics.ts';
import type {
  BugStatus,
  QaPriority,
  SortOrder,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseStatus,
  TestType,
} from './src/lib/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
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
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
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
  'Not Executed',
  'Pass',
  'Fail',
  'Blocked',
];
const VALID_QA_PRIORITIES: readonly QaPriority[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_TEST_TYPES: readonly TestType[] = [
  'Manual',
  'Integration',
  'Regression',
  'UAT',
  'API',
  'SQL',
];
const VALID_BUG_STATUSES: readonly BugStatus[] = [
  'Open',
  'In Progress',
  'Retesting',
  'Closed',
];

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Malformed JSON error handler
  app.use((err: Error & { status?: number }, _req: Request, res: Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    next(err);
  });

  // ── Module 1: Authentication ──────────────────────────────────────────

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const validation = validateRegistrationInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
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
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
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
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
      return;
    }

    try {
      const updated = await updateUserProfile(req.authUser!.id, validation.data);
      res.status(200).json({
        message: 'Profile updated successfully.',
        user: updated,
      });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        res.status(409).json({
          error: error.message,
          details: { email: error.message },
        });
        return;
      }
      console.error('PUT /api/profile failed:', error);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.put('/api/profile/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const validation = validatePasswordChangeInput(req.body ?? {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
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

      const matches = verifyPassword(
        validation.data.currentPassword,
        userRecord.passwordHash
      );
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
      const rawStatus = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : 'all';
      const rawPriority =
        typeof req.query.priority === 'string' ? req.query.priority.toLowerCase() : 'all';
      const rawSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt';
      const rawSortOrder =
        typeof req.query.sortOrder === 'string' ? req.query.sortOrder.toLowerCase() : 'desc';

      const status =
        rawStatus === 'pending' || rawStatus === 'completed'
          ? (rawStatus as TaskStatus)
          : 'all';
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

      res.status(200).json({
        tasks: filtered,
        total: filtered.length,
      });
    } catch (error) {
      console.error('GET /api/tasks failed:', error);
      res.status(500).json({ error: 'Failed to load tasks.' });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
    const validation = validateTaskInput(req.body ?? {}, { isUpdate: false });
    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
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
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
      return;
    }

    try {
      const existing = await findTaskById(taskId);
      if (!existing) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (existing.userId !== req.authUser!.id) {
        res.status(403).json({ error: 'Forbidden: You cannot modify another user\'s task.' });
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
      res.status(400).json({
        error: 'Validation failed.',
        details: validation.errors,
      });
      return;
    }

    try {
      const existing = await findTaskById(taskId);
      if (!existing) {
        res.status(404).json({ error: 'Task not found.' });
        return;
      }
      if (existing.userId !== req.authUser!.id) {
        res.status(403).json({ error: 'Forbidden: You cannot modify another user\'s task.' });
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
        res.status(403).json({ error: 'Forbidden: You cannot delete another user\'s task.' });
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

  // ── QA Lab: Test Case Matrix & Bug Reports ────────────────────────────

  app.get('/api/qa/test-cases', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const testCases = await listOrInitTestCases(req.authUser!.id);
      res.status(200).json({ testCases });
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
        ? body.requirementId.trim()
        : 'CUSTOM-01';
    const moduleName =
      typeof body.module === 'string' && body.module.trim()
        ? body.module.trim()
        : 'Task Management';
    const testType = VALID_TEST_TYPES.includes(body.testType) ? body.testType : 'Manual';
    const priority = VALID_QA_PRIORITIES.includes(body.priority) ? body.priority : 'Medium';

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
        scenario,
        preconditions: typeof body.preconditions === 'string' ? body.preconditions.trim() : '',
        testData: typeof body.testData === 'string' ? body.testData.trim() : '',
        executionSteps: typeof body.executionSteps === 'string' ? body.executionSteps.trim() : '',
        expectedResult,
        priority,
      });
      res.status(201).json({ testCase: created });
    } catch (error) {
      console.error('POST /api/qa/test-cases failed:', error);
      res.status(500).json({ error: 'Failed to create test case.' });
    }
  });

  app.put('/api/qa/test-cases/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveIntId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid test case ID.' });
      return;
    }

    const body = req.body ?? {};
    const patch: {
      status?: TestCaseStatus;
      actualResult?: string;
      defectId?: string;
    } = {};

    if (body.status !== undefined) {
      if (!VALID_TC_STATUSES.includes(body.status)) {
        res.status(400).json({ error: 'Invalid test case status.' });
        return;
      }
      patch.status = body.status;
    }
    if (typeof body.actualResult === 'string') {
      patch.actualResult = body.actualResult.trim();
    }
    if (typeof body.defectId === 'string') {
      patch.defectId = body.defectId.trim();
    }

    try {
      const updated = await updateTestCaseRecord(id, req.authUser!.id, patch);
      if (!updated) {
        res.status(404).json({ error: 'Test case not found.' });
        return;
      }
      res.status(200).json({ testCase: updated });
    } catch (error) {
      console.error('PUT /api/qa/test-cases/:id failed:', error);
      res.status(500).json({ error: 'Failed to update test case.' });
    }
  });

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
        module: moduleName,
        environment:
          typeof body.environment === 'string' && body.environment.trim()
            ? body.environment.trim()
            : 'Chrome, Desktop',
        precondition: typeof body.precondition === 'string' ? body.precondition.trim() : '',
        stepsToReproduce,
        expectedResult,
        actualResult,
        severity,
        priority,
        evidence: typeof body.evidence === 'string' ? body.evidence.trim() : '',
      });
      res.status(201).json({ bug });
    } catch (error) {
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
    const status = req.body?.status as BugStatus;
    if (!VALID_BUG_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid bug status.' });
      return;
    }

    try {
      const updated = await updateBugReportStatus(id, req.authUser!.id, status);
      if (!updated) {
        res.status(404).json({ error: 'Bug report not found.' });
        return;
      }
      res.status(200).json({ bug: updated });
    } catch (error) {
      console.error('PUT /api/qa/bugs/:id failed:', error);
      res.status(500).json({ error: 'Failed to update bug status.' });
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
