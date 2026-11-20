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

export type QaPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type RequirementCategory = 'Functional' | 'Non-Functional';

export interface RequirementRecord {
  id: number;
  userId: number;
  reqCode: string;
  title: string;
  category: RequirementCategory;
  module: string;
  userStory: string;
  acceptanceCriteria: string;
  priority: QaPriority;
  createdAt: string;
  updatedAt: string;
}

export type TestCaseStatus = 'Not Run' | 'Not Executed' | 'Pass' | 'Fail' | 'Blocked';
export type TestType =
  | 'Manual'
  | 'Functional'
  | 'Integration'
  | 'Regression'
  | 'Exploratory'
  | 'UAT'
  | 'API'
  | 'SQL';

export type TestTechnique =
  | 'Positive Testing'
  | 'Negative Testing'
  | 'Boundary Value Analysis'
  | 'Equivalence Partitioning'
  | 'Decision Table Testing'
  | 'State Transition Testing'
  | 'Error Guessing';

export interface TestCaseRecord {
  id: number;
  userId: number;
  testId: string;
  requirementId: string;
  requirementRefId?: number | null;
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
  executedAt: string | null;
  createdAt: string;
}

export type ExecutionOrigin = 'Internal QA' | 'External User / Client';
export type CycleStatus = 'Planned' | 'Active' | 'Completed';

export interface TestCycleRecord {
  id: number;
  userId: number;
  name: string;
  scope: string;
  executionOrigin: ExecutionOrigin;
  environment: string;
  status: CycleStatus;
  notes: string;
  createdAt: string;
}

export interface TestExecutionRecord {
  id: number;
  userId: number;
  testCaseId: number | null;
  cycleId: number | null;
  testId?: string;
  scenario?: string;
  testCaseCodeSnapshot?: string;
  testCaseScenarioSnapshot?: string;
  cycleName?: string | null;
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
  executedAt: string;
}

export type BugStatus =
  | 'Open'
  | 'In Progress'
  | 'Fixed'
  | 'Retesting'
  | 'Closed'
  | 'Reopened';

export interface BugReportRecord {
  id: number;
  userId: number;
  bugCode: string;
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
  status: BugStatus;
  assignedDeveloper: string;
  reporter: string;
  linkedRequirementId: string;
  linkedRequirementRefId?: number | null;
  linkedTestCaseId: string;
  linkedTestCaseRefId?: number | null;
  gitlabIssueId: string;
  gitlabIssueUrl: string;
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

export interface DefectHistoryRecord {
  id: number;
  userId: number;
  bugId: number;
  actor: string;
  action: 'Created' | 'Status Change' | 'Comment' | 'GitLab Sync' | 'Reference Unlinked';
  fromStatus: string;
  toStatus: string;
  comment: string;
  createdAt: string;
}

export interface RequirementDependencies {
  requirement: { id: number; reqCode: string; title: string };
  linkedTestCases: Array<{ id: number; testId: string; scenario: string }>;
  linkedBugReports: Array<{ id: number; bugCode: string; title: string; status: string }>;
  totalLinked: number;
}

export interface TestCaseDependencies {
  testCase: { id: number; testId: string; scenario: string };
  linkedExecutionsCount: number;
  linkedBugReports: Array<{ id: number; bugCode: string; title: string; status: string }>;
  totalLinked: number;
}

export interface QaAuditLogRecord {
  id: number;
  userId: number;
  entityType: string;
  entityId: number;
  entityCode: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface QaRecoveryPreview {
  userId: number;
  qaRequirementsInitialized: boolean;
  qaTestCasesInitialized: boolean;
  missingDefaultRequirements: string[];
  missingDefaultTestCases: string[];
  unresolvedTestCases: Array<{ id: number; testId: string; requirementId: string }>;
  unresolvedBugReports: Array<{
    id: number;
    bugCode: string;
    linkedRequirementId: string;
    linkedTestCaseId: string;
  }>;
  missingExecutionSnapshotsCount: number;
  requiresRecovery: boolean;
}

export interface QaRecoveryResult {
  recovered: boolean;
  auditLogId: number;
  summary: {
    insertedRequirements: string[];
    insertedTestCases: string[];
    repairedTestCaseRefs: number;
    repairedBugRefs: number;
    repairedExecutionSnapshots: number;
  };
}

export interface AutomationFailedEndpoint {
  name: string;
  assertion: string;
  message: string;
}

export interface AutomationRunRecord {
  id: number;
  userId: number;
  suite: 'newman' | 'playwright' | 'postgres';
  runLabel: string;
  totalItems: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  avgResponseMs: number;
  failedEndpoints: AutomationFailedEndpoint[];
  reportPath: string;
  executedAt: string;
}

export interface GitLabStatusInfo {
  configured: boolean;
  baseUrl: string;
  projectId: string;
}
