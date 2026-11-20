import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, qaApi } from '../lib/api';
import { buildTraceabilityMatrix } from '../lib/analytics';
import type {
  QaPriority,
  RequirementCategory,
  RequirementDependencies,
  RequirementRecord,
  TestCaseRecord,
} from '../lib/types';

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

const MODULES = [
  'Authentication',
  'Task Management',
  'Search & Filtering',
  'User Profile',
  'Dashboard Analytics',
  'Non-Functional',
];

const PRIORITIES: QaPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const STATUS_TEXT_CLASS: Record<string, string> = {
  Passed: 'text-emerald-700 font-semibold',
  Failed: 'text-red-700 font-semibold',
  Blocked: 'text-amber-700 font-semibold',
  'In Progress': 'text-blue-700 font-semibold',
  'Not Run': 'text-slate-600 font-medium',
  Uncovered: 'text-red-700 font-semibold',
};

interface ReqFormState {
  reqCode: string;
  title: string;
  category: RequirementCategory;
  module: string;
  userStory: string;
  acceptanceCriteria: string;
  priority: QaPriority;
}

const EMPTY_FORM: ReqFormState = {
  reqCode: '',
  title: '',
  category: 'Functional',
  module: 'Task Management',
  userStory: '',
  acceptanceCriteria: '',
  priority: 'High',
};

export function RequirementsView() {
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeView, setActiveView] = useState<'rtm' | 'srs'>('rtm');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | RequirementCategory>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<RequirementRecord | null>(null);
  const [form, setForm] = useState<ReqFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<RequirementRecord | null>(null);
  const [deleteDeps, setDeleteDeps] = useState<RequirementDependencies | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, tcRes] = await Promise.all([
        qaApi.listRequirements(),
        qaApi.listTestCases(),
      ]);
      setRequirements(reqRes.requirements);
      setTestCases(tcRes.testCases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requirements and test cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rtm = useMemo(
    () => buildTraceabilityMatrix(requirements, testCases),
    [requirements, testCases]
  );

  const modulesList = useMemo(() => {
    const set = new Set<string>(MODULES);
    requirements.forEach((r) => set.add(r.module));
    return Array.from(set);
  }, [requirements]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rtm.rows.filter((row) => {
      const req = row.requirement;
      if (categoryFilter !== 'all' && req.category !== categoryFilter) return false;
      if (moduleFilter !== 'all' && req.module !== moduleFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          req.reqCode,
          req.title,
          req.module,
          req.userStory,
          req.acceptanceCriteria,
          ...row.linkedTestCases.map((tc) => tc.testId),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rtm.rows, search, categoryFilter, moduleFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingReq(null);
    setForm({
      ...EMPTY_FORM,
      reqCode: `REQ-${String(requirements.length + 1).padStart(2, '0')}`,
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (req: RequirementRecord) => {
    setEditingReq(req);
    setForm({
      reqCode: req.reqCode,
      title: req.title,
      category: req.category,
      module: req.module,
      userStory: req.userStory,
      acceptanceCriteria: req.acceptanceCriteria,
      priority: req.priority,
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reqCode.trim() || !form.title.trim() || !form.acceptanceCriteria.trim()) {
      setFormError('Requirement ID, title, and acceptance criteria are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingReq) {
        const res = await qaApi.updateRequirement(editingReq.id, form);
        setRequirements((prev) => prev.map((r) => (r.id === editingReq.id ? res.requirement : r)));
        if (editingReq.reqCode !== res.requirement.reqCode) {
          const tcRes = await qaApi.listTestCases();
          setTestCases(tcRes.testCases);
        }
      } else {
        const res = await qaApi.createRequirement(form);
        setRequirements((prev) => [...prev, res.requirement]);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save requirement.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDeleteRequirement = async (req: RequirementRecord) => {
    setError('');
    try {
      const { dependencies } = await qaApi.getRequirementDependencies(req.id);
      if (dependencies.totalLinked > 0) {
        setDeleteTarget(req);
        setDeleteDeps(dependencies);
        return;
      }
      await qaApi.deleteRequirement(req.id, false);
      setRequirements((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'LINKED_DEPENDENCIES_EXIST' &&
        err.payload &&
        typeof err.payload.dependencies === 'object'
      ) {
        setDeleteTarget(req);
        setDeleteDeps(err.payload.dependencies as RequirementDependencies);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to delete requirement.');
    }
  };

  const handleConfirmUnlinkDeleteRequirement = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await qaApi.deleteRequirement(deleteTarget.id, true);
      setRequirements((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      const tcRes = await qaApi.listTestCases();
      setTestCases(tcRes.testCases);
      setDeleteTarget(null);
      setDeleteDeps(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink and delete requirement.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportRtmCsv = () => {
    downloadCsv(
      'taskflow-rtm.csv',
      [
        'Requirement ID',
        'Category',
        'Module',
        'Priority',
        'Requirement',
        'User Story',
        'Acceptance Criteria',
        'Linked Test Case IDs',
        'Coverage',
        'Verification Status',
      ],
      filteredRows.map((row) => [
        row.requirement.reqCode,
        row.requirement.category,
        row.requirement.module,
        row.requirement.priority,
        row.requirement.title,
        row.requirement.userStory,
        row.requirement.acceptanceCriteria,
        row.linkedTestCases.map((tc) => tc.testId).join(' | ') || 'None',
        row.covered ? 'Covered' : 'Uncovered',
        row.status,
      ])
    );
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
        Loading Software Requirements Specification and Traceability Matrix...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {error}
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Total Requirements</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {rtm.totalRequirements}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {requirements.filter((r) => r.category === 'Functional').length} Functional ·{' '}
            {requirements.filter((r) => r.category === 'Non-Functional').length} Non-Functional
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Requirement Coverage</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {rtm.coveragePercentage}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {rtm.coveredRequirements} of {rtm.totalRequirements} linked to tests
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Uncovered Requirements</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              rtm.uncoveredRequirements.length > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {rtm.uncoveredRequirements.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Zero linked test cases</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Failed Requirements</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              rtm.failedRequirements.length > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {rtm.failedRequirements.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">With failing linked tests</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Unlinked Test Cases</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              rtm.unlinkedTestCases.length > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {rtm.unlinkedTestCases.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Orphaned from SRS IDs</p>
        </div>
      </div>

      {/* Automatic Gap Alerts */}
      {(rtm.uncoveredRequirements.length > 0 ||
        rtm.failedRequirements.length > 0 ||
        rtm.unlinkedTestCases.length > 0) && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>Automated Traceability Audit Findings</span>
          </div>
          <div className="text-xs text-amber-900/90 space-y-1">
            {rtm.uncoveredRequirements.length > 0 && (
              <p>
                <strong>Uncovered requirements ({rtm.uncoveredRequirements.length}):</strong>{' '}
                <span className="font-mono">
                  {rtm.uncoveredRequirements.map((r) => r.reqCode).join(', ')}
                </span>{' '}
                — Add or link test cases in QA Lab to close coverage gaps.
              </p>
            )}
            {rtm.failedRequirements.length > 0 && (
              <p>
                <strong>Requirements with failing tests ({rtm.failedRequirements.length}):</strong>{' '}
                <span className="font-mono">
                  {rtm.failedRequirements.map((r) => r.reqCode).join(', ')}
                </span>
              </p>
            )}
            {rtm.unlinkedTestCases.length > 0 && (
              <p>
                <strong>Test cases not linked to an SRS requirement ({rtm.unlinkedTestCases.length}):</strong>{' '}
                <span className="font-mono">
                  {rtm.unlinkedTestCases
                    .map((tc) =>
                      tc.requirementId ? `${tc.testId} (${tc.requirementId})` : `${tc.testId} (Unlinked)`
                    )
                    .join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Mode Switch + Actions */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveView('rtm')}
              className={`pb-1 text-sm font-semibold border-b-2 transition-colors ${
                activeView === 'rtm'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Traceability Matrix (RTM)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('srs')}
              className={`pb-1 text-sm font-semibold border-b-2 transition-colors ${
                activeView === 'srs'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              SRS &amp; User Stories
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportRtmCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export RTM CSV</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Requirement</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requirement ID, title, TC..."
              aria-label="Search requirements"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | RequirementCategory)}
            aria-label="Filter by category"
            className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Categories</option>
            <option value="Functional">Functional</option>
            <option value="Non-Functional">Non-Functional</option>
          </select>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Filter by module"
            className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Modules</option>
            {modulesList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by verification status"
            className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">All Coverage Statuses</option>
            <option value="Passed">Passed</option>
            <option value="Failed">Failed</option>
            <option value="Blocked">Blocked</option>
            <option value="In Progress">In Progress</option>
            <option value="Not Run">Not Run</option>
            <option value="Uncovered">Uncovered</option>
          </select>
        </div>

        {/* Table / SRS View */}
        {activeView === 'rtm' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Requirement ID</th>
                  <th className="py-3 px-4">Requirement</th>
                  <th className="py-3 px-4">Acceptance Criteria</th>
                  <th className="py-3 px-4">Test Case IDs</th>
                  <th className="py-3 px-4">Coverage</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No requirements match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const req = row.requirement;
                    return (
                      <tr key={req.id} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            {req.reqCode}
                          </span>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {req.priority} · {req.category === 'Non-Functional' ? 'NFR' : 'FR'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 min-w-[200px]">
                          <p className="font-medium text-slate-900">{req.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{req.module}</p>
                        </td>
                        <td className="py-3.5 px-4 max-w-sm text-xs text-slate-600 leading-relaxed">
                          {req.acceptanceCriteria}
                        </td>
                        <td className="py-3.5 px-4 min-w-[140px]">
                          {row.linkedTestCases.length === 0 ? (
                            <span className="text-xs text-red-700 font-medium">None linked</span>
                          ) : (
                            <div className="space-y-0.5 font-mono text-xs text-slate-700">
                              {row.linkedTestCases.map((tc) => (
                                <div key={tc.id}>
                                  {tc.testId}{' '}
                                  <span className="font-sans text-slate-500">({tc.status})</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                          <span
                            className={
                              row.covered
                                ? 'text-emerald-700 font-semibold'
                                : 'text-red-700 font-semibold'
                            }
                          >
                            {row.covered ? `${row.linkedTestCases.length} linked` : 'Uncovered'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                          <span className={STATUS_TEXT_CLASS[row.status] ?? 'text-slate-700'}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(req)}
                              aria-label={`Edit ${req.reqCode}`}
                              className="p-1.5 text-slate-500 hover:text-blue-700 rounded-md"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRequestDeleteRequirement(req)}
                              aria-label={`Delete ${req.reqCode}`}
                              className="p-1.5 text-slate-500 hover:text-red-700 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRows.map((row) => {
              const req = row.requirement;
              return (
                <div key={req.id} className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">{req.reqCode}</span>
                      <span>·</span>
                      <span>{req.category}</span>
                      <span>·</span>
                      <span>{req.module}</span>
                      <span>·</span>
                      <span>Priority: {req.priority}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {req.title}
                    </h3>
                    {req.userStory && (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-slate-900">User Story: </span>
                        {req.userStory}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Acceptance Criteria: </span>
                      {req.acceptanceCriteria}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs ${STATUS_TEXT_CLASS[row.status] ?? 'text-slate-600'}`}>
                      {row.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(req)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirement Create/Edit Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="req-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="req-modal-title" className="font-display text-base font-bold text-slate-900">
                {editingReq ? `Edit Requirement ${editingReq.reqCode}` : 'New SRS Requirement'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRequirement} className="p-6 space-y-4">
              {formError && (
                <div role="alert" className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Requirement ID *
                  </label>
                  <input
                    type="text"
                    value={form.reqCode}
                    onChange={(e) => setForm({ ...form, reqCode: e.target.value })}
                    placeholder="e.g. AUTH-08"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as RequirementCategory })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Functional">Functional</option>
                    <option value="Non-Functional">Non-Functional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as QaPriority })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Concise requirement title"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Module *</label>
                  <select
                    value={form.module}
                    onChange={(e) => setForm({ ...form, module: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {modulesList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">User Story</label>
                <textarea
                  rows={2}
                  value={form.userStory}
                  onChange={(e) => setForm({ ...form, userStory: e.target.value })}
                  placeholder="As a [role], I want [capability] so that [benefit]."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Acceptance Criteria *
                </label>
                <textarea
                  rows={3}
                  value={form.acceptanceCriteria}
                  onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
                  placeholder="Observable, testable conditions required to accept this requirement."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingReq ? 'Save Requirement' : 'Create Requirement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Requirement Unlink & Delete Confirmation Modal */}
      {deleteTarget && deleteDeps && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="req-delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <h2
                  id="req-delete-modal-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Unlink &amp; Delete {deleteTarget.reqCode}?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteDeps(null);
                }}
                aria-label="Close confirmation modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <p>
                Requirement <span className="font-mono font-semibold text-slate-900">{deleteTarget.reqCode}</span>{' '}
                is currently linked to{' '}
                <strong>{deleteDeps.linkedTestCases.length} test case(s)</strong> and{' '}
                <strong>{deleteDeps.linkedBugReports.length} defect(s)</strong>.
              </p>

              {deleteDeps.linkedTestCases.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    Test cases to be unlinked (records preserved):
                  </p>
                  <ul className="text-xs text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                    {deleteDeps.linkedTestCases.map((tc) => (
                      <li key={tc.id}>
                        <span className="font-mono font-semibold text-slate-800">{tc.testId}</span> — {tc.scenario}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {deleteDeps.linkedBugReports.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    Defects to be unlinked (defect &amp; history preserved):
                  </p>
                  <ul className="text-xs text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                    {deleteDeps.linkedBugReports.map((bug) => (
                      <li key={bug.id}>
                        <span className="font-mono font-semibold text-slate-800">{bug.bugCode}</span> ({bug.status}) — {bug.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Confirming will unlink these references cleanly, preserve all test cases, execution runs, and defect history, and record an audit log entry before deleting{' '}
                <span className="font-mono font-semibold">{deleteTarget.reqCode}</span>.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteDeps(null);
                  }}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnlinkDeleteRequirement}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-60"
                >
                  {deleting ? 'Unlinking & Deleting...' : 'Confirm Unlink & Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
