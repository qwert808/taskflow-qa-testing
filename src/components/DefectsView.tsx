import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bug,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  History,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { qaApi } from '../lib/api';
import type {
  BugReportRecord,
  BugStatus,
  DefectHistoryRecord,
  GitLabStatusInfo,
  QaPriority,
  RequirementRecord,
  TestCaseRecord,
  UserProfile,
} from '../lib/types';

const BUG_STATUSES: BugStatus[] = [
  'Open',
  'In Progress',
  'Fixed',
  'Retesting',
  'Closed',
  'Reopened',
];

const SEVERITIES: QaPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const MODULES = [
  'Authentication',
  'Task Management',
  'Search & Filtering',
  'User Profile',
  'Dashboard Analytics',
  'REST API / Backend',
  'PostgreSQL Database',
];

const STATUS_STYLE: Record<BugStatus, string> = {
  Open: 'text-red-700 font-semibold',
  'In Progress': 'text-blue-700 font-semibold',
  Fixed: 'text-indigo-700 font-semibold',
  Retesting: 'text-amber-700 font-semibold',
  Closed: 'text-emerald-700 font-semibold',
  Reopened: 'text-rose-700 font-semibold',
};

const SEVERITY_STYLE: Record<QaPriority, string> = {
  Critical: 'text-red-700 font-semibold',
  High: 'text-orange-700 font-semibold',
  Medium: 'text-amber-700 font-medium',
  Low: 'text-slate-600 font-medium',
};

function buildGitLabMarkdown(bug: BugReportRecord): string {
  return [
    `## ${bug.bugCode}: ${bug.title}`,
    '',
    `- **Module:** ${bug.module}`,
    `- **Severity:** ${bug.severity}`,
    `- **Priority:** ${bug.priority}`,
    `- **Status:** ${bug.status}`,
    `- **Environment:** ${bug.environment}`,
    `- **Browser / Device:** ${bug.browserDevice}`,
    `- **Assigned Developer:** ${bug.assignedDeveloper || 'Unassigned'}`,
    `- **Reporter:** ${bug.reporter || 'QA Engineer'}`,
    bug.linkedRequirementId ? `- **Linked Requirement:** ${bug.linkedRequirementId}` : null,
    bug.linkedTestCaseId ? `- **Linked Test Case:** ${bug.linkedTestCaseId}` : null,
    '',
    bug.description ? `### Description\n${bug.description}\n` : null,
    bug.precondition ? `### Preconditions\n${bug.precondition}\n` : null,
    `### Steps to Reproduce\n${bug.stepsToReproduce}`,
    '',
    `### Expected Behaviour\n${bug.expectedResult}`,
    '',
    `### Actual Behaviour\n${bug.actualResult}`,
    '',
    bug.evidence ? `### Evidence\n${bug.evidence}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface DefectsViewProps {
  user: UserProfile;
}

export function DefectsView({ user }: DefectsViewProps) {
  const [bugs, setBugs] = useState<BugReportRecord[]>([]);
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [gitlabStatus, setGitlabStatus] = useState<GitLabStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BugStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | QaPriority>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | QaPriority>('all');
  const [devFilter, setDevFilter] = useState('all');
  const [reqFilter, setReqFilter] = useState('all');

  // Expanded bug + history
  const [selectedBugId, setSelectedBugId] = useState<number | null>(null);
  const [historyByBug, setHistoryByBug] = useState<Record<number, DefectHistoryRecord[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [syncingGitlabId, setSyncingGitlabId] = useState<number | null>(null);
  const [updatingStatusBugId, setUpdatingStatusBugId] = useState<number | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [savingBug, setSavingBug] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    module: 'Task Management',
    environment: 'Localhost / Staging',
    browserDevice: 'Chrome · Desktop',
    precondition: '',
    stepsToReproduce: '',
    expectedResult: '',
    actualResult: '',
    severity: 'High' as QaPriority,
    priority: 'High' as QaPriority,
    assignedDeveloper: 'Unassigned',
    reporter: user.name,
    linkedRequirementId: '',
    linkedTestCaseId: '',
    evidence: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bugsRes, reqRes, tcRes, glRes] = await Promise.all([
        qaApi.listBugs(),
        qaApi.listRequirements(),
        qaApi.listTestCases(),
        qaApi.gitlabStatus(),
      ]);
      setBugs(bugsRes.bugs);
      setRequirements(reqRes.requirements);
      setTestCases(tcRes.testCases);
      setGitlabStatus(glRes.gitlab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load defect tracker.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadHistory = async (bugId: number) => {
    setLoadingHistory(true);
    try {
      const res = await qaApi.listBugHistory(bugId);
      setHistoryByBug((prev) => ({ ...prev, [bugId]: res.history }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load defect history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleExpandBug = (bugId: number) => {
    if (selectedBugId === bugId) {
      setSelectedBugId(null);
      return;
    }
    setSelectedBugId(bugId);
    loadHistory(bugId);
  };

  const developersList = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => {
      if (b.assignedDeveloper) set.add(b.assignedDeveloper);
    });
    return Array.from(set).sort();
  }, [bugs]);

  const filteredBugs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bugs.filter((bug) => {
      if (statusFilter !== 'all' && bug.status !== statusFilter) return false;
      if (severityFilter !== 'all' && bug.severity !== severityFilter) return false;
      if (priorityFilter !== 'all' && bug.priority !== priorityFilter) return false;
      if (devFilter !== 'all' && bug.assignedDeveloper !== devFilter) return false;
      if (reqFilter !== 'all' && bug.linkedRequirementId !== reqFilter) return false;
      if (q) {
        const hay = [
          bug.bugCode,
          bug.title,
          bug.module,
          bug.description,
          bug.assignedDeveloper,
          bug.linkedRequirementId,
          bug.linkedTestCaseId,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bugs, search, statusFilter, severityFilter, priorityFilter, devFilter, reqFilter]);

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.title.trim() ||
      !form.stepsToReproduce.trim() ||
      !form.expectedResult.trim() ||
      !form.actualResult.trim()
    ) {
      setFormError('Title, reproduction steps, expected result, and actual result are required.');
      return;
    }
    setSavingBug(true);
    setFormError('');
    try {
      const res = await qaApi.createBug(form);
      setBugs((prev) => [res.bug, ...prev]);
      setCreateOpen(false);
      setNotice(`Logged defect ${res.bug.bugCode}.`);
      setForm({
        title: '',
        description: '',
        module: 'Task Management',
        environment: 'Localhost / Staging',
        browserDevice: 'Chrome · Desktop',
        precondition: '',
        stepsToReproduce: '',
        expectedResult: '',
        actualResult: '',
        severity: 'High',
        priority: 'High',
        assignedDeveloper: 'Unassigned',
        reporter: user.name,
        linkedRequirementId: '',
        linkedTestCaseId: '',
        evidence: '',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log defect.');
    } finally {
      setSavingBug(false);
    }
  };

  const handleStatusChange = async (bug: BugReportRecord, nextStatus: BugStatus) => {
    setUpdatingStatusBugId(bug.id);
    setError('');
    try {
      const res = await qaApi.updateBug(bug.id, { status: nextStatus });
      setBugs((prev) => prev.map((b) => (b.id === bug.id ? res.bug : b)));
      if (selectedBugId === bug.id) {
        await loadHistory(bug.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update defect status.');
    } finally {
      setUpdatingStatusBugId(null);
    }
  };

  const handleAddComment = async (bugId: number) => {
    if (!commentDraft.trim()) return;
    setSubmittingComment(true);
    setError('');
    try {
      const res = await qaApi.addBugComment(bugId, commentDraft.trim());
      setHistoryByBug((prev) => ({
        ...prev,
        [bugId]: [res.entry, ...(prev[bugId] ?? [])],
      }));
      setCommentDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSyncGitLab = async (bug: BugReportRecord) => {
    setSyncingGitlabId(bug.id);
    setError('');
    setNotice('');
    try {
      const res = await qaApi.createGitLabIssue(bug.id);
      setBugs((prev) => prev.map((b) => (b.id === bug.id ? res.bug : b)));
      if (selectedBugId === bug.id) {
        await loadHistory(bug.id);
      }
      setNotice(`Created GitLab issue ${res.gitlabIssue.issueId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create GitLab issue.');
    } finally {
      setSyncingGitlabId(null);
    }
  };

  const handleCopyMarkdown = async (bug: BugReportRecord) => {
    try {
      await navigator.clipboard.writeText(buildGitLabMarkdown(bug));
      setNotice(`Copied GitLab issue Markdown for ${bug.bugCode}.`);
    } catch {
      setNotice(`Prepared GitLab Markdown for ${bug.bugCode}.`);
    }
  };

  const handleDeleteBug = async (bug: BugReportRecord) => {
    setError('');
    try {
      await qaApi.deleteBug(bug.id);
      setBugs((prev) => prev.filter((b) => b.id !== bug.id));
      if (selectedBugId === bug.id) setSelectedBugId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete defect.');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      'taskflow-defects.csv',
      [
        'Defect ID',
        'Title',
        'Module',
        'Severity',
        'Priority',
        'Status',
        'Assigned Developer',
        'Reporter',
        'Linked Requirement',
        'Linked Test Case',
        'Environment',
        'Browser/Device',
        'GitLab Issue',
        'Created At',
      ],
      filteredBugs.map((b) => [
        b.bugCode,
        b.title,
        b.module,
        b.severity,
        b.priority,
        b.status,
        b.assignedDeveloper,
        b.reporter,
        b.linkedRequirementId,
        b.linkedTestCaseId,
        b.environment,
        b.browserDevice,
        b.gitlabIssueId || 'Not Linked',
        b.createdAt,
      ])
    );
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
        Loading Defect Management workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Lifecycle Strip & GitLab Integration Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Defect Lifecycle Workflow
          </p>
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {BUG_STATUSES.map((st) => {
              const count = bugs.filter((b) => b.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === st ? 'all' : st)}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    statusFilter === st
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] text-slate-500 truncate">{st}</p>
                  <p className="mt-0.5 font-display text-lg font-bold text-slate-900 tabular-nums">
                    {count}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <GitBranch className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>GitLab Issue Integration</span>
            </div>
            {gitlabStatus?.configured ? (
              <p className="mt-2 text-xs text-emerald-700 leading-relaxed">
                Connected to <span className="font-mono">{gitlabStatus.baseUrl}</span> ({gitlabStatus.projectId}). Live REST API issue creation is enabled.
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Not configured in this environment. Set <code className="font-mono text-slate-800">GITLAB_TOKEN</code> and{' '}
                <code className="font-mono text-slate-800">GITLAB_PROJECT_ID</code> to create live issues via GitLab REST API. Until configured, use <strong>Copy GitLab Markdown</strong> on any defect.
              </p>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            GitLab issue IDs are never fabricated when credentials are absent.
          </p>
        </div>
      </div>

      {/* Main Defect Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Defect Register ({filteredBugs.length})
            </h2>
            <p className="text-xs text-slate-500">
              Separate Severity (impact) and Priority (fix urgency) with immutable transition audit history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log Defect</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search BUG ID, title, module, TC..."
              aria-label="Search defects"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | QaPriority)}
            aria-label="Filter by severity"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                Severity: {s}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | QaPriority)}
            aria-label="Filter by priority"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Priorities</option>
            {SEVERITIES.map((p) => (
              <option key={p} value={p}>
                Priority: {p}
              </option>
            ))}
          </select>

          <select
            value={devFilter}
            onChange={(e) => setDevFilter(e.target.value)}
            aria-label="Filter by assigned developer"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Developers</option>
            {developersList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={reqFilter}
            onChange={(e) => setReqFilter(e.target.value)}
            aria-label="Filter by linked requirement"
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Requirements</option>
            {requirements.map((r) => (
              <option key={r.id} value={r.reqCode}>
                {r.reqCode}
              </option>
            ))}
          </select>
        </div>

        {/* Defect List */}
        {filteredBugs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bug className="w-7 h-7 text-slate-300 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              {bugs.length === 0
                ? 'No defects logged yet.'
                : 'No defects match the active filters.'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Defects are never pre-populated with fake bugs. Log real issues discovered during manual, API, or browser testing.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredBugs.map((bug) => {
              const isExpanded = selectedBugId === bug.id;
              const history = historyByBug[bug.id] ?? [];
              return (
                <div key={bug.id} className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">
                          {bug.bugCode}
                        </span>
                        <span>·</span>
                        <span>{bug.module}</span>
                        <span>·</span>
                        <span className={SEVERITY_STYLE[bug.severity]}>
                          Severity: {bug.severity}
                        </span>
                        <span>·</span>
                        <span className="text-slate-700 font-medium">Priority: {bug.priority}</span>
                        {bug.linkedRequirementId && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-slate-700">
                              Req: {bug.linkedRequirementId}
                            </span>
                          </>
                        )}
                        {bug.linkedTestCaseId && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-slate-700">
                              TC: {bug.linkedTestCaseId}
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="font-display text-base font-semibold text-slate-900">
                        {bug.title}
                      </h3>

                      <p className="text-xs text-slate-500">
                        Assigned: <strong className="text-slate-700">{bug.assignedDeveloper}</strong> · Reporter:{' '}
                        <strong className="text-slate-700">{bug.reporter || 'QA Engineer'}</strong> ·{' '}
                        {bug.environment} ({bug.browserDevice}) · Logged{' '}
                        {new Date(bug.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={bug.status}
                        disabled={updatingStatusBugId === bug.id}
                        onChange={(e) => handleStatusChange(bug, e.target.value as BugStatus)}
                        aria-label={`Status for ${bug.bugCode}`}
                        className={`px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-60 ${STATUS_STYLE[bug.status]}`}
                      >
                        {BUG_STATUSES.map((st) => (
                          <option key={st} value={st} className="text-slate-900 font-normal">
                            {st}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => toggleExpandBug(bug.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <History className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isExpanded ? 'Hide Details' : 'Details & History'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteBug(bug)}
                        aria-label={`Delete ${bug.bugCode}`}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Details */}
                      <div className="lg:col-span-2 space-y-3 text-xs text-slate-700">
                        {bug.description && (
                          <div>
                            <p className="font-semibold text-slate-900 mb-0.5">Description</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{bug.description}</p>
                          </div>
                        )}
                        {bug.precondition && (
                          <div>
                            <p className="font-semibold text-slate-900 mb-0.5">Preconditions</p>
                            <p className="whitespace-pre-wrap">{bug.precondition}</p>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-slate-900 mb-0.5">Steps to Reproduce</p>
                          <p className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[11px]">
                            {bug.stepsToReproduce}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-emerald-50/40 border border-emerald-200/70 rounded-lg p-3">
                            <p className="font-semibold text-emerald-900 mb-0.5">Expected Behaviour</p>
                            <p className="whitespace-pre-wrap">{bug.expectedResult}</p>
                          </div>
                          <div className="bg-red-50/40 border border-red-200/70 rounded-lg p-3">
                            <p className="font-semibold text-red-900 mb-0.5">Actual Behaviour</p>
                            <p className="whitespace-pre-wrap">{bug.actualResult}</p>
                          </div>
                        </div>
                        {bug.evidence && (
                          <div>
                            <p className="font-semibold text-slate-900 mb-0.5">Evidence / Logs</p>
                            <p className="font-mono text-[11px] text-slate-600">{bug.evidence}</p>
                          </div>
                        )}

                        {/* GitLab Actions */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          {bug.gitlabIssueUrl ? (
                            <a
                              href={bug.gitlabIssueUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>GitLab Issue {bug.gitlabIssueId}</span>
                            </a>
                          ) : gitlabStatus?.configured ? (
                            <button
                              type="button"
                              disabled={syncingGitlabId === bug.id}
                              onClick={() => handleSyncGitLab(bug)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-60"
                            >
                              <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {syncingGitlabId === bug.id
                                  ? 'Creating GitLab Issue...'
                                  : 'Create GitLab Issue'}
                              </span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleCopyMarkdown(bug)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy GitLab Markdown</span>
                          </button>
                        </div>
                      </div>

                      {/* Defect History & Comments */}
                      <div className="border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-5 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                          <span>Defect Audit History</span>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            placeholder="Add retest note or comment..."
                            aria-label="Add defect comment"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                          />
                          <button
                            type="button"
                            disabled={submittingComment || !commentDraft.trim()}
                            onClick={() => handleAddComment(bug.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                          >
                            Post
                          </button>
                        </div>

                        {loadingHistory ? (
                          <p className="text-xs text-slate-500">Loading history...</p>
                        ) : history.length === 0 ? (
                          <p className="text-xs text-slate-500">No audit entries yet.</p>
                        ) : (
                          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                            {history.map((entry) => (
                              <div
                                key={entry.id}
                                className="text-xs border-b border-slate-100 pb-2 last:border-b-0"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                  <span className="font-semibold text-slate-800">
                                    {entry.actor} · {entry.action}
                                  </span>
                                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                                </div>
                                {entry.action === 'Status Change' && (
                                  <p className="text-[11px] font-mono text-blue-700 mt-0.5">
                                    {entry.fromStatus} → {entry.toStatus}
                                  </p>
                                )}
                                <p className="text-slate-700 mt-0.5">{entry.comment}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Defect Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-defect-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="create-defect-title" className="font-display text-base font-bold text-slate-900">
                Log New Defect
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBug} className="p-6 space-y-4">
              {formError && (
                <div role="alert" className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Defect Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Clear, reproducible summary of the defect"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Module *</label>
                  <select
                    value={form.module}
                    onChange={(e) => setForm({ ...form, module: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Severity (Impact)
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value as QaPriority })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Priority (Urgency)
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as QaPriority })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {SEVERITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Linked Requirement ID
                  </label>
                  <select
                    value={form.linkedRequirementId}
                    onChange={(e) => setForm({ ...form, linkedRequirementId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {requirements.map((r) => (
                      <option key={r.id} value={r.reqCode}>
                        {r.reqCode} — {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Linked Test Case ID
                  </label>
                  <select
                    value={form.linkedTestCaseId}
                    onChange={(e) => setForm({ ...form, linkedTestCaseId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {testCases.map((tc) => (
                      <option key={tc.id} value={tc.testId}>
                        {tc.testId} — {tc.scenario.slice(0, 48)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Environment
                  </label>
                  <input
                    type="text"
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Browser / Device
                  </label>
                  <input
                    type="text"
                    value={form.browserDevice}
                    onChange={(e) => setForm({ ...form, browserDevice: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Developer
                  </label>
                  <input
                    type="text"
                    value={form.assignedDeveloper}
                    onChange={(e) => setForm({ ...form, assignedDeveloper: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Context and user impact"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Steps to Reproduce *
                </label>
                <textarea
                  rows={3}
                  value={form.stepsToReproduce}
                  onChange={(e) => setForm({ ...form, stepsToReproduce: e.target.value })}
                  placeholder="1. Open...&#10;2. Submit...&#10;3. Observe..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expected Behaviour *
                  </label>
                  <textarea
                    rows={2}
                    value={form.expectedResult}
                    onChange={(e) => setForm({ ...form, expectedResult: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Actual Behaviour *
                  </label>
                  <textarea
                    rows={2}
                    value={form.actualResult}
                    onChange={(e) => setForm({ ...form, actualResult: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Evidence / Screenshot Reference / Console Log
                </label>
                <input
                  type="text"
                  value={form.evidence}
                  onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                  placeholder="e.g. HTTP 500 trace, screenshot filename, SQL query result"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBug}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  {savingBug ? 'Logging...' : 'Log Defect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
