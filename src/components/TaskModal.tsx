import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { getTodayIsoDate, validateTaskInput } from '../lib/validation';
import type { Task, TaskPriority, TaskStatus } from '../lib/types';

interface TaskModalProps {
  open: boolean;
  editingTask: Task | null;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
    allowPastDueDate?: boolean;
  }) => Promise<void>;
}

export function TaskModal({ open, editingTask, onClose, onSave }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [dueDate, setDueDate] = useState('');
  const [allowPastDueDate, setAllowPastDueDate] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setPriority(editingTask.priority);
      setStatus(editingTask.status);
      setDueDate(editingTask.dueDate ?? '');
      setAllowPastDueDate(true);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('pending');
      setDueDate('');
      setAllowPastDueDate(false);
    }
    setFieldErrors({});
    setFormError('');
  }, [open, editingTask]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError('');

    const validation = validateTaskInput(
      {
        title,
        description,
        priority,
        status,
        dueDate: dueDate || null,
        allowPastDueDate,
      },
      { isUpdate: Boolean(editingTask) }
    );

    if (!validation.valid || !validation.data) {
      setFieldErrors(validation.errors);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...validation.data,
        allowPastDueDate: editingTask ? undefined : allowPastDueDate,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setFormError('Failed to save task. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const today = getTodayIsoDate();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="task-modal-title" className="font-display text-lg font-semibold text-slate-900">
            {editingTask ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task dialog"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {formError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-slate-700 mb-1.5">
              Task Title
            </label>
            <input
              id="task-title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Complete API regression testing"
              aria-invalid={Boolean(fieldErrors.title)}
              className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                fieldErrors.title ? 'border-red-500' : 'border-slate-300'
              }`}
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.title}</p>
            )}
          </div>

          <div>
            <label htmlFor="task-description" className="block text-sm font-medium text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              id="task-description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Document steps, expected outcomes, or linked test criteria..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="task-priority" className="block text-sm font-medium text-slate-700 mb-1.5">
                Priority
              </label>
              <select
                id="task-priority"
                name="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-status" className="block text-sm font-medium text-slate-700 mb-1.5">
                Status
              </label>
              <select
                id="task-status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-due-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                Deadline
              </label>
              <input
                id="task-due-date"
                name="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-invalid={Boolean(fieldErrors.dueDate)}
                className={`w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  fieldErrors.dueDate ? 'border-red-500' : 'border-slate-300'
                }`}
              />
            </div>
          </div>

          {fieldErrors.dueDate && (
            <p className="text-xs text-red-700">{fieldErrors.dueDate}</p>
          )}

          {!editingTask && (
            <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={allowPastDueDate}
                onChange={(e) => setAllowPastDueDate(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <span>
                Allow past deadline before <span className="font-mono tabular-nums">{today}</span>{' '}
                (override default date policy for overdue dashboard testing).
              </span>
            </label>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {saving ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
