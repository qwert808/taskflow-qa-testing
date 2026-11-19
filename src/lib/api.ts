import type {
  BugReportRecord,
  BugStatus,
  DashboardStats,
  QaPriority,
  SortOrder,
  Task,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseRecord,
  TestCaseStatus,
  TestType,
  UserProfile,
} from './types';

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(message: string, status: number, details?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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
    throw new ApiError(message, response.status, details);
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
    return apiRequest<{ user: UserProfile; token: string; message: string }>(
      '/api/auth/login',
      { method: 'POST', body: payload, skipAuth: true }
    );
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
    return apiRequest<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: payload,
    });
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
    return apiRequest<{ task: Task }>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },
  updateStatus(id: number, status: TaskStatus) {
    return apiRequest<{ task: Task }>(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string; id: number }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  },
  seedSamples() {
    return apiRequest<{ tasks: Task[] }>('/api/tasks/seed', { method: 'POST' });
  },
  stats() {
    return apiRequest<{ stats: DashboardStats }>('/api/dashboard/stats');
  },
};

export const qaApi = {
  listTestCases() {
    return apiRequest<{ testCases: TestCaseRecord[] }>('/api/qa/test-cases');
  },
  createTestCase(payload: {
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
  }) {
    return apiRequest<{ testCase: TestCaseRecord }>('/api/qa/test-cases', {
      method: 'POST',
      body: payload,
    });
  },
  updateTestCase(
    id: number,
    payload: { status?: TestCaseStatus; actualResult?: string; defectId?: string }
  ) {
    return apiRequest<{ testCase: TestCaseRecord }>(`/api/qa/test-cases/${id}`, {
      method: 'PUT',
      body: payload,
    });
  },
  listBugs() {
    return apiRequest<{ bugs: BugReportRecord[] }>('/api/qa/bugs');
  },
  createBug(payload: {
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
  }) {
    return apiRequest<{ bug: BugReportRecord }>('/api/qa/bugs', {
      method: 'POST',
      body: payload,
    });
  },
  updateBugStatus(id: number, status: BugStatus) {
    return apiRequest<{ bug: BugReportRecord }>(`/api/qa/bugs/${id}`, {
      method: 'PUT',
      body: { status },
    });
  },
  deleteBug(id: number) {
    return apiRequest<{ message: string; id: number }>(`/api/qa/bugs/${id}`, {
      method: 'DELETE',
    });
  },
};
