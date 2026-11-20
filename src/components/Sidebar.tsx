import React from 'react';
import {
  BarChart3,
  Bug,
  CheckSquare,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  ListTodo,
  LogOut,
  User,
  X,
} from 'lucide-react';
import type { UserProfile } from '../lib/types';

export type ActivePage =
  | 'dashboard'
  | 'tasks'
  | 'requirements'
  | 'qa-lab'
  | 'defects'
  | 'qa-reports'
  | 'profile';

interface SidebarProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  user: UserProfile;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const APP_NAV_ITEMS: Array<{
  id: ActivePage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'profile', label: 'Profile', icon: User },
];

const QA_NAV_ITEMS: Array<{
  id: ActivePage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'requirements', label: 'Requirements & RTM', icon: FileSpreadsheet },
  { id: 'qa-lab', label: 'QA Lab & Automation', icon: ClipboardCheck },
  { id: 'defects', label: 'Defects & GitLab', icon: Bug },
  { id: 'qa-reports', label: 'QA Reports', icon: BarChart3 },
];

export function Sidebar({
  activePage,
  onSelectPage,
  user,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const handleNavClick = (page: ActivePage) => {
    onSelectPage(page);
    onCloseMobile();
  };

  const renderGroup = (
    title: string,
    items: Array<{
      id: ActivePage;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }>
  ) => (
    <div>
      <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 text-slate-900">
          <div className="w-7 h-7 rounded-md bg-blue-700 text-white flex items-center justify-center shrink-0">
            <CheckSquare className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            TaskFlow
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Workspace navigation">
        {renderGroup('Application', APP_NAV_ITEMS)}
        {renderGroup('Quality Engineering', QA_NAV_ITEMS)}
      </nav>

      <div className="p-4 border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0"
          >
            {initials || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen print:hidden">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
