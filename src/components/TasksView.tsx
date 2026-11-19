import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { filterAndSortTasks, isTaskOverdue } from '../lib/analytics';
import type { SortOrder, Task, TaskPriority, TaskSortBy, TaskStatus } from '../lib/types';

interface TasksViewProps {
  tasks: Task[];
  loading: boolean;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onToggleStatus: (task: Task) => void;
  onDeleteTask: (task: Task) => Promise<void>;
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: 'text-red-700 font-medium',
  medium: 'text-amber-700 font-medium',
  low: 'text-slate-600',
};

export function TasksView({
  tasks,
  loading,
  onCreateTask,
  onEditTask,
  onToggleStatus,
  onDeleteTask,
}: TasksViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [sortOption, setSortOption] = useState<string>('createdAt:desc');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [sortBy, sortOrder] = sortOption.split(':') as [TaskSortBy, SortOrder];

  const visibleTasks = useMemo(
    () =>
      filterAndSortTasks(tasks, {
        search,
        status: statusFilter,
        priority: priorityFilter,
        sortBy,
        sortOrder,
      }),
    [tasks, search, statusFilter, priorityFilter, sortBy, sortOrder]
  );

  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== 'all' || priorityFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
  };

  const handleDelete = async (task: Task) => {
    setDeletingId(task.id);
    try {
      await onDeleteTask(task);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter & Sort Toolbar */}
      <section
        aria-label="Task search and filters"
        className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="task-search-input" className="sr-only">
            Search tasks by title
          </label>
          <input
            id="task-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks by title or description..."
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive segmented control for Status */}
          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter by status"
          >
            {(['all', 'pending', 'completed'] as const).map((statusValue) => {
              const active = statusFilter === statusValue;
              const label =
                statusValue === 'all'
                  ? 'All'
                  : statusValue === 'pending'
                    ? 'Pending'
                    : 'Completed';
              return (
                <button
                  key={statusValue}
                  type="button"
                  onClick={() => setStatusFilter(statusValue)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-priority" className="sr-only">
              Filter by priority
            </label>
            <select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-tasks" className="sr-only">
              Sort tasks
            </label>
            <select
              id="sort-tasks"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            >
              <option value="createdAt:desc">Created: Newest</option>
              <option value="createdAt:asc">Created: Oldest</option>
              <option value="dueDate:asc">Deadline: Soonest</option>
              <option value="dueDate:desc">Deadline: Latest</option>
            </select>
          </div>
        </div>
      </section>

      {/* Task Data Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-600 tabular-nums">
            Showing <strong className="font-mono text-slate-900">{visibleTasks.length}</strong> of{' '}
            <strong className="font-mono text-slate-900">{tasks.length}</strong> tasks
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              Reset filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="divide-y divide-slate-200">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="h-4 w-64 bg-slate-100 rounded" />
                <div className="h-4 w-32 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="font-display text-base font-semibold text-slate-900">
              {hasActiveFilters ? 'No matching tasks found' : 'Your task list is empty'}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search keywords, status tab, or priority filter.'
                : 'Add your first task with a title, priority level, and deadline.'}
            </p>
            <div className="mt-5">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCreateTask}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>New Task</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-5 pr-2 w-10">Done</th>
                  <th className="py-3 px-3">Task</th>
                  <th className="py-3 px-3 whitespace-nowrap">Priority</th>
                  <th className="py-3 px-3 whitespace-nowrap">Status</th>
                  <th className="py-3 px-3 whitespace-nowrap">Deadline</th>
                  <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {visibleTasks.map((task) => {
                  const completed = task.status === 'completed';
                  const overdue = isTaskOverdue(task);
                  return (
                    <tr
                      key={task.id}
                      data-testid={`task-row-${task.id}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 pl-5 pr-2 align-top">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(task)}
                          aria-label={
                            completed
                              ? `Mark "${task.title}" as pending`
                              : `Mark "${task.title}" as completed`
                          }
                          aria-pressed={completed}
                          className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                            completed
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'border-slate-300 bg-white text-transparent hover:border-blue-700'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                      <td className="py-3.5 px-3 align-top max-w-md">
                        <p
                          className={`font-medium ${
                            completed ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <span className={`text-xs capitalize ${PRIORITY_STYLE[task.priority]}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            completed
                              ? 'text-emerald-700'
                              : overdue
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {completed ? 'Completed' : overdue ? 'Overdue' : 'Pending'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <span
                          className={`text-xs font-mono tabular-nums ${
                            overdue ? 'text-red-700 font-medium' : 'text-slate-600'
                          }`}
                        >
                          {task.dueDate ?? '—'}
                        </span>
                      </td>
                      <td className="py-3.5 pl-3 pr-5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            aria-label={`Edit "${task.title}"`}
                            className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === task.id}
                            onClick={() => handleDelete(task)}
                            aria-label={`Delete "${task.title}"`}
                            className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
