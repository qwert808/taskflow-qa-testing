import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, getApiAuthToken, qaApi } from '../lib/api';
import { computeQaSummary } from '../lib/analytics';
import { API_ENDPOINT_DOCS, SQL_VALIDATION_QUERIES } from '../lib/qaTemplates';
import type {
  BugReportRecord,
  BugStatus,
  QaPriority,
  TestCaseRecord,
  TestCaseStatus,
} from '../lib/types';

type QaTab = 'test-cases' | 'bugs' | 'api-sql';

const TC_STATUS_COLOR: Record<TestCaseStatus, string> = {
  'Not Executed': 'text-slate-500',
  Pass: 'text-emerald-700 font-medium',
  Fail: 'text-red-700 font-medium',
  Blocked: 'text-amber-700 font-medium',
};

const BUG_STATUS_COLOR: Record<BugStatus, string> = {
  Open: 'text-red-700 font-medium',
  'In Progress': 'text-blue-700 font-medium',
  Retesting: 'text-amber-700 font-medium',
  Closed: 'text-emerald-700 font-medium',
};

export function QaLabView({ onTasksChanged }: { onTasksChanged: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<QaTab>('test-cases');
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [bugs, setBugs] = useState<BugReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Test case filters & row expansion
  const [moduleFilter, setModuleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | TestCaseStatus>('All');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draftActual, setDraftActual] = useState('');
  const [draftDefect, setDraftDefect] = useState('');
  const [savingCaseId, setSavingCaseId] = useState<number | null>(null);

  // Bug modal state
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugModule, setBugModule] = useState('Dashboard');
  const [bugEnv, setBugEnv] = useState('Chrome, Desktop');
  const [bugPrecondition, setBugPrecondition] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugExpected, setBugExpected] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugSeverity, setBugSeverity] = useState<QaPriority>('High');
  const [bugPriority, setBugPriority] = useState<QaPriority>('High');
  const [bugEvidence, setBugEvidence] = useState('');
  const [bugErrors, setBugErrors] = useState<Record<string, string>>({});
  const [savingBug, setSavingBug] = useState(false);

  // Live API Tester state
  const [selectedEndpointId, setSelectedEndpointId] = useState(API_ENDPOINT_DOCS[2].id);
  const [apiMethod, setApiMethod] = useState<string>(API_ENDPOINT_DOCS[2].method);
  const [apiPath, setApiPath] = useState<string>(API_ENDPOINT_DOCS[2].path);
  const [apiBody, setApiBody] = useState<string>('');
  const [sendAuthHeader, setSendAuthHeader] = useState(true);
  const [apiRunning, setApiRunning] = useState(false);
  const [apiResponse, setApiResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    body: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const [tcRes, bugRes] = await Promise.all([
          qaApi.listTestCases(),
          qaApi.listBugs(),
        ]);
        if (!active) return;
        setTestCases(tcRes.testCases);
        setBugs(bugRes.bugs);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load QA workbench data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => computeQaSummary(testCases, bugs), [testCases, bugs]);

  const modules = useMemo(() => {
    const unique = Array.from(new Set(testCases.map((tc) => tc.module)));
    return ['All', ...unique];
  }, [testCases]);

  const filteredCases = useMemo(
    () =>
      testCases.filter((tc) => {
        if (moduleFilter !== 'All' && tc.module !== moduleFilter) return false;
        if (statusFilter !== 'All' && tc.status !== statusFilter) return false;
        return true;
      }),
    [testCases, moduleFilter, statusFilter]
  );

  const toggleExpandCase = (tc: TestCaseRecord) => {
    if (expandedId === tc.id) {
      setExpandedId(null);
    } else {
      setExpandedId(tc.id);
      setDraftActual(tc.actualResult);
      setDraftDefect(tc.defectId);
    }
  };

  const handleQuickStatusChange = async (tc: TestCaseRecord, nextStatus: TestCaseStatus) => {
    setSavingCaseId(tc.id);
    try {
      const res = await qaApi.updateTestCase(tc.id, { status: nextStatus });
      setTestCases((prev) => prev.map((item) => (item.id === tc.id ? res.testCase : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update test case status.');
    } finally {
      setSavingCaseId(null);
    }
  };

  const handleSaveCaseDetails = async (tc: TestCaseRecord) => {
    setSavingCaseId(tc.id);
    try {
      const res = await qaApi.updateTestCase(tc.id, {
        actualResult: draftActual,
        defectId: draftDefect,
      });
      setTestCases((prev) => prev.map((item) => (item.id === tc.id ? res.testCase : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save execution notes.');
    } finally {
      setSavingCaseId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Test ID',
      'Requirement ID',
      'Module',
      'Type',
      'Priority',
      'Scenario',
      'Preconditions',
      'Test Data',
      'Execution Steps',
      'Expected Result',
      'Actual Result',
      'Status',
      'Defect ID',
      'Execution Date',
    ];
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = testCases.map((tc) =>
      [
        tc.testId,
        tc.requirementId,
        tc.module,
        tc.testType,
        tc.priority,
        tc.scenario,
        tc.preconditions,
        tc.testData,
        tc.executionSteps,
        tc.expectedResult,
        tc.actualResult,
        tc.status,
        tc.defectId,
        tc.executedAt ? tc.executedAt.slice(0, 10) : '',
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taskflow-qa-test-cases.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!bugTitle.trim()) errs.title = 'Bug title is required.';
    if (!bugSteps.trim()) errs.stepsToReproduce = 'Steps to reproduce are required.';
    if (!bugExpected.trim()) errs.expectedResult = 'Expected result is required.';
    if (!bugActual.trim()) errs.actualResult = 'Actual result is required.';
    if (Object.keys(errs).length > 0) {
      setBugErrors(errs);
      return;
    }

    setSavingBug(true);
    setBugErrors({});
    try {
      const res = await qaApi.createBug({
        title: bugTitle.trim(),
        module: bugModule,
        environment: bugEnv.trim() || 'Chrome, Desktop',
        precondition: bugPrecondition.trim(),
        stepsToReproduce: bugSteps.trim(),
        expectedResult: bugExpected.trim(),
        actualResult: bugActual.trim(),
        severity: bugSeverity,
        priority: bugPriority,
        evidence: bugEvidence.trim(),
      });
      setBugs((prev) => [res.bug, ...prev]);
      setBugModalOpen(false);
      setBugTitle('');
      setBugPrecondition('');
      setBugSteps('');
      setBugExpected('');
      setBugActual('');
      setBugEvidence('');
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setBugErrors(err.details);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to log bug report.');
      }
    } finally {
      setSavingBug(false);
    }
  };

  const handleBugStatusChange = async (bug: BugReportRecord, nextStatus: BugStatus) => {
    try {
      const res = await qaApi.updateBugStatus(bug.id, nextStatus);
      setBugs((prev) => prev.map((b) => (b.id === bug.id ? res.bug : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update defect status.');
    }
  };

  const handleDeleteBug = async (bug: BugReportRecord) => {
    try {
      await qaApi.deleteBug(bug.id);
      setBugs((prev) => prev.filter((b) => b.id !== bug.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete defect.');
    }
  };

  const selectEndpointPreset = (id: string, useInvalid = false) => {
    const doc = API_ENDPOINT_DOCS.find((e) => e.id === id);
    if (!doc) return;
    setSelectedEndpointId(doc.id);
    setApiMethod(doc.method);
    setApiPath(doc.path);
    setApiBody(useInvalid ? (doc.invalidBody ?? '') : (doc.sampleBody ?? ''));
    setSendAuthHeader(doc.requiresAuth);
    setApiResponse(null);
  };

  const runApiRequest = async () => {
    setApiRunning(true);
    setApiResponse(null);
    const start = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (apiMethod !== 'GET' && apiMethod !== 'DELETE' && apiBody.trim()) {
        headers['Content-Type'] = 'application/json';
      }
      if (sendAuthHeader) {
        const token = getApiAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(apiPath, {
        method: apiMethod,
        headers,
        credentials: sendAuthHeader ? 'include' : 'omit',
        body:
          apiMethod !== 'GET' && apiMethod !== 'DELETE' && apiBody.trim()
            ? apiBody
            : undefined,
      });
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Keep raw text
      }
      setApiResponse({
        status: res.status,
        statusText: res.statusText,
        durationMs: Math.round(performance.now() - start),
        body: formatted,
      });
      if (apiPath.startsWith('/api/tasks') && apiMethod !== 'GET' && res.ok) {
        await onTasksChanged();
      }
    } catch (err) {
      setApiResponse({
        status: 0,
        statusText: 'Network Error',
        durationMs: Math.round(performance.now() - start),
        body: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setApiRunning(false);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1500);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl"
        >
          {error}
        </div>
      )}

      {/* QA Execution KPI Strip */}
      <section aria-label="QA progress metrics" className="bg-white border border-slate-200 rounded-xl">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <p className="text-xs text-slate-500">Test Cases</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {loading ? '—' : summary.totalCases}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Passed</p>
            <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
              {loading ? '—' : summary.passedCases}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Failed</p>
            <p className="mt-1 font-mono text-xl font-semibold text-red-700 tabular-nums">
              {loading ? '—' : summary.failedCases}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-slate-500">Pass Rate</p>
            <p className="mt-1 font-mono text-xl font-semibold text-blue-700 tabular-nums">
              {loading ? '—' : `${summary.passRate}%`}
            </p>
          </div>
          <div className="p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-slate-500">Open Defects</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {loading ? '—' : summary.openBugs}
            </p>
          </div>
        </div>
      </section>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          role="tablist"
          aria-label="QA Lab sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'test-cases'}
            onClick={() => setActiveTab('test-cases')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'test-cases'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Test Case Matrix
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bugs'}
            onClick={() => setActiveTab('bugs')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'bugs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bug Reports ({bugs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'api-sql'}
            onClick={() => setActiveTab('api-sql')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'api-sql'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            API & SQL Workbench
          </button>
        </div>

        {activeTab === 'test-cases' && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        )}

        {activeTab === 'bugs' && (
          <button
            type="button"
            onClick={() => setBugModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Report Bug</span>
          </button>
        )}
      </div>

      {/* TAB 1: Test Case Matrix (30 Structured Cases) */}
      {activeTab === 'test-cases' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="qa-module-filter" className="sr-only">
                Filter test cases by module
              </label>
              <select
                id="qa-module-filter"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700"
              >
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m === 'All' ? 'All Modules' : m}
                  </option>
                ))}
              </select>

              <label htmlFor="qa-status-filter" className="sr-only">
                Filter test cases by execution status
              </label>
              <select
                id="qa-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'All' | TestCaseStatus)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Not Executed">Not Executed</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Blocked">Blocked</option>
              </select>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {filteredCases.length} of {testCases.length} cases
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pl-5 pr-3 whitespace-nowrap">Test ID</th>
                  <th className="py-3 px-3">Scenario & Requirement</th>
                  <th className="py-3 px-3 whitespace-nowrap">Module / Type</th>
                  <th className="py-3 px-3 whitespace-nowrap">Priority</th>
                  <th className="py-3 px-3 whitespace-nowrap">Execution Status</th>
                  <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredCases.map((tc) => {
                  const isExpanded = expandedId === tc.id;
                  return (
                    <React.Fragment key={tc.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 pl-5 pr-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {tc.testId}
                        </td>
                        <td className="py-3 px-3 max-w-md">
                          <p className="text-sm font-medium text-slate-900">{tc.scenario}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            <span className="font-mono">{tc.requirementId}</span>
                            {tc.defectId && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono text-red-700">{tc.defectId}</span>
                              </>
                            )}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {tc.module} <span aria-hidden="true">·</span> {tc.testType}
                        </td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">
                          <span
                            className={
                              tc.priority === 'Critical' || tc.priority === 'High'
                                ? 'text-red-700 font-medium'
                                : tc.priority === 'Medium'
                                  ? 'text-amber-700 font-medium'
                                  : 'text-slate-600'
                            }
                          >
                            {tc.priority}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <label htmlFor={`tc-status-${tc.id}`} className="sr-only">
                            Status for {tc.testId}
                          </label>
                          <select
                            id={`tc-status-${tc.id}`}
                            disabled={savingCaseId === tc.id}
                            value={tc.status}
                            onChange={(e) =>
                              handleQuickStatusChange(tc, e.target.value as TestCaseStatus)
                            }
                            className={`px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 ${TC_STATUS_COLOR[tc.status]}`}
                          >
                            <option value="Not Executed">Not Executed</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                            <option value="Blocked">Blocked</option>
                          </select>
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpandCase(tc)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${tc.testId} details`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 px-2 py-1 rounded-md hover:bg-blue-50"
                          >
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                              <div className="space-y-3">
                                <div>
                                  <p className="font-semibold text-slate-700">Preconditions</p>
                                  <p className="mt-0.5 text-slate-600">{tc.preconditions || 'None'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700">Test Data</p>
                                  <p className="mt-0.5 font-mono text-slate-700">{tc.testData || '—'}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700">Execution Steps</p>
                                  <p className="mt-0.5 whitespace-pre-line text-slate-600">
                                    {tc.executionSteps}
                                  </p>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700">Expected Result</p>
                                  <p className="mt-0.5 text-slate-700">{tc.expectedResult}</p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div>
                                  <label
                                    htmlFor={`actual-result-${tc.id}`}
                                    className="block font-semibold text-slate-700 mb-1"
                                  >
                                    Actual Result
                                  </label>
                                  <textarea
                                    id={`actual-result-${tc.id}`}
                                    rows={3}
                                    value={draftActual}
                                    onChange={(e) => setDraftActual(e.target.value)}
                                    placeholder="Record observed UI, HTTP status code, or PostgreSQL verification outcome..."
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label
                                      htmlFor={`defect-id-${tc.id}`}
                                      className="block font-semibold text-slate-700 mb-1"
                                    >
                                      Linked Defect ID
                                    </label>
                                    <input
                                      id={`defect-id-${tc.id}`}
                                      type="text"
                                      value={draftDefect}
                                      onChange={(e) => setDraftDefect(e.target.value)}
                                      placeholder="BUG-001"
                                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white text-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-700 mb-1">Execution Date</p>
                                    <p className="py-1.5 font-mono text-slate-600 tabular-nums">
                                      {tc.executedAt ? tc.executedAt.slice(0, 10) : 'Not recorded'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    disabled={savingCaseId === tc.id}
                                    onClick={() => handleSaveCaseDetails(tc)}
                                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                                  >
                                    {savingCaseId === tc.id ? 'Saving...' : 'Save Execution Notes'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: GitLab-style Bug Reports */}
      {activeTab === 'bugs' && (
        <section className="space-y-4">
          {bugs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h3 className="font-display text-base font-semibold text-slate-900">
                No defects logged
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
                Log only reproducible issues discovered during manual, API, regression, or SQL
                verification. Track Severity separately from Priority across the lifecycle.
              </p>
              <button
                type="button"
                onClick={() => setBugModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Report Defect</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {bugs.map((bug) => (
                <article
                  key={bug.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">{bug.bugCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{bug.module}</span>
                        <span aria-hidden="true">·</span>
                        <span>{bug.environment}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Severity:{' '}
                          <strong className="text-red-700">{bug.severity}</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Priority:{' '}
                          <strong className="text-amber-700">{bug.priority}</strong>
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900">
                        {bug.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <label htmlFor={`bug-status-${bug.id}`} className="sr-only">
                        Workflow status for {bug.bugCode}
                      </label>
                      <select
                        id={`bug-status-${bug.id}`}
                        value={bug.status}
                        onChange={(e) =>
                          handleBugStatusChange(bug, e.target.value as BugStatus)
                        }
                        className={`px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white ${BUG_STATUS_COLOR[bug.status]}`}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Retesting">Retesting</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteBug(bug)}
                        aria-label={`Delete bug ${bug.bugCode}`}
                        className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200 text-xs">
                    <div>
                      <p className="font-semibold text-slate-700">Steps to Reproduce</p>
                      <p className="mt-1 whitespace-pre-line text-slate-600">
                        {bug.stepsToReproduce}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">Expected Result</p>
                      <p className="mt-1 text-slate-600">{bug.expectedResult}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">Actual Result</p>
                      <p className="mt-1 text-red-700">{bug.actualResult}</p>
                      {bug.evidence && (
                        <p className="mt-2 text-slate-500">
                          <strong>Evidence:</strong> {bug.evidence}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Live REST API Tester & PostgreSQL Validation Queries */}
      {activeTab === 'api-sql' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Interactive API Request Runner */}
          <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                REST API Endpoint Runner
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Send real HTTP requests to TaskFlow Express routes and inspect status codes and JSON
                payloads.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Endpoint Presets */}
              <div className="flex flex-wrap gap-1.5">
                {API_ENDPOINT_DOCS.map((doc) => {
                  const active = selectedEndpointId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => selectEndpointPreset(doc.id, false)}
                      className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {doc.method} {doc.path}
                    </button>
                  );
                })}
              </div>

              {/* Request Bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="api-method" className="sr-only">
                  HTTP Method
                </label>
                <select
                  id="api-method"
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value)}
                  className="px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white text-slate-900"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <label htmlFor="api-path" className="sr-only">
                  Endpoint URL Path
                </label>
                <input
                  id="api-path"
                  type="text"
                  value={apiPath}
                  onChange={(e) => setApiPath(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                <button
                  type="button"
                  disabled={apiRunning}
                  onClick={runApiRequest}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{apiRunning ? 'Sending...' : 'Send Request'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendAuthHeader}
                    onChange={(e) => setSendAuthHeader(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>Include active session credentials (uncheck to test HTTP 401)</span>
                </label>
                {API_ENDPOINT_DOCS.find((e) => e.id === selectedEndpointId)?.invalidBody && (
                  <button
                    type="button"
                    onClick={() => selectEndpointPreset(selectedEndpointId, true)}
                    className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
                  >
                    Load invalid payload (4xx test)
                  </button>
                )}
              </div>

              {apiMethod !== 'GET' && apiMethod !== 'DELETE' && (
                <div>
                  <label htmlFor="api-json-body" className="block text-xs font-medium text-slate-700 mb-1">
                    JSON Request Body
                  </label>
                  <textarea
                    id="api-json-body"
                    rows={6}
                    value={apiBody}
                    onChange={(e) => setApiBody(e.target.value)}
                    className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              )}

              {apiResponse && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
                    <span
                      className={
                        apiResponse.status >= 200 && apiResponse.status < 300
                          ? 'text-emerald-700 font-semibold'
                          : 'text-red-700 font-semibold'
                      }
                    >
                      HTTP {apiResponse.status} {apiResponse.statusText}
                    </span>
                    <span className="text-slate-500 tabular-nums">{apiResponse.durationMs} ms</span>
                  </div>
                  <pre className="p-3.5 text-xs font-mono text-slate-800 overflow-x-auto max-h-72 bg-white">
                    {apiResponse.body || '(empty response)'}
                  </pre>
                </div>
              )}
            </div>
          </section>

          {/* PostgreSQL Validation Query Library */}
          <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                PostgreSQL Validation Reference
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Standard SQL audit queries for verifying schema integrity, counts, and isolation.
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {SQL_VALIDATION_QUERIES.map((q) => (
                <div key={q.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{q.title}</p>
                      <p className="text-xs text-slate-500">{q.purpose}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(q.id, q.sql)}
                      aria-label={`Copy SQL query: ${q.title}`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 shrink-0"
                    >
                      {copiedId === q.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <pre className="p-3 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto">
                    {q.sql}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Report Bug Modal */}
      {bugModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-modal-title"
        >
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 id="bug-modal-title" className="font-display text-lg font-semibold text-slate-900">
                Log Defect Report
              </h2>
              <button
                type="button"
                onClick={() => setBugModalOpen(false)}
                aria-label="Close defect dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBug} noValidate className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label htmlFor="bug-title" className="block text-sm font-medium text-slate-700 mb-1">
                  Defect Summary
                </label>
                <input
                  id="bug-title"
                  type="text"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="Dashboard displays incorrect overdue task count"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                {bugErrors.title && <p className="mt-1 text-xs text-red-700">{bugErrors.title}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bug-module" className="block text-sm font-medium text-slate-700 mb-1">
                    Module
                  </label>
                  <select
                    id="bug-module"
                    value={bugModule}
                    onChange={(e) => setBugModule(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="Authentication">Authentication</option>
                    <option value="Task Management">Task Management</option>
                    <option value="Search & Filter">Search & Filter</option>
                    <option value="Dashboard">Dashboard</option>
                    <option value="User Profile">User Profile</option>
                    <option value="API & Security">API & Security</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bug-env" className="block text-sm font-medium text-slate-700 mb-1">
                    Environment
                  </label>
                  <input
                    id="bug-env"
                    type="text"
                    value={bugEnv}
                    onChange={(e) => setBugEnv(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bug-severity" className="block text-sm font-medium text-slate-700 mb-1">
                    Severity (System Impact)
                  </label>
                  <select
                    id="bug-severity"
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value as QaPriority)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bug-priority" className="block text-sm font-medium text-slate-700 mb-1">
                    Priority (Fix Urgency)
                  </label>
                  <select
                    id="bug-priority"
                    value={bugPriority}
                    onChange={(e) => setBugPriority(e.target.value as QaPriority)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="bug-steps" className="block text-sm font-medium text-slate-700 mb-1">
                  Steps to Reproduce
                </label>
                <textarea
                  id="bug-steps"
                  rows={3}
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  placeholder={'1. Sign in to TaskFlow.\n2. Open Dashboard.\n3. Compare task count.'}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                />
                {bugErrors.stepsToReproduce && (
                  <p className="mt-1 text-xs text-red-700">{bugErrors.stepsToReproduce}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bug-expected" className="block text-sm font-medium text-slate-700 mb-1">
                    Expected Result
                  </label>
                  <textarea
                    id="bug-expected"
                    rows={2}
                    value={bugExpected}
                    onChange={(e) => setBugExpected(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                  {bugErrors.expectedResult && (
                    <p className="mt-1 text-xs text-red-700">{bugErrors.expectedResult}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="bug-actual" className="block text-sm font-medium text-slate-700 mb-1">
                    Actual Result
                  </label>
                  <textarea
                    id="bug-actual"
                    rows={2}
                    value={bugActual}
                    onChange={(e) => setBugActual(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                  {bugErrors.actualResult && (
                    <p className="mt-1 text-xs text-red-700">{bugErrors.actualResult}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="bug-evidence" className="block text-sm font-medium text-slate-700 mb-1">
                  Evidence / API Response Notes (optional)
                </label>
                <input
                  id="bug-evidence"
                  type="text"
                  value={bugEvidence}
                  onChange={(e) => setBugEvidence(e.target.value)}
                  placeholder="GET /api/dashboard/stats returned 4 instead of 3"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBugModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBug}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  {savingBug ? 'Logging...' : 'Create Bug Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
