import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTraceabilityMatrix,
  computeDashboardStats,
  computeQaPortfolioReport,
  computeQaSummary,
  filterAndSortTasks,
  isTaskOverdue,
  normalizeTestCaseStatus,
} from './analytics';
import type { BugReportRecord, RequirementRecord, Task, TestCaseRecord } from './types';

const SAMPLE_TASKS: Task[] = [
  {
    id: 1,
    userId: 1,
    title: 'Overdue high priority API test',
    description: 'Check 401 and 403 responses',
    priority: 'high',
    status: 'pending',
    dueDate: '2026-11-15',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
  },
  {
    id: 2,
    userId: 1,
    title: 'Completed past task',
    description: 'Should not count as overdue',
    priority: 'medium',
    status: 'completed',
    dueDate: '2026-11-12',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-12T09:00:00.000Z',
  },
  {
    id: 3,
    userId: 1,
    title: 'Upcoming SQL verification',
    description: 'Verify foreign keys in PostgreSQL',
    priority: 'low',
    status: 'pending',
    dueDate: '2026-12-01',
    createdAt: '2026-11-18T14:00:00.000Z',
    updatedAt: '2026-11-18T14:00:00.000Z',
  },
];

test('isTaskOverdue excludes completed tasks and future deadlines (DASH-03)', () => {
  assert.equal(isTaskOverdue(SAMPLE_TASKS[0], '2026-11-19'), true);
  assert.equal(isTaskOverdue(SAMPLE_TASKS[1], '2026-11-19'), false);
  assert.equal(isTaskOverdue(SAMPLE_TASKS[2], '2026-11-19'), false);
  assert.equal(isTaskOverdue({ status: 'pending', dueDate: '2026-11-19' }, '2026-11-19'), false);
});

test('computeDashboardStats accurately aggregates counts and completion percentage (DASH-01..04)', () => {
  const emptyStats = computeDashboardStats([], '2026-11-19');
  assert.equal(emptyStats.totalTasks, 0);
  assert.equal(emptyStats.completionPercentage, 0);

  const stats = computeDashboardStats(SAMPLE_TASKS, '2026-11-19');
  assert.equal(stats.totalTasks, 3);
  assert.equal(stats.completedTasks, 1);
  assert.equal(stats.pendingTasks, 2);
  assert.equal(stats.overdueTasks, 1);
  assert.equal(stats.completionPercentage, 33);
  assert.deepEqual(stats.byPriority, { high: 1, medium: 1, low: 1 });
});

test('filterAndSortTasks filters by search, status, priority and sorts by deadline (SEARCH-01..03)', () => {
  const bySearch = filterAndSortTasks(SAMPLE_TASKS, { search: 'sql' });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, 3);

  const byStatus = filterAndSortTasks(SAMPLE_TASKS, { status: 'completed' });
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0].id, 2);

  const byPriority = filterAndSortTasks(SAMPLE_TASKS, { priority: 'high' });
  assert.equal(byPriority.length, 1);
  assert.equal(byPriority[0].id, 1);

  const sortedByDeadlineAsc = filterAndSortTasks(SAMPLE_TASKS, {
    sortBy: 'dueDate',
    sortOrder: 'asc',
  });
  assert.deepEqual(
    sortedByDeadlineAsc.map((t) => t.id),
    [2, 1, 3]
  );

  const sortedByCreatedDesc = filterAndSortTasks(SAMPLE_TASKS, {
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  assert.deepEqual(
    sortedByCreatedDesc.map((t) => t.id),
    [3, 2, 1]
  );
});

test('computeQaSummary computes pass rate and open defects accurately', () => {
  const summary = computeQaSummary(
    [{ status: 'Pass' }, { status: 'Pass' }, { status: 'Fail' }, { status: 'Not Run' }],
    [{ status: 'Open' }, { status: 'Closed' }, { status: 'Retesting' }]
  );
  assert.equal(summary.totalCases, 4);
  assert.equal(summary.executedCases, 3);
  assert.equal(summary.passedCases, 2);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.notRunCases, 1);
  assert.equal(summary.passRate, 67);
  assert.equal(summary.openBugs, 2);
  assert.equal(normalizeTestCaseStatus('Not Executed'), 'Not Run');
});

test('buildTraceabilityMatrix identifies uncovered requirements, unlinked cases, and failed requirements', () => {
  const reqs: RequirementRecord[] = [
    {
      id: 1,
      userId: 1,
      reqCode: 'AUTH-01',
      title: 'Registration',
      category: 'Functional',
      module: 'Authentication',
      userStory: '',
      acceptanceCriteria: 'Valid user saved',
      priority: 'Critical',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: 2,
      userId: 1,
      reqCode: 'AUTH-02',
      title: 'Email validation',
      category: 'Functional',
      module: 'Authentication',
      userStory: '',
      acceptanceCriteria: 'Invalid email rejected',
      priority: 'High',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: 3,
      userId: 1,
      reqCode: 'AUTH-03',
      title: 'Duplicate email',
      category: 'Functional',
      module: 'Authentication',
      userStory: '',
      acceptanceCriteria: '409 returned',
      priority: 'Critical',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
  ];

  const cases: TestCaseRecord[] = [
    {
      id: 10,
      userId: 1,
      testId: 'TC-001',
      requirementId: 'AUTH-01',
      module: 'Authentication',
      testType: 'Functional',
      technique: 'Positive Testing',
      scenario: 'Valid signup',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: '201',
      actualResult: '201',
      priority: 'High',
      status: 'Pass',
      tester: 'QA',
      defectId: '',
      executedAt: '2026-11-19T00:00:00.000Z',
      createdAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: 11,
      userId: 1,
      testId: 'TC-002',
      requirementId: 'AUTH-02',
      module: 'Authentication',
      testType: 'Functional',
      technique: 'Negative Testing',
      scenario: 'Bad email',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: '400',
      actualResult: '500',
      priority: 'High',
      status: 'Fail',
      tester: 'QA',
      defectId: 'BUG-001',
      executedAt: '2026-11-19T00:00:00.000Z',
      createdAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: 12,
      userId: 1,
      testId: 'TC-099',
      requirementId: 'ORPHAN-99',
      module: 'Other',
      testType: 'Manual',
      technique: 'Error Guessing',
      scenario: 'Unlinked scenario',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: 'OK',
      actualResult: '',
      priority: 'Low',
      status: 'Not Run',
      tester: '',
      defectId: '',
      executedAt: null,
      createdAt: '2026-11-19T00:00:00.000Z',
    },
  ];

  const rtm = buildTraceabilityMatrix(reqs, cases);
  assert.equal(rtm.totalRequirements, 3);
  assert.equal(rtm.coveredRequirements, 2);
  assert.equal(rtm.coveragePercentage, 67);
  assert.equal(rtm.uncoveredRequirements.length, 1);
  assert.equal(rtm.uncoveredRequirements[0].reqCode, 'AUTH-03');
  assert.equal(rtm.failedRequirements.length, 1);
  assert.equal(rtm.failedRequirements[0].reqCode, 'AUTH-02');
  assert.equal(rtm.unlinkedTestCases.length, 1);
  assert.equal(rtm.unlinkedTestCases[0].testId, 'TC-099');
});

test('computeQaPortfolioReport returns null pass/closure rates when no data has been executed', () => {
  const report = computeQaPortfolioReport([], [], [], [], []);
  assert.equal(report.passRatePct, null);
  assert.equal(report.defectClosureRatePct, null);
  assert.equal(report.regressionStatus, 'Not Run');

  const bugs: BugReportRecord[] = [
    {
      id: 1,
      userId: 1,
      bugCode: 'BUG-001',
      title: 'Critical auth bug',
      description: '',
      module: 'Authentication',
      environment: 'Local',
      browserDevice: 'Chrome',
      precondition: '',
      stepsToReproduce: '1',
      expectedResult: 'A',
      actualResult: 'B',
      severity: 'Critical',
      priority: 'High',
      status: 'Open',
      assignedDeveloper: 'Dev A',
      reporter: 'QA',
      linkedRequirementId: 'AUTH-01',
      linkedTestCaseId: 'TC-001',
      gitlabIssueId: '',
      gitlabIssueUrl: '',
      evidence: '',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
    {
      id: 2,
      userId: 1,
      bugCode: 'BUG-002',
      title: 'Fixed UI bug',
      description: '',
      module: 'Dashboard',
      environment: 'Local',
      browserDevice: 'Chrome',
      precondition: '',
      stepsToReproduce: '1',
      expectedResult: 'A',
      actualResult: 'B',
      severity: 'Medium',
      priority: 'Medium',
      status: 'Closed',
      assignedDeveloper: 'Dev B',
      reporter: 'QA',
      linkedRequirementId: 'DASH-01',
      linkedTestCaseId: 'TC-022',
      gitlabIssueId: '',
      gitlabIssueUrl: '',
      evidence: '',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
  ];
  const withBugs = computeQaPortfolioReport([], [], [], bugs, []);
  assert.equal(withBugs.openDefects, 1);
  assert.equal(withBugs.closedDefects, 1);
  assert.equal(withBugs.criticalHighDefects, 1);
  assert.equal(withBugs.defectClosureRatePct, 50);
  assert.equal(withBugs.defectsBySeverity.Critical, 1);
  assert.equal(withBugs.defectsByStatus.Closed, 1);
});
