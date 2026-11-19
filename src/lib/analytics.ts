import type {
  BugReportRecord,
  DashboardStats,
  SortOrder,
  Task,
  TaskPriority,
  TaskSortBy,
  TaskStatus,
  TestCaseRecord,
} from './types.ts';
import { getTodayIsoDate } from './validation.ts';

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

  for (const tc of cases) {
    if (tc.status === 'Pass') passedCases += 1;
    else if (tc.status === 'Fail') failedCases += 1;
    else if (tc.status === 'Blocked') blockedCases += 1;
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
    passRate,
    openBugs,
    totalBugs: bugs.length,
  };
}
