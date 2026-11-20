import type {
  AutomationRunRecord,
  BugReportRecord,
  BugStatus,
  CycleStatus,
  DashboardStats,
  DefectHistoryRecord,
  ExecutionOrigin,
  GitLabStatusInfo,
  QaAuditLogRecord,
  QaPriority,
  QaRecoveryPreview,
  QaRecoveryResult,
  RequirementCategory,
  RequirementDependencies,
  RequirementRecord,
  SortOrder,
  Task,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseDependencies,
  TestCaseRecord,
  TestCaseStatus,
  TestCycleRecord,
  TestExecutionRecord,
  TestTechnique,
  TestType,
  UserProfile,
} from './types';

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  code?: string;
  payload?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    details?: Record<string, string>,
    code?: string,
    payload?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
    this.payload = payload;
  }
}

let activeAuthToken: string | null = null;

export function setApiAuthToken(token: string | null): void {
  activeAuthToken = token;
}

export function getApiAuthToken(): string | null {
  return activeAuthToken;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    skipAuth?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const tokenToUse = options.skipAuth ? null : (options.token ?? activeAuthToken);
  if (tokenToUse) {
    headers.Authorization = `Bearer ${tokenToUse}`;
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : `Request failed with status ${response.status}`;
    const details =
      parsed.details && typeof parsed.details === 'object'
        ? (parsed.details as Record<string, string>)
        : undefined;
    const code = typeof parsed.code === 'string' ? parsed.code : undefined;
    throw new ApiError(message, response.status, details, code, parsed);
  }

  return parsed as T;
}

export const authApi = {
  register(payload: { name: string; email: string; password: string }) {
    return apiRequest<{ user: UserProfile; token: string; message: string }>(
      '/api/auth/register',
      { method: 'POST', body: payload, skipAuth: true }
    );
  },
  login(payload: { email: string; password: string }) {
    return apiRequest<{ user: UserProfile; token: string; message: string }>('/api/auth/login', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  },
  logout() {
    return apiRequest<{ message: string }>('/api/auth/logout', { method: 'POST' });
  },
  me(tokenOverride?: string | null) {
    return apiRequest<{ user: UserProfile; token?: string }>('/api/auth/me', {
      token: tokenOverride,
    });
  },
  session() {
    return apiRequest<{ authenticated: boolean; user: UserProfile | null; token?: string }>(
      '/api/auth/session'
    );
  },
  updateProfile(payload: { name: string; email: string }) {
    return apiRequest<{ user: UserProfile; message: string }>('/api/profile', {
      method: 'PUT',
      body: payload,
    });
  },
  changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return apiRequest<{ message: string }>('/api/profile/password', {
      method: 'PUT',
      body: payload,
    });
  },
};

export const tasksApi = {
  list(params?: {
    search?: string;
    status?: 'all' | TaskStatus;
    priority?: 'all' | TaskPriority;
    sortBy?: TaskSortBy;
    sortOrder?: SortOrder;
  }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortOrder) qs.set('sortOrder', params.sortOrder);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ tasks: Task[]; total: number }>(`/api/tasks${suffix}`);
  },
  create(payload: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
    allowPastDueDate?: boolean;
  }) {
    return apiRequest<{ task: Task }>('/api/tasks', { method: 'POST', body: payload });
  },
  update(
    id: number,
    payload: {
      title: string;
      description: string;
      priority: TaskPriority;
      status: TaskStatus;
      dueDate: string | null;
    }
  ) {
    return apiRequest<{ task: Task }>(`/api/tasks/${id}`, { method: 'PUT', body: payload });
  },
  updateStatus(id: number, status: TaskStatus) {
    return apiRequest<{ task: Task }>(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string; id: number }>(`/api/tasks/${id}`, { method: 'DELETE' });
  },
  seedSamples() {
    return apiRequest<{ tasks: Task[] }>('/api/tasks/seed', { method: 'POST' });
  },
  stats() {
    return apiRequest<{ stats: DashboardStats }>('/api/dashboard/stats');
  },
};

export interface PostgresCheckItem {
  name: string;
  category: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export const qaApi = {
  // Requirements
  listRequirements() {
    return apiRequest<{ requirements: RequirementRecord[] }>('/api/qa/requirements');
  },
  createRequirement(payload: {
    reqCode: string;
    title: string;
    category: RequirementCategory;
    module: string;
    userStory: string;
    acceptanceCriteria: string;
    priority: QaPriority;
  }) {
    return apiRequest<{ requirement: RequirementRecord }>('/api/qa/requirements', {
      method: 'POST',
      body: payload,
    });
  },
  updateRequirement(
    id: number,
    payload: Partial<{
      reqCode: string;
      title: string;
      category: RequirementCategory;
      module: string;
      userStory: string;
      acceptanceCriteria: string;
      priority: QaPriority;
    }>
  ) {
    return apiRequest<{ requirement: RequirementRecord }>(`/api/qa/requirements/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },
  getRequirementDependencies(id: number) {
    return apiRequest<{ dependencies: RequirementDependencies }>(
      `/api/qa/requirements/${id}/dependencies`
    );
  },
  deleteRequirement(id: number, confirmUnlink = false) {
    const suffix = confirmUnlink ? '?confirmUnlink=true' : '';
    return apiRequest<{
      message: string;
      id: number;
      unlinkedTestCasesCount?: number;
      unlinkedBugReportsCount?: number;
    }>(`/api/qa/requirements/${id}${suffix}`, {
      method: 'DELETE',
    });
  },

  // Test Cases
  listTestCases() {
    return apiRequest<{ testCases: TestCaseRecord[] }>('/api/qa/test-cases');
  },
  createTestCase(payload: {
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
  }) {
    return apiRequest<{ testCase: TestCaseRecord }>('/api/qa/test-cases', {
      method: 'POST',
      body: payload,
    });
  },
  updateTestCase(
    id: number,
    payload: Partial<{
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
      actualResult: string;
      priority: QaPriority;
      status: TestCaseStatus;
      tester: string;
      defectId: string;
    }>
  ) {
    return apiRequest<{ testCase: TestCaseRecord }>(`/api/qa/test-cases/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },
  duplicateTestCase(id: number) {
    return apiRequest<{ testCase: TestCaseRecord }>(`/api/qa/test-cases/${id}/duplicate`, {
      method: 'POST',
    });
  },
  getTestCaseDependencies(id: number) {
    return apiRequest<{ dependencies: TestCaseDependencies }>(
      `/api/qa/test-cases/${id}/dependencies`
    );
  },
  deleteTestCase(id: number, confirmUnlink = false) {
    const suffix = confirmUnlink ? '?confirmUnlink=true' : '';
    return apiRequest<{
      message: string;
      id: number;
      preservedExecutionsCount?: number;
      unlinkedBugReportsCount?: number;
    }>(`/api/qa/test-cases/${id}${suffix}`, {
      method: 'DELETE',
    });
  },

  // Test Cycles & Execution History
  listCycles() {
    return apiRequest<{ cycles: TestCycleRecord[] }>('/api/qa/cycles');
  },
  createCycle(payload: {
    name: string;
    scope: string;
    executionOrigin: ExecutionOrigin;
    environment: string;
    status: CycleStatus;
    notes: string;
  }) {
    return apiRequest<{ cycle: TestCycleRecord }>('/api/qa/cycles', {
      method: 'POST',
      body: payload,
    });
  },
  updateCycleStatus(id: number, status: CycleStatus) {
    return apiRequest<{ cycle: TestCycleRecord }>(`/api/qa/cycles/${id}`, {
      method: 'PATCH',
      body: { status },
    });
  },
  listExecutions() {
    return apiRequest<{ executions: TestExecutionRecord[] }>('/api/qa/executions');
  },
  recordExecution(payload: {
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
  }) {
    return apiRequest<{ execution: TestExecutionRecord; testCase: TestCaseRecord }>(
      '/api/qa/executions',
      { method: 'POST', body: payload }
    );
  },

  // Defects & Defect History & GitLab
  listBugs() {
    return apiRequest<{ bugs: BugReportRecord[] }>('/api/qa/bugs');
  },
  createBug(payload: {
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
  }) {
    return apiRequest<{ bug: BugReportRecord }>('/api/qa/bugs', {
      method: 'POST',
      body: payload,
    });
  },
  updateBug(
    id: number,
    payload: Partial<{
      status: BugStatus;
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
      linkedRequirementId: string;
      linkedTestCaseId: string;
      evidence: string;
      comment: string;
    }>
  ) {
    return apiRequest<{ bug: BugReportRecord }>(`/api/qa/bugs/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },
  listBugHistory(id: number) {
    return apiRequest<{ history: DefectHistoryRecord[] }>(`/api/qa/bugs/${id}/history`);
  },
  addBugComment(id: number, comment: string) {
    return apiRequest<{ entry: DefectHistoryRecord }>(`/api/qa/bugs/${id}/history`, {
      method: 'POST',
      body: { comment },
    });
  },
  gitlabStatus() {
    return apiRequest<{ gitlab: GitLabStatusInfo }>('/api/qa/gitlab/status');
  },
  createGitLabIssue(bugId: number) {
    return apiRequest<{
      bug: BugReportRecord;
      gitlabIssue: { issueId: string; issueUrl: string };
    }>(`/api/qa/bugs/${bugId}/gitlab`, { method: 'POST' });
  },
  deleteBug(id: number) {
    return apiRequest<{ message: string; id: number }>(`/api/qa/bugs/${id}`, {
      method: 'DELETE',
    });
  },

  // Automation Runs
  listAutomationRuns() {
    return apiRequest<{ runs: AutomationRunRecord[] }>('/api/qa/automation/runs');
  },
  runNewmanSuite() {
    return apiRequest<{ run: AutomationRunRecord }>('/api/qa/automation/run-newman', {
      method: 'POST',
    });
  },
  runPostgresValidation() {
    return apiRequest<{ run: AutomationRunRecord; checks: PostgresCheckItem[] }>(
      '/api/qa/automation/run-postgres',
      { method: 'POST' }
    );
  },
  listAuditLogs() {
    return apiRequest<{ logs: QaAuditLogRecord[] }>('/api/qa/audit-logs');
  },
  previewRecovery() {
    return apiRequest<{ preview: QaRecoveryPreview }>('/api/qa/admin/recovery/preview');
  },
  executeRecovery(confirmRecovery: boolean) {
    return apiRequest<QaRecoveryResult>('/api/qa/admin/recovery/execute', {
      method: 'POST',
      body: { confirmRecovery },
    });
  },
};
