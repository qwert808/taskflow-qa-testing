import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardStats,
  computeQaSummary,
  filterAndSortTasks,
  isTaskOverdue,
} from './analytics';
import type { Task } from './types';

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
    [{ status: 'Pass' }, { status: 'Pass' }, { status: 'Fail' }, { status: 'Not Executed' }],
    [{ status: 'Open' }, { status: 'Closed' }, { status: 'Retesting' }]
  );
  assert.equal(summary.totalCases, 4);
  assert.equal(summary.executedCases, 3);
  assert.equal(summary.passedCases, 2);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.passRate, 67);
  assert.equal(summary.openBugs, 2);
});
