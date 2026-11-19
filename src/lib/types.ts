export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'completed';
export type TaskSortBy = 'dueDate' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface UserProfile {
  id: number;
  uid: string;
  name: string;
  email: string;
  authProvider: 'local' | 'google';
  createdAt: string;
}

export interface Task {
  id: number;
  userId: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionPercentage: number;
  byPriority: {
    high: number;
    medium: number;
    low: number;
  };
}

export type TestCaseStatus = 'Not Executed' | 'Pass' | 'Fail' | 'Blocked';
export type QaPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TestType = 'Manual' | 'Integration' | 'Regression' | 'UAT' | 'API' | 'SQL';

export interface TestCaseRecord {
  id: number;
  userId: number;
  testId: string;
  requirementId: string;
  module: string;
  testType: TestType;
  scenario: string;
  preconditions: string;
  testData: string;
  executionSteps: string;
  expectedResult: string;
  actualResult: string;
  priority: QaPriority;
  status: TestCaseStatus;
  defectId: string;
  executedAt: string | null;
  createdAt: string;
}

export type BugStatus = 'Open' | 'In Progress' | 'Retesting' | 'Closed';

export interface BugReportRecord {
  id: number;
  userId: number;
  bugCode: string;
  title: string;
  module: string;
  environment: string;
  precondition: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  severity: QaPriority;
  priority: QaPriority;
  status: BugStatus;
  evidence: string;
  createdAt: string;
}
