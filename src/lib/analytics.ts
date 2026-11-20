import type {
  AutomationRunRecord,
  BugReportRecord,
  BugStatus,
  DashboardStats,
  QaPriority,
  RequirementRecord,
  SortOrder,
  Task,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseRecord,
  TestCaseStatus,
  TestExecutionRecord,
} from './types.ts';
import { getTodayIsoDate } from './validation.ts';

export function normalizeTestCaseStatus(status: TestCaseStatus | string): 'Not Run' | 'Pass' | 'Fail' | 'Blocked' {
  if (status === 'Pass' || status === 'Fail' || status === 'Blocked') return status;
  return 'Not Run';
}

export function isTaskOverdue(task: Pick<Task, 'status' | 'dueDate'>, todayIso?: string): boolean {
  if (task.status === 'completed' || !task.dueDate) {
    return false;
  }
  const refDate = todayIso ?? getTodayIsoDate();
  return task.dueDate < refDate;
}

export function computeDashboardStats(
  taskList: ReadonlyArray<Pick<Task, 'status' | 'priority' | 'dueDate'>>,
  todayIso?: string
): DashboardStats {
  const refDate = todayIso ?? getTodayIsoDate();
  const totalTasks = taskList.length;
  let completedTasks = 0;
  let pendingTasks = 0;
  let overdueTasks = 0;
  const byPriority = { high: 0, medium: 0, low: 0 };

  for (const task of taskList) {
    if (task.status === 'completed') {
      completedTasks += 1;
    } else {
      pendingTasks += 1;
      if (isTaskOverdue(task, refDate)) {
        overdueTasks += 1;
      }
    }
    if (task.priority === 'high') byPriority.high += 1;
    else if (task.priority === 'medium') byPriority.medium += 1;
    else if (task.priority === 'low') byPriority.low += 1;
  }

  const completionPercentage =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionPercentage,
    byPriority,
  };
}

export interface TaskFilterOptions {
  search?: string;
  status?: 'all' | TaskStatus;
  priority?: 'all' | TaskPriority;
  sortBy?: TaskSortBy;
  sortOrder?: SortOrder;
}

export function filterAndSortTasks(
  taskList: ReadonlyArray<Task>,
  options: TaskFilterOptions = {}
): Task[] {
  const query = (options.search ?? '').trim().toLowerCase();
  const statusFilter = options.status ?? 'all';
  const priorityFilter = options.priority ?? 'all';
  const sortBy = options.sortBy ?? 'createdAt';
  const sortOrder = options.sortOrder ?? 'desc';

  const filtered = taskList.filter((task) => {
    if (query) {
      const inTitle = task.title.toLowerCase().includes(query);
      const inDesc = task.description.toLowerCase().includes(query);
      if (!inTitle && !inDesc) return false;
    }
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false;
    }
    return true;
  });

  const multiplier = sortOrder === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    if (sortBy === 'dueDate') {
      if (!a.dueDate && !b.dueDate) return a.id - b.id;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const cmp = a.dueDate.localeCompare(b.dueDate);
      return cmp !== 0 ? cmp * multiplier : a.id - b.id;
    }

    const timeA = Date.parse(a.createdAt) || 0;
    const timeB = Date.parse(b.createdAt) || 0;
    if (timeA !== timeB) {
      return (timeA - timeB) * multiplier;
    }
    return (a.id - b.id) * multiplier;
  });
}

export interface QaSummaryStats {
  totalCases: number;
  executedCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
  notRunCases: number;
  passRate: number;
  openBugs: number;
  totalBugs: number;
}

export function computeQaSummary(
  cases: ReadonlyArray<Pick<TestCaseRecord, 'status'>>,
  bugs: ReadonlyArray<Pick<BugReportRecord, 'status'>>
): QaSummaryStats {
  const totalCases = cases.length;
  let passedCases = 0;
  let failedCases = 0;
  let blockedCases = 0;
  let notRunCases = 0;

  for (const tc of cases) {
    const norm = normalizeTestCaseStatus(tc.status);
    if (norm === 'Pass') passedCases += 1;
    else if (norm === 'Fail') failedCases += 1;
    else if (norm === 'Blocked') blockedCases += 1;
    else notRunCases += 1;
  }

  const executedCases = passedCases + failedCases + blockedCases;
  const passRate = executedCases === 0 ? 0 : Math.round((passedCases / executedCases) * 100);
  const openBugs = bugs.filter((b) => b.status !== 'Closed').length;

  return {
    totalCases,
    executedCases,
    passedCases,
    failedCases,
    blockedCases,
    notRunCases,
    passRate,
    openBugs,
    totalBugs: bugs.length,
  };
}

export type RtmVerificationStatus =
  | 'Uncovered'
  | 'Not Run'
  | 'In Progress'
  | 'Passed'
  | 'Failed'
  | 'Blocked';

export interface RtmRow {
  requirement: RequirementRecord;
  linkedTestCases: TestCaseRecord[];
  covered: boolean;
  status: RtmVerificationStatus;
}

export interface RtmSummary {
  rows: RtmRow[];
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: RequirementRecord[];
  failedRequirements: RequirementRecord[];
  unlinkedTestCases: TestCaseRecord[];
  coveragePercentage: number;
}

export function buildTraceabilityMatrix(
  requirementsList: ReadonlyArray<RequirementRecord>,
  testCasesList: ReadonlyArray<TestCaseRecord>
): RtmSummary {
  const reqCodeSet = new Set(requirementsList.map((r) => r.reqCode.trim().toUpperCase()));
  const byReqCode = new Map<string, TestCaseRecord[]>();

  for (const tc of testCasesList) {
    const key = tc.requirementId.trim().toUpperCase();
    const bucket = byReqCode.get(key) ?? [];
    bucket.push(tc);
    byReqCode.set(key, bucket);
  }

  const rows: RtmRow[] = [];
  const uncoveredRequirements: RequirementRecord[] = [];
  const failedRequirements: RequirementRecord[] = [];

  for (const req of requirementsList) {
    const key = req.reqCode.trim().toUpperCase();
    const linked = byReqCode.get(key) ?? [];
    const covered = linked.length > 0;

    let status: RtmVerificationStatus = 'Uncovered';
    if (!covered) {
      uncoveredRequirements.push(req);
    } else {
      const normalized = linked.map((tc) => normalizeTestCaseStatus(tc.status));
      if (normalized.some((s) => s === 'Fail')) {
        status = 'Failed';
        failedRequirements.push(req);
      } else if (normalized.some((s) => s === 'Blocked')) {
        status = 'Blocked';
      } else if (normalized.every((s) => s === 'Pass')) {
        status = 'Passed';
      } else if (normalized.every((s) => s === 'Not Run')) {
        status = 'Not Run';
      } else {
        status = 'In Progress';
      }
    }

    rows.push({
      requirement: req,
      linkedTestCases: linked,
      covered,
      status,
    });
  }

  const unlinkedTestCases = testCasesList.filter(
    (tc) => !reqCodeSet.has(tc.requirementId.trim().toUpperCase())
  );

  const totalRequirements = requirementsList.length;
  const coveredRequirements = totalRequirements - uncoveredRequirements.length;
  const coveragePercentage =
    totalRequirements === 0 ? 0 : Math.round((coveredRequirements / totalRequirements) * 100);

  return {
    rows,
    totalRequirements,
    coveredRequirements,
    uncoveredRequirements,
    failedRequirements,
    unlinkedTestCases,
    coveragePercentage,
  };
}

export interface ExecutionTrendPoint {
  date: string;
  passed: number;
  failed: number;
  blocked: number;
  total: number;
}

export interface QaPortfolioReport {
  totalRequirements: number;
  coveredRequirements: number;
  requirementCoveragePct: number;
  totalTestCases: number;
  executedTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  blockedTestCases: number;
  notRunTestCases: number;
  passRatePct: number | null;
  totalDefects: number;
  openDefects: number;
  closedDefects: number;
  criticalHighDefects: number;
  defectClosureRatePct: number | null;
  defectsBySeverity: Record<QaPriority, number>;
  defectsByStatus: Record<BugStatus, number>;
  executionTrend: ExecutionTrendPoint[];
  regressionStatus: 'Not Run' | 'Passing' | 'Failing' | 'Partial';
  latestNewmanRun: AutomationRunRecord | null;
  latestPlaywrightRun: AutomationRunRecord | null;
  latestPostgresRun: AutomationRunRecord | null;
}

export function computeQaPortfolioReport(
  requirementsList: ReadonlyArray<RequirementRecord>,
  testCasesList: ReadonlyArray<TestCaseRecord>,
  executionsList: ReadonlyArray<TestExecutionRecord>,
  bugsList: ReadonlyArray<BugReportRecord>,
  automationRunsList: ReadonlyArray<AutomationRunRecord>
): QaPortfolioReport {
  const rtm = buildTraceabilityMatrix(requirementsList, testCasesList);
  const tcSummary = computeQaSummary(testCasesList, bugsList);

  const defectsBySeverity: Record<QaPriority, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  const defectsByStatus: Record<BugStatus, number> = {
    Open: 0,
    'In Progress': 0,
    Fixed: 0,
    Retesting: 0,
    Closed: 0,
    Reopened: 0,
  };

  let closedDefects = 0;
  let criticalHighDefects = 0;
  for (const bug of bugsList) {
    if (bug.severity in defectsBySeverity) {
      defectsBySeverity[bug.severity] += 1;
    }
    if (bug.status in defectsByStatus) {
      defectsByStatus[bug.status] += 1;
    }
    if (bug.status === 'Closed') {
      closedDefects += 1;
    } else if (bug.severity === 'Critical' || bug.severity === 'High') {
      criticalHighDefects += 1;
    }
  }

  const trendMap = new Map<string, ExecutionTrendPoint>();
  for (const ex of executionsList) {
    const dateKey = ex.executedAt.slice(0, 10);
    const pt = trendMap.get(dateKey) ?? {
      date: dateKey,
      passed: 0,
      failed: 0,
      blocked: 0,
      total: 0,
    };
    if (ex.status === 'Pass') pt.passed += 1;
    else if (ex.status === 'Fail') pt.failed += 1;
    else if (ex.status === 'Blocked') pt.blocked += 1;
    pt.total += 1;
    trendMap.set(dateKey, pt);
  }
  const executionTrend = Array.from(trendMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const findLatest = (suite: AutomationRunRecord['suite']) =>
    automationRunsList.find((r) => r.suite === suite) ?? null;

  const latestNewmanRun = findLatest('newman');
  const latestPlaywrightRun = findLatest('playwright');
  const latestPostgresRun = findLatest('postgres');

  // Derive genuine regression status from executed regression cases + latest Newman run
  const regressionCases = testCasesList.filter((tc) => tc.testType === 'Regression');
  const regStatuses = regressionCases.map((tc) => normalizeTestCaseStatus(tc.status));
  const hasRegRun = regStatuses.some((s) => s !== 'Not Run') || latestNewmanRun !== null;

  let regressionStatus: QaPortfolioReport['regressionStatus'] = 'Not Run';
  if (hasRegRun) {
    const anyFail =
      regStatuses.some((s) => s === 'Fail') ||
      (latestNewmanRun !== null && latestNewmanRun.failedAssertions > 0);
    const allManualRegPass =
      regressionCases.length === 0 || regStatuses.every((s) => s === 'Pass');
    const newmanPass = latestNewmanRun === null || latestNewmanRun.failedAssertions === 0;
    if (anyFail) {
      regressionStatus = 'Failing';
    } else if (allManualRegPass && newmanPass) {
      regressionStatus = 'Passing';
    } else {
      regressionStatus = 'Partial';
    }
  }

  return {
    totalRequirements: rtm.totalRequirements,
    coveredRequirements: rtm.coveredRequirements,
    requirementCoveragePct: rtm.coveragePercentage,
    totalTestCases: tcSummary.totalCases,
    executedTestCases: tcSummary.executedCases,
    passedTestCases: tcSummary.passedCases,
    failedTestCases: tcSummary.failedCases,
    blockedTestCases: tcSummary.blockedCases,
    notRunTestCases: tcSummary.notRunCases,
    passRatePct: tcSummary.executedCases === 0 ? null : tcSummary.passRate,
    totalDefects: bugsList.length,
    openDefects: tcSummary.openBugs,
    closedDefects,
    criticalHighDefects,
    defectClosureRatePct:
      bugsList.length === 0 ? null : Math.round((closedDefects / bugsList.length) * 100),
    defectsBySeverity,
    defectsByStatus,
    executionTrend,
    regressionStatus,
    latestNewmanRun,
    latestPlaywrightRun,
    latestPostgresRun,
  };
}
