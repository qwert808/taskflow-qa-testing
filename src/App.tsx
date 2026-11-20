import React, { useCallback, useEffect, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar, type ActivePage } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { TasksView } from './components/TasksView';
import { ProfileView } from './components/ProfileView';
import { QaLabView } from './components/QaLabView';
import { RequirementsView } from './components/RequirementsView';
import { DefectsView } from './components/DefectsView';
import { QaAnalyticsView } from './components/QaAnalyticsView';
import { TaskModal } from './components/TaskModal';
import { tasksApi } from './lib/api';
import { computeDashboardStats } from './lib/analytics';
import type { DashboardStats, Task, TaskPriority, TaskStatus } from './lib/types';

const PAGE_TITLES: Record<ActivePage, { breadcrumb: string; title: string }> = {
  dashboard: { breadcrumb: 'Application / Dashboard', title: 'Dashboard' },
  tasks: { breadcrumb: 'Application / Tasks', title: 'Tasks' },
  requirements: {
    breadcrumb: 'Quality Engineering / Requirements',
    title: 'Requirements & Traceability Matrix',
  },
  'qa-lab': {
    breadcrumb: 'Quality Engineering / Testing Lab',
    title: 'QA Lab & Automation',
  },
  defects: {
    breadcrumb: 'Quality Engineering / Defects',
    title: 'Defect Management & GitLab',
  },
  'qa-reports': {
    breadcrumb: 'Quality Engineering / Reports',
    title: 'QA Analytics & Reports',
  },
  profile: { breadcrumb: 'Application / Profile', title: 'User Profile' },
};

function TaskFlowWorkspace() {
  const { user, loading: authLoading, logout, refreshUser } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<DashboardStats>(computeDashboardStats([]));
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [seedingSamples, setSeedingSamples] = useState(false);
  const [bannerError, setBannerError] = useState('');

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadTasksAndStats = useCallback(async () => {
    if (!user) return;
    setLoadingTasks(true);
    setBannerError('');
    try {
      const [tasksRes, statsRes] = await Promise.all([tasksApi.list(), tasksApi.stats()]);
      setTasks(tasksRes.tasks);
      setStats(statsRes.stats);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Unable to load workspace tasks.');
    } finally {
      setLoadingTasks(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTasksAndStats();
    } else {
      setTasks([]);
      setStats(computeDashboardStats([]));
    }
  }, [user, loadTasksAndStats]);

  const openCreateModal = () => {
    setEditingTask(null);
    setTaskModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTaskModalOpen(true);
  };

  const handleSaveTask = async (payload: {
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
    allowPastDueDate?: boolean;
  }) => {
    if (editingTask) {
      await tasksApi.update(editingTask.id, {
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        status: payload.status,
        dueDate: payload.dueDate,
      });
    } else {
      await tasksApi.create(payload);
    }
    await loadTasksAndStats();
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    setBannerError('');
    try {
      const res = await tasksApi.updateStatus(task.id, nextStatus);
      const updatedList = tasks.map((item) => (item.id === task.id ? res.task : item));
      setTasks(updatedList);
      setStats(computeDashboardStats(updatedList));
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to update task status.');
    }
  };

  const handleDeleteTask = async (task: Task) => {
    setBannerError('');
    try {
      await tasksApi.remove(task.id);
      const remaining = tasks.filter((item) => item.id !== task.id);
      setTasks(remaining);
      setStats(computeDashboardStats(remaining));
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  };

  const handleSeedSamples = async () => {
    setSeedingSamples(true);
    setBannerError('');
    try {
      await tasksApi.seedSamples();
      await loadTasksAndStats();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load sample tasks.');
    } finally {
      setSeedingSamples(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading TaskFlow workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const headerInfo = PAGE_TITLES[activePage];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        user={user}
        onLogout={logout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 print:border-b">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md print:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{headerInfo.breadcrumb}</p>
              <h1 className="font-display text-lg font-bold text-slate-900 truncate">
                {headerInfo.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 print:hidden">
            {(activePage === 'dashboard' || activePage === 'tasks') && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>New Task</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {bannerError && (
            <div
              role="alert"
              className="mb-6 px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4"
            >
              <span>{bannerError}</span>
              <button
                type="button"
                onClick={() => setBannerError('')}
                className="text-xs font-medium text-red-800 underline whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          )}

          {activePage === 'dashboard' && (
            <DashboardView
              stats={stats}
              tasks={tasks}
              loading={loadingTasks}
              seeding={seedingSamples}
              onCreateTask={openCreateModal}
              onSeedSamples={handleSeedSamples}
              onToggleStatus={handleToggleStatus}
              onEditTask={openEditModal}
              onNavigateTasks={() => setActivePage('tasks')}
              onNavigateQaLab={() => setActivePage('qa-lab')}
            />
          )}

          {activePage === 'tasks' && (
            <TasksView
              tasks={tasks}
              loading={loadingTasks}
              onCreateTask={openCreateModal}
              onEditTask={openEditModal}
              onToggleStatus={handleToggleStatus}
              onDeleteTask={handleDeleteTask}
            />
          )}

          {activePage === 'requirements' && <RequirementsView />}

          {activePage === 'qa-lab' && <QaLabView user={user} onTasksChanged={loadTasksAndStats} />}

          {activePage === 'defects' && <DefectsView user={user} />}

          {activePage === 'qa-reports' && <QaAnalyticsView />}

          {activePage === 'profile' && <ProfileView user={user} onUserUpdated={refreshUser} />}
        </main>
      </div>

      <TaskModal
        open={taskModalOpen}
        editingTask={editingTask}
        onClose={() => setTaskModalOpen(false)}
        onSave={handleSaveTask}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TaskFlowWorkspace />
    </AuthProvider>
  );
}
