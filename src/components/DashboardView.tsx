import React from 'react';
import { ArrowRight, Check, Plus, Sparkles } from 'lucide-react';
import { isTaskOverdue } from '../lib/analytics';
import type { DashboardStats, Task } from '../lib/types';

interface DashboardViewProps {
  stats: DashboardStats;
  tasks: Task[];
  loading: boolean;
  seeding: boolean;
  onCreateTask: () => void;
  onSeedSamples: () => void;
  onToggleStatus: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onNavigateTasks: () => void;
  onNavigateQaLab: () => void;
}

const PRIORITY_LABEL: Record<Task['priority'], { text: string; className: string }> = {
  high: { text: 'High', className: 'text-red-700 font-medium' },
  medium: { text: 'Medium', className: 'text-amber-700 font-medium' },
  low: { text: 'Low', className: 'text-slate-600' },
};

export function DashboardView({
  stats,
  tasks,
  loading,
  seeding,
  onCreateTask,
  onSeedSamples,
  onToggleStatus,
  onEditTask,
  onNavigateTasks,
  onNavigateQaLab,
}: DashboardViewProps) {
  const overdueList = tasks.filter((t) => isTaskOverdue(t));
  const upcomingList = tasks
    .filter((t) => t.status === 'pending' && !isTaskOverdue(t))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* 5-Column KPI Strip with symmetrical hairline grid borders */}
      <section aria-label="Task analytics summary" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-slate-200">
          <div className="p-5 bg-white">
            <p className="text-xs font-medium text-slate-500">Total Tasks</p>
            <p
              data-testid="stat-total"
              className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums"
            >
              {loading ? '—' : stats.totalTasks}
            </p>
          </div>
          <div className="p-5 bg-white">
            <p className="text-xs font-medium text-slate-500">Completed</p>
            <p
              data-testid="stat-completed"
              className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums"
            >
              {loading ? '—' : stats.completedTasks}
            </p>
          </div>
          <div className="p-5 bg-white">
            <p className="text-xs font-medium text-slate-500">Pending</p>
            <p
              data-testid="stat-pending"
              className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums"
            >
              {loading ? '—' : stats.pendingTasks}
            </p>
          </div>
          <div className="p-5 bg-white">
            <p className="text-xs font-medium text-slate-500">Overdue</p>
            <p
              data-testid="stat-overdue"
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                stats.overdueTasks > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {loading ? '—' : stats.overdueTasks}
            </p>
          </div>
          <div className="p-5 bg-white col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-slate-500">Completion Rate</p>
            <p
              data-testid="stat-rate"
              className="mt-2 font-mono text-2xl font-semibold text-blue-700 tabular-nums"
            >
              {loading ? '—' : `${stats.completionPercentage}%`}
            </p>
          </div>
        </div>

        {/* Completion Progress Bar & Priority Breakdown */}
        <div className="px-5 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
              <span>Overall progress</span>
              <span className="font-mono tabular-nums">
                {stats.completedTasks} / {stats.totalTasks} tasks completed
              </span>
            </div>
            <div
              className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={stats.completionPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Task completion percentage"
            >
              <div
                className="h-full bg-blue-700 transition-transform duration-200 origin-left"
                style={{ width: `${stats.completionPercentage}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
            <span>
              High: <strong className="font-mono text-red-700">{stats.byPriority.high}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Medium: <strong className="font-mono text-amber-700">{stats.byPriority.medium}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Low: <strong className="font-mono text-slate-800">{stats.byPriority.low}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Main Content Area: Empty State vs Active Workstreams */}
      {!loading && tasks.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            No tasks recorded yet
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            Create your first task to begin tracking priorities and deadlines, or load four
            structured QA sample tasks (including an overdue item) to test filtering and analytics.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onCreateTask}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create First Task</span>
            </button>
            <button
              type="button"
              disabled={seeding}
              onClick={onSeedSamples}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4 text-blue-700" aria-hidden="true" />
              <span>{seeding ? 'Loading samples...' : 'Load Sample QA Tasks'}</span>
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Active & Overdue Queue */}
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Priority Focus Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Overdue items first, followed by active pending tasks.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateTasks}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0"
              >
                <span>View all tasks</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div className="divide-y divide-slate-200">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="h-4 w-56 bg-slate-100 rounded" />
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : overdueList.length === 0 && upcomingList.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-600">
                All tasks are completed. Create a new task or inspect your QA Lab test cases.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {[...overdueList, ...upcomingList].slice(0, 7).map((task) => {
                  const overdue = isTaskOverdue(task);
                  const priorityMeta = PRIORITY_LABEL[task.priority];
                  return (
                    <li
                      key={task.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(task)}
                          aria-label={`Mark "${task.title}" as completed`}
                          className="mt-0.5 w-5 h-5 rounded border border-slate-300 hover:border-blue-700 flex items-center justify-center text-transparent hover:text-blue-700 transition-colors shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className="text-sm font-medium text-slate-900 hover:text-blue-700 text-left truncate block max-w-full"
                          >
                            {task.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className={priorityMeta.className}>{priorityMeta.text}</span>
                            <span aria-hidden="true">·</span>
                            <span className={`font-mono tabular-nums ${overdue ? 'text-red-700 font-medium' : ''}`}>
                              {task.dueDate
                                ? overdue
                                  ? `Overdue (${task.dueDate})`
                                  : `Due ${task.dueDate}`
                                : 'No deadline'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditTask(task)}
                        aria-label={`Edit "${task.title}"`}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
                      >
                        Edit
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Right Column: QA Verification Quick Actions */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                QA Verification Scope
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Validate TaskFlow across three distinct layers: UI workflow behavior, REST API
                contracts, and PostgreSQL persistence.
              </p>

              <dl className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Requirements covered</dt>
                  <dd className="font-mono font-medium text-slate-900 tabular-nums">22 IDs</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Pre-built test matrix</dt>
                  <dd className="font-mono font-medium text-slate-900 tabular-nums">30 cases</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">REST API endpoints</dt>
                  <dd className="font-mono font-medium text-slate-900 tabular-nums">9 routes</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 space-y-2.5">
              <button
                type="button"
                onClick={onNavigateQaLab}
                className="w-full py-2 px-4 text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Open QA Testing Lab
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
