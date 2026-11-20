import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Edit2,
  ExternalLink,
  Layers,
  Play,
  Plus,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, apiRequest, qaApi, type PostgresCheckItem } from '../lib/api';
import { API_ENDPOINT_DOCS, SQL_VALIDATION_QUERIES } from '../lib/qaTemplates';
import type {
  AutomationRunRecord,
  CycleStatus,
  ExecutionOrigin,
  QaPriority,
  RequirementRecord,
  TestCaseDependencies,
  TestCaseRecord,
  TestCycleRecord,
  TestExecutionRecord,
  TestTechnique,
  TestType,
  UserProfile,
} from '../lib/types';

type QaTab = 'design' | 'cycles' | 'automation' | 'sql';

const TEST_TYPES: TestType[] = [
  'Functional',
  'Integration',
  'Regression',
  'Exploratory',
  'UAT',
  'API',
  'SQL',
  'Manual',
];

const TEST_TECHNIQUES: TestTechnique[] = [
  'Positive Testing',
  'Negative Testing',
  'Boundary Value Analysis',
  'Equivalence Partitioning',
  'Decision Table Testing',
  'State Transition Testing',
  'Error Guessing',
];

const PRIORITIES: QaPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const MODULES = [
  'Authentication',
  'Task Management',
  'Search & Filtering',
  'User Profile',
  'Dashboard Analytics',
  'API & Database',
  'Non-Functional',
];

const TC_STATUS_CLASS: Record<string, string> = {
  Pass: 'text-emerald-700 font-semibold',
  Fail: 'text-red-700 font-semibold',
  Blocked: 'text-amber-700 font-semibold',
  'Not Run': 'text-slate-500 font-medium',
};

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

interface QaLabViewProps {
  user: UserProfile;
  onTasksChanged: () => void;
}

export function QaLabView({ user, onTasksChanged }: QaLabViewProps) {
  const [activeTab, setActiveTab] = useState<QaTab>('design');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [cycles, setCycles] = useState<TestCycleRecord[]>([]);
  const [executions, setExecutions] = useState<TestExecutionRecord[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRunRecord[]>([]);

  // Test Design filters
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [techniqueFilter, setTechniqueFilter] = useState('all');

  // Test Case Create/Edit Modal
  const [tcModalOpen, setTcModalOpen] = useState(false);
  const [editingTc, setEditingTc] = useState<TestCaseRecord | null>(null);
  const [savingTc, setSavingTc] = useState(false);
  const [tcFormError, setTcFormError] = useState('');
  const [tcForm, setTcForm] = useState({
    testId: '',
    requirementId: 'TASK-01',
    module: 'Task Management',
    testType: 'Functional' as TestType,
    technique: 'Positive Testing' as TestTechnique,
    scenario: '',
    preconditions: '',
    testData: '',
    executionSteps: '',
    expectedResult: '',
    priority: 'High' as QaPriority,
  });

  // Manual Test Execution Modal
  const [execTargetTc, setExecTargetTc] = useState<TestCaseRecord | null>(null);
  const [savingExec, setSavingExec] = useState(false);
  const [execError, setExecError] = useState('');
  const [execForm, setExecForm] = useState({
    cycleId: '',
    testType: 'Functional',
    executionOrigin: 'Internal QA' as ExecutionOrigin,
    environment: 'Localhost / Staging',
    browserDevice: 'Chrome · Desktop',
    tester: user.name,
    testData: '',
    expectedResult: '',
    actualResult: '',
    status: 'Pass' as 'Pass' | 'Fail' | 'Blocked' | 'Not Run',
    evidence: '',
    defectId: '',
  });

  // Cycle Create Form
  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [savingCycle, setSavingCycle] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    name: '',
    scope: 'Regression',
    executionOrigin: 'Internal QA' as ExecutionOrigin,
    environment: 'Localhost / Staging',
    status: 'Active' as CycleStatus,
    notes: '',
  });

  // Automation Runners State
  const [runningNewman, setRunningNewman] = useState(false);
  const [runningPostgres, setRunningPostgres] = useState(false);
  const [postgresChecks, setPostgresChecks] = useState<PostgresCheckItem[]>([]);

  // Interactive REST API Workbench
  const [selectedEndpointId, setSelectedEndpointId] = useState(API_ENDPOINT_DOCS[0].id);
  const [apiPath, setApiPath] = useState(API_ENDPOINT_DOCS[0].path);
  const [apiMethod, setApiMethod] = useState(API_ENDPOINT_DOCS[0].method);
  const [apiBody, setApiBody] = useState(API_ENDPOINT_DOCS[0].sampleBody ?? '');
  const [apiSkipAuth, setApiSkipAuth] = useState(false);
  const [apiRunning, setApiRunning] = useState(false);
  const [apiResult, setApiResult] = useState<{
    status: number;
    durationMs: number;
    body: string;
  } | null>(null);

  // SQL Copy Indicator
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);

  // Safe Delete & Unlink Confirmation Modal State
  const [deleteTcTarget, setDeleteTcTarget] = useState<TestCaseRecord | null>(null);
  const [deleteTcDeps, setDeleteTcDeps] = useState<TestCaseDependencies | null>(null);
  const [deletingTc, setDeletingTc] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, tcRes, cycRes, exRes, autoRes] = await Promise.all([
        qaApi.listRequirements(),
        qaApi.listTestCases(),
        qaApi.listCycles(),
        qaApi.listExecutions(),
        qaApi.listAutomationRuns(),
      ]);
      setRequirements(reqRes.requirements);
      setTestCases(tcRes.testCases);
      setCycles(cycRes.cycles);
      setExecutions(exRes.executions);
      setAutomationRuns(autoRes.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QA Lab workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredTestCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return testCases.filter((tc) => {
      if (moduleFilter !== 'all' && tc.module !== moduleFilter) return false;
      if (statusFilter !== 'all' && tc.status !== statusFilter) return false;
      if (techniqueFilter !== 'all' && tc.technique !== techniqueFilter) return false;
      if (q) {
        const hay = [
          tc.testId,
          tc.requirementId,
          tc.module,
          tc.scenario,
          tc.technique,
          tc.testType,
          tc.defectId,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [testCases, search, moduleFilter, statusFilter, techniqueFilter]);

  // Test Case Modal handlers
  const openCreateTc = () => {
    setEditingTc(null);
    setTcForm({
      testId: `TC-${String(testCases.length + 1).padStart(3, '0')}`,
      requirementId: requirements[0]?.reqCode ?? '',
      module: 'Task Management',
      testType: 'Functional',
      technique: 'Positive Testing',
      scenario: '',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: '',
      priority: 'High',
    });
    setTcFormError('');
    setTcModalOpen(true);
  };

  const openEditTc = (tc: TestCaseRecord) => {
    setEditingTc(tc);
    setTcForm({
      testId: tc.testId,
      requirementId: tc.requirementId,
      module: tc.module,
      testType: tc.testType,
      technique: tc.technique,
      scenario: tc.scenario,
      preconditions: tc.preconditions,
      testData: tc.testData,
      executionSteps: tc.executionSteps,
      expectedResult: tc.expectedResult,
      priority: tc.priority,
    });
    setTcFormError('');
    setTcModalOpen(true);
  };

  const handleSaveTc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tcForm.testId.trim() || !tcForm.scenario.trim() || !tcForm.expectedResult.trim()) {
      setTcFormError('Test ID, scenario, and expected result are required.');
      return;
    }
    setSavingTc(true);
    setTcFormError('');
    try {
      if (editingTc) {
        const res = await qaApi.updateTestCase(editingTc.id, tcForm);
        setTestCases((prev) => prev.map((t) => (t.id === editingTc.id ? res.testCase : t)));
        if (editingTc.testId !== res.testCase.testId || editingTc.scenario !== res.testCase.scenario) {
          const exRes = await qaApi.listExecutions();
          setExecutions(exRes.executions);
        }
        setNotice(`Updated test case ${res.testCase.testId}.`);
      } else {
        const res = await qaApi.createTestCase(tcForm);
        setTestCases((prev) => [...prev, res.testCase]);
        setNotice(`Created test case ${res.testCase.testId} (Status: Not Run).`);
      }
      setTcModalOpen(false);
    } catch (err) {
      setTcFormError(err instanceof Error ? err.message : 'Failed to save test case.');
    } finally {
      setSavingTc(false);
    }
  };

  const handleDuplicateTc = async (tc: TestCaseRecord) => {
    setError('');
    try {
      const res = await qaApi.duplicateTestCase(tc.id);
      setTestCases((prev) => [...prev, res.testCase]);
      setNotice(`Duplicated ${tc.testId} as ${res.testCase.testId} (Status: Not Run).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate test case.');
    }
  };

  const handleDeleteTc = async (tc: TestCaseRecord) => {
    setError('');
    try {
      const { dependencies } = await qaApi.getTestCaseDependencies(tc.id);
      if (dependencies.totalLinked > 0) {
        setDeleteTcTarget(tc);
        setDeleteTcDeps(dependencies);
        return;
      }
      await qaApi.deleteTestCase(tc.id, false);
      setTestCases((prev) => prev.filter((t) => t.id !== tc.id));
      setNotice(`Deleted test case ${tc.testId}.`);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'LINKED_DEPENDENCIES_EXIST' &&
        err.payload &&
        typeof err.payload.dependencies === 'object'
      ) {
        setDeleteTcTarget(tc);
        setDeleteTcDeps(err.payload.dependencies as TestCaseDependencies);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to delete test case.');
    }
  };

  const handleConfirmUnlinkDeleteTc = async () => {
    if (!deleteTcTarget) return;
    setDeletingTc(true);
    setError('');
    try {
      const result = await qaApi.deleteTestCase(deleteTcTarget.id, true);
      setTestCases((prev) => prev.filter((t) => t.id !== deleteTcTarget.id));
      const exRes = await qaApi.listExecutions();
      setExecutions(exRes.executions);
      setNotice(
        `Deleted ${deleteTcTarget.testId}. Preserved ${result.preservedExecutionsCount} execution run(s) and unlinked ${result.unlinkedBugReportsCount} defect(s).`
      );
      setDeleteTcTarget(null);
      setDeleteTcDeps(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink and delete test case.');
    } finally {
      setDeletingTc(false);
    }
  };

  // Manual Test Execution handlers
  const openExecuteModal = (tc: TestCaseRecord) => {
    setExecTargetTc(tc);
    setExecError('');
    setExecForm({
      cycleId: cycles.find((c) => c.status === 'Active')?.id.toString() ?? '',
      testType: tc.testType,
      executionOrigin: 'Internal QA',
      environment: 'Localhost / Staging',
      browserDevice: 'Chrome · Desktop',
      tester: user.name,
      testData: tc.testData,
      expectedResult: tc.expectedResult,
      actualResult: '',
      status: 'Pass',
      evidence: '',
      defectId: tc.defectId || '',
    });
  };

  const handleRecordExecution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!execTargetTc) return;
    if (!execForm.actualResult.trim()) {
      setExecError('Please enter the observed actual result before saving.');
      return;
    }
    setSavingExec(true);
    setExecError('');
    try {
      const res = await qaApi.recordExecution({
        testCaseId: execTargetTc.id,
        cycleId: execForm.cycleId ? Number(execForm.cycleId) : null,
        testType: execForm.testType,
        executionOrigin: execForm.executionOrigin,
        environment: execForm.environment,
        browserDevice: execForm.browserDevice,
        tester: execForm.tester || user.name,
        testData: execForm.testData,
        expectedResult: execForm.expectedResult,
        actualResult: execForm.actualResult,
        status: execForm.status,
        evidence: execForm.evidence,
        defectId: execForm.defectId,
      });
      setTestCases((prev) => prev.map((t) => (t.id === res.testCase.id ? res.testCase : t)));
      setExecutions((prev) => [res.execution, ...prev]);
      setNotice(
        `Recorded ${res.execution.status} run for ${execTargetTc.testId} (${res.execution.executionOrigin}).`
      );
      setExecTargetTc(null);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Failed to record execution.');
    } finally {
      setSavingExec(false);
    }
  };

  // Cycle handlers
  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleForm.name.trim()) return;
    setSavingCycle(true);
    setError('');
    try {
      const res = await qaApi.createCycle(cycleForm);
      setCycles((prev) => [res.cycle, ...prev]);
      setCycleFormOpen(false);
      setCycleForm({
        name: '',
        scope: 'Regression',
        executionOrigin: 'Internal QA',
        environment: 'Localhost / Staging',
        status: 'Active',
        notes: '',
      });
      setNotice(`Created test cycle "${res.cycle.name}" (${res.cycle.executionOrigin}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test cycle.');
    } finally {
      setSavingCycle(false);
    }
  };

  const handleCycleStatusChange = async (cycle: TestCycleRecord, status: CycleStatus) => {
    try {
      const res = await qaApi.updateCycleStatus(cycle.id, status);
      setCycles((prev) => prev.map((c) => (c.id === cycle.id ? res.cycle : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cycle status.');
    }
  };

  // Automation Runners
  const handleRunNewman = async () => {
    setRunningNewman(true);
    setError('');
    setNotice('');
    try {
      const res = await qaApi.runNewmanSuite();
      setAutomationRuns((prev) => [res.run, ...prev]);
      setNotice(
        `Newman API Guard completed: ${res.run.passedAssertions}/${res.run.totalAssertions} assertions passed across ${res.run.totalItems} requests.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Newman API Guard failed to execute.');
    } finally {
      setRunningNewman(false);
    }
  };

  const handleRunPostgres = async () => {
    setRunningPostgres(true);
    setError('');
    setNotice('');
    try {
      const res = await qaApi.runPostgresValidation();
      setAutomationRuns((prev) => [res.run, ...prev]);
      setPostgresChecks(res.checks);
      setNotice(
        `PostgreSQL Validation Suite completed: ${res.run.passedAssertions}/${res.run.totalAssertions} integrity checks passed.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PostgreSQL validation failed.');
    } finally {
      setRunningPostgres(false);
    }
  };

  // Interactive API Runner
  const handleSelectEndpoint = (id: string) => {
    const doc = API_ENDPOINT_DOCS.find((d) => d.id === id);
    if (!doc) return;
    setSelectedEndpointId(doc.id);
    setApiPath(doc.path);
    setApiMethod(doc.method);
    setApiBody(doc.sampleBody ?? '');
    setApiResult(null);
  };

  const handleRunEndpoint = async () => {
    setApiRunning(true);
    setApiResult(null);
    const t0 = performance.now();
    try {
      let parsedBody: unknown = undefined;
      if (apiMethod !== 'GET' && apiMethod !== 'DELETE' && apiBody.trim()) {
        parsedBody = JSON.parse(apiBody);
      }
      const res = await apiRequest<unknown>(apiPath, {
        method: apiMethod,
        body: parsedBody,
        skipAuth: apiSkipAuth,
      });
      setApiResult({
        status: 200,
        durationMs: Math.round(performance.now() - t0),
        body: JSON.stringify(res, null, 2),
      });
      if (apiPath.startsWith('/api/tasks')) onTasksChanged();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string; details?: unknown };
      setApiResult({
        status: apiErr.status ?? 500,
        durationMs: Math.round(performance.now() - t0),
        body: JSON.stringify(
          { error: apiErr.message ?? 'Request failed', details: apiErr.details },
          null,
          2
        ),
      });
    } finally {
      setApiRunning(false);
    }
  };

  const handleExportTestCasesCsv = () => {
    downloadCsv(
      'taskflow-test-cases.csv',
      [
        'Test Case ID',
        'Requirement ID',
        'Module',
        'Test Type',
        'Technique',
        'Priority',
        'Scenario',
        'Preconditions',
        'Test Data',
        'Steps',
        'Expected Result',
        'Actual Result',
        'Status',
        'Tester',
        'Execution Date',
        'Linked Defect ID',
      ],
      filteredTestCases.map((tc) => [
        tc.testId,
        tc.requirementId,
        tc.module,
        tc.testType,
        tc.technique,
        tc.priority,
        tc.scenario,
        tc.preconditions,
        tc.testData,
        tc.executionSteps,
        tc.expectedResult,
        tc.actualResult,
        tc.status,
        tc.tester,
        tc.executedAt ?? '',
        tc.defectId,
      ])
    );
  };

  const latestNewman = automationRuns.find((r) => r.suite === 'newman') ?? null;
  const latestPostgres = automationRuns.find((r) => r.suite === 'postgres') ?? null;
  const selectedEndpointDoc = API_ENDPOINT_DOCS.find((d) => d.id === selectedEndpointId);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
        Loading QA &amp; Testing Lab...
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

      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-6">
        {(
          [
            { id: 'design', label: `Test Design (${testCases.length})` },
            { id: 'cycles', label: `Cycles & Execution History (${executions.length})` },
            { id: 'automation', label: 'Automation (Newman · Playwright · PostgreSQL)' },
            { id: 'sql', label: 'SQL Validation Reference' },
          ] as Array<{ id: QaTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: TEST DESIGN ─────────────────────────────────────────── */}
      {activeTab === 'design' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Structured Test Design Catalog
              </h2>
              <p className="text-xs text-slate-500">
                All 7 black-box techniques supported. New and duplicated cases start in Not Run until genuinely executed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportTestCasesCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={openCreateTc}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Test Case</span>
              </button>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search TC ID, Req ID, scenario..."
                aria-label="Search test cases"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              aria-label="Filter test cases by module"
              className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">All Modules</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={techniqueFilter}
              onChange={(e) => setTechniqueFilter(e.target.value)}
              aria-label="Filter test cases by technique"
              className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">All 7 Techniques</option>
              {TEST_TECHNIQUES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter test cases by status"
              className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="Not Run">Not Run</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Test ID / Req</th>
                  <th className="py-3 px-4">Scenario &amp; Steps</th>
                  <th className="py-3 px-4">Technique &amp; Type</th>
                  <th className="py-3 px-4">Expected / Actual</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTestCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      No test cases match the active filters.
                    </td>
                  </tr>
                ) : (
                  filteredTestCases.map((tc) => (
                    <tr key={tc.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {tc.testId}
                        </p>
                        <p className="font-mono text-[11px] text-blue-700 mt-0.5">
                          {tc.requirementId}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{tc.priority}</p>
                      </td>
                      <td className="py-3.5 px-4 min-w-[240px]">
                        <p className="font-medium text-slate-900">{tc.scenario}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{tc.module}</p>
                        {tc.testData && (
                          <p className="text-[11px] text-slate-600 mt-1">
                            <span className="font-medium text-slate-800">Data:</span> {tc.testData}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        <p className="font-medium text-slate-800">{tc.technique}</p>
                        <p className="text-slate-500 mt-0.5">{tc.testType}</p>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs text-xs text-slate-600 space-y-1">
                        <p>
                          <span className="font-medium text-slate-800">Exp:</span>{' '}
                          {tc.expectedResult}
                        </p>
                        {tc.actualResult && (
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-900">Act:</span>{' '}
                            {tc.actualResult}
                          </p>
                        )}
                        {tc.defectId && (
                          <p className="font-mono text-[11px] text-red-700">
                            Defect: {tc.defectId}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        <span className={TC_STATUS_CLASS[tc.status] ?? 'text-slate-600'}>
                          {tc.status}
                        </span>
                        {tc.tester && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{tc.tester}</p>
                        )}
                        {tc.executedAt && (
                          <p className="text-[11px] text-slate-400">
                            {new Date(tc.executedAt).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openExecuteModal(tc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                          >
                            <Play className="w-3 h-3" aria-hidden="true" />
                            <span>Run</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditTc(tc)}
                            aria-label={`Edit ${tc.testId}`}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded-md"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateTc(tc)}
                            aria-label={`Duplicate ${tc.testId}`}
                            title="Duplicate test case"
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTc(tc)}
                            aria-label={`Delete ${tc.testId}`}
                            className="p-1.5 text-slate-400 hover:text-red-700 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: EXECUTION CYCLES & IMMUTABLE HISTORY ────────────────── */}
      {activeTab === 'cycles' && (
        <div className="space-y-6">
          {/* Test Execution Cycles */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Test Execution Cycles ({cycles.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Explicitly separate Internal QA validation cycles from External User / Client UAT cycles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCycleFormOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Test Cycle</span>
              </button>
            </div>

            {cycleFormOpen && (
              <form
                onSubmit={handleCreateCycle}
                className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                <input
                  type="text"
                  value={cycleForm.name}
                  onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
                  placeholder="Cycle name (e.g. Sprint 4 Internal Regression)"
                  required
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
                <select
                  value={cycleForm.executionOrigin}
                  onChange={(e) =>
                    setCycleForm({
                      ...cycleForm,
                      executionOrigin: e.target.value as ExecutionOrigin,
                    })
                  }
                  aria-label="Execution origin"
                  className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="Internal QA">Internal QA</option>
                  <option value="External User / Client">External User / Client</option>
                </select>
                <select
                  value={cycleForm.scope}
                  onChange={(e) => setCycleForm({ ...cycleForm, scope: e.target.value })}
                  aria-label="Test scope"
                  className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="Functional">Functional</option>
                  <option value="Integration">Integration</option>
                  <option value="Regression">Regression</option>
                  <option value="Exploratory">Exploratory</option>
                  <option value="UAT">UAT</option>
                </select>
                <input
                  type="text"
                  value={cycleForm.environment}
                  onChange={(e) => setCycleForm({ ...cycleForm, environment: e.target.value })}
                  placeholder="Environment"
                  className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  value={cycleForm.notes}
                  onChange={(e) => setCycleForm({ ...cycleForm, notes: e.target.value })}
                  placeholder="Entry/exit notes"
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCycleFormOpen(false)}
                    className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 bg-white rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCycle}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                  >
                    {savingCycle ? 'Creating...' : 'Create Cycle'}
                  </button>
                </div>
              </form>
            )}

            {cycles.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No test execution cycles created yet. Create a cycle above to group manual test runs.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {cycles.map((c) => {
                  const runCount = executions.filter((e) => e.cycleId === c.id).length;
                  return (
                    <div
                      key={c.id}
                      className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <strong className="text-slate-700">{c.executionOrigin}</strong> ·{' '}
                          {c.scope} · {c.environment} · {runCount} run{runCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <select
                        value={c.status}
                        onChange={(e) => handleCycleStatusChange(c, e.target.value as CycleStatus)}
                        aria-label={`Status for cycle ${c.name}`}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                      >
                        <option value="Planned">Planned</option>
                        <option value="Active">Active</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Immutable Execution History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Immutable Execution History ({executions.length})
              </h2>
              <p className="text-xs text-slate-500">
                Append-only PostgreSQL audit trail. Re-executing a test case preserves all historical runs.
              </p>
            </div>

            {executions.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No manual test executions have been recorded yet. Go to <strong>Test Design</strong> and click <strong>Run</strong> on any test case.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Test Case</th>
                      <th className="py-3 px-4">Cycle &amp; Origin</th>
                      <th className="py-3 px-4">Environment</th>
                      <th className="py-3 px-4">Tester</th>
                      <th className="py-3 px-4">Actual Result</th>
                      <th className="py-3 px-4">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {executions.map((ex) => (
                      <tr key={ex.id} className="align-top">
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">
                          {new Date(ex.executedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-semibold text-slate-900">
                              {ex.testId ?? ex.testCaseCodeSnapshot ?? (ex.testCaseId ? `#${ex.testCaseId}` : 'Archived')}
                            </span>
                            {ex.testCaseId === null && (
                              <span className="text-[11px] font-medium text-slate-500">
                                (Archived snapshot)
                              </span>
                            )}
                          </div>
                          {(ex.scenario || ex.testCaseScenarioSnapshot) && (
                            <p className="text-slate-600 mt-0.5 max-w-xs">
                              {ex.scenario || ex.testCaseScenarioSnapshot}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="font-medium text-slate-800">{ex.executionOrigin}</p>
                          <p className="text-slate-500">
                            {ex.cycleName ? ex.cycleName : 'Ad-hoc run'} · {ex.testType}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                          <p>{ex.environment}</p>
                          <p className="text-slate-500">{ex.browserDevice}</p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700">{ex.tester}</td>
                        <td className="py-3 px-4 max-w-xs text-slate-700">
                          <p>{ex.actualResult}</p>
                          {ex.evidence && (
                            <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                              Evidence: {ex.evidence}
                            </p>
                          )}
                          {ex.defectId && (
                            <p className="font-mono text-[11px] text-red-700 mt-0.5">
                              Defect: {ex.defectId}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={TC_STATUS_CLASS[ex.status] ?? 'text-slate-600'}>
                            {ex.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: AUTOMATION (NEWMAN · PLAYWRIGHT · POSTGRESQL · API) ─── */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          {/* Live Newman API Guard + PostgreSQL Validation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Newman Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 font-display">
                    <Terminal className="w-4 h-4 text-blue-700" aria-hidden="true" />
                    <span>TaskFlow API Guard (Postman + Newman)</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    34 requests, 178 assertions covering auth, CRUD, search/filter/sort, cross-user 403 isolation, and negative inputs.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={runningNewman}
                  onClick={handleRunNewman}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {runningNewman
                      ? 'Running 34 Newman Requests...'
                      : 'Run Newman API Guard Live'}
                  </span>
                </button>
                {latestNewman?.reportPath && (
                  <a
                    href={latestNewman.reportPath}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open HTML Report</span>
                  </a>
                )}
              </div>

              {latestNewman ? (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Requests</p>
                      <p className="font-bold text-slate-900 tabular-nums">
                        {latestNewman.totalItems}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Passed</p>
                      <p className="font-bold text-emerald-700 tabular-nums">
                        {latestNewman.passedAssertions}/{latestNewman.totalAssertions}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Failed</p>
                      <p
                        className={`font-bold tabular-nums ${
                          latestNewman.failedAssertions > 0 ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {latestNewman.failedAssertions}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Avg Resp</p>
                      <p className="font-bold text-slate-900 tabular-nums">
                        {latestNewman.avgResponseMs} ms
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Executed {new Date(latestNewman.executedAt).toLocaleString()} · Total duration{' '}
                    {latestNewman.durationMs} ms · JUnit exported to{' '}
                    <code className="font-mono">reports/newman/junit-report.xml</code>
                  </p>
                  {latestNewman.failedEndpoints.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 space-y-1">
                      <p className="font-semibold">Failed Assertions:</p>
                      {latestNewman.failedEndpoints.slice(0, 5).map((f, idx) => (
                        <p key={idx} className="font-mono text-[11px]">
                          {f.name}: {f.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                  No Newman run stored yet. Click <strong>Run Newman API Guard Live</strong> to execute all 34 requests against the live Express + PostgreSQL server.
                </p>
              )}
            </div>

            {/* PostgreSQL Live Validator Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 font-display">
                  <Database className="w-4 h-4 text-blue-700" aria-hidden="true" />
                  <span>PostgreSQL Integrity &amp; Constraint Suite</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Executes 8 live non-destructive checks: PKs, FKs, duplicate email checks, orphan detection, and rolled-back 23503/23505 constraint tests.
                </p>
              </div>

              <button
                type="button"
                disabled={runningPostgres}
                onClick={handleRunPostgres}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {runningPostgres
                    ? 'Running PostgreSQL Checks...'
                    : 'Run PostgreSQL Validation Live'}
                </span>
              </button>

              {latestPostgres ? (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-900 tabular-nums">
                    Latest Result:{' '}
                    <span
                      className={
                        latestPostgres.failedAssertions === 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }
                    >
                      {latestPostgres.passedAssertions}/{latestPostgres.totalAssertions} passed
                    </span>{' '}
                    · {latestPostgres.durationMs} ms ·{' '}
                    {new Date(latestPostgres.executedAt).toLocaleString()}
                  </p>
                  {postgresChecks.length > 0 && (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {postgresChecks.map((chk, idx) => (
                        <div
                          key={idx}
                          className="text-xs border-b border-slate-100 pb-1.5 last:border-b-0 flex items-start justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium text-slate-800">{chk.name}</p>
                            <p className="text-[11px] text-slate-500">{chk.detail}</p>
                          </div>
                          <span
                            className={`shrink-0 font-semibold ${
                              chk.passed ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {chk.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                  No PostgreSQL validation run stored yet. Run live checks above to verify database constraints.
                </p>
              )}
            </div>
          </div>

          {/* Playwright E2E & GitLab CI Reference */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 font-display">
              <Layers className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Playwright E2E Suite &amp; GitLab CI Pipeline</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Reusable Page Object Model (<code className="font-mono">tests/e2e/pages/TaskFlowPage.mjs</code>) and Playwright specs (
              <code className="font-mono">tests/e2e/taskflow.spec.mjs</code>) cover registration, login/logout, task CRUD, search/filter, cross-user 403 isolation, and desktop/mobile responsive layout checks. CI pipeline stages are defined in{' '}
              <code className="font-mono">.gitlab-ci.yml</code> (install, typecheck, unit tests, Newman API regression, Newman data-driven negative CSV suite, Playwright E2E, and JUnit/HTML report artifacts).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
              <div>
                <p className="font-sans text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  Newman Regression
                </p>
                <code>npm run test:api</code>
              </div>
              <div>
                <p className="font-sans text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  Newman Negative DDT (CSV)
                </p>
                <code>npm run test:api:ddt</code>
              </div>
              <div>
                <p className="font-sans text-[11px] font-semibold text-slate-500 uppercase mb-1">
                  Playwright E2E (Local / CI)
                </p>
                <code>npx playwright test</code>
              </div>
            </div>
          </div>

          {/* Interactive REST API Workbench */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Interactive REST API Workbench
              </h3>
              <p className="text-xs text-slate-500">
                Send real HTTP requests against TaskFlow endpoints using your active session or unauthenticated mode.
              </p>
            </div>
            <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                {API_ENDPOINT_DOCS.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleSelectEndpoint(doc.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      selectedEndpointId === doc.id
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-mono font-semibold text-blue-700">{doc.method}</span>{' '}
                    <span className="font-mono">{doc.path}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{doc.purpose}</p>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value as typeof apiMethod)}
                    aria-label="HTTP Method"
                    className="px-2.5 py-2 text-xs font-mono font-semibold bg-white border border-slate-200 rounded-lg"
                  >
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={apiPath}
                    onChange={(e) => setApiPath(e.target.value)}
                    aria-label="Endpoint URL path"
                    className="flex-1 min-w-[200px] px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={apiRunning}
                    onClick={handleRunEndpoint}
                    className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                  >
                    {apiRunning ? 'Sending...' : 'Send Request'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={apiSkipAuth}
                      onChange={(e) => setApiSkipAuth(e.target.checked)}
                    />
                    <span>Send without Bearer token (test 401 auth guard)</span>
                  </label>
                  {selectedEndpointDoc?.invalidBody && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setApiBody(selectedEndpointDoc.sampleBody ?? '')}
                        className="text-blue-700 hover:underline"
                      >
                        Load Valid Payload
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setApiBody(selectedEndpointDoc.invalidBody ?? '')}
                        className="text-amber-700 hover:underline"
                      >
                        Load Invalid Payload
                      </button>
                    </div>
                  )}
                </div>

                {apiMethod !== 'GET' && apiMethod !== 'DELETE' && (
                  <textarea
                    rows={5}
                    value={apiBody}
                    onChange={(e) => setApiBody(e.target.value)}
                    aria-label="JSON request payload"
                    className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                )}

                {apiResult && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
                      <span
                        className={
                          apiResult.status < 400
                            ? 'text-emerald-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        HTTP {apiResult.status}
                      </span>
                      <span className="text-slate-500">{apiResult.durationMs} ms</span>
                    </div>
                    <pre className="p-3 text-xs font-mono text-slate-800 overflow-x-auto max-h-60">
                      {apiResult.body}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: SQL VALIDATION REFERENCE ────────────────────────────── */}
      {activeTab === 'sql' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SQL_VALIDATION_QUERIES.map((q) => (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                    {q.category}
                  </p>
                  <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
                    {q.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(q.sql);
                    } catch {
                      /* clipboard fallback */
                    }
                    setCopiedSqlId(q.id);
                    setTimeout(() => setCopiedSqlId(null), 1500);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 shrink-0"
                >
                  {copiedSqlId === q.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-600">{q.purpose}</p>
              <pre className="p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 overflow-x-auto">
                {q.sql}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL: CREATE / EDIT TEST CASE ─────────────────────────────── */}
      {tcModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="tc-modal-title" className="font-display text-base font-bold text-slate-900">
                {editingTc ? `Edit Test Case ${editingTc.testId}` : 'New Test Case'}
              </h2>
              <button
                type="button"
                onClick={() => setTcModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTc} className="p-6 space-y-4">
              {tcFormError && (
                <div role="alert" className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {tcFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Test Case ID *
                  </label>
                  <input
                    type="text"
                    value={tcForm.testId}
                    onChange={(e) => setTcForm({ ...tcForm, testId: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Requirement ID (optional)
                  </label>
                  <input
                    type="text"
                    list="srs-req-ids"
                    value={tcForm.requirementId}
                    onChange={(e) => setTcForm({ ...tcForm, requirementId: e.target.value })}
                    placeholder="e.g. TASK-01 or leave blank"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                  <datalist id="srs-req-ids">
                    {requirements.map((r) => (
                      <option key={r.id} value={r.reqCode}>
                        {r.title}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={tcForm.priority}
                    onChange={(e) =>
                      setTcForm({ ...tcForm, priority: e.target.value as QaPriority })
                    }
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
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Module</label>
                  <select
                    value={tcForm.module}
                    onChange={(e) => setTcForm({ ...tcForm, module: e.target.value })}
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Test Type</label>
                  <select
                    value={tcForm.testType}
                    onChange={(e) =>
                      setTcForm({ ...tcForm, testType: e.target.value as TestType })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {TEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Design Technique
                  </label>
                  <select
                    value={tcForm.technique}
                    onChange={(e) =>
                      setTcForm({ ...tcForm, technique: e.target.value as TestTechnique })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {TEST_TECHNIQUES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Test Scenario *
                </label>
                <input
                  type="text"
                  value={tcForm.scenario}
                  onChange={(e) => setTcForm({ ...tcForm, scenario: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Preconditions
                  </label>
                  <textarea
                    rows={2}
                    value={tcForm.preconditions}
                    onChange={(e) => setTcForm({ ...tcForm, preconditions: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Test Data</label>
                  <textarea
                    rows={2}
                    value={tcForm.testData}
                    onChange={(e) => setTcForm({ ...tcForm, testData: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Execution Steps
                </label>
                <textarea
                  rows={3}
                  value={tcForm.executionSteps}
                  onChange={(e) => setTcForm({ ...tcForm, executionSteps: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Result *
                </label>
                <textarea
                  rows={2}
                  value={tcForm.expectedResult}
                  onChange={(e) => setTcForm({ ...tcForm, expectedResult: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTcModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTc}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  {savingTc ? 'Saving...' : editingTc ? 'Save Changes' : 'Create Test Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD MANUAL TEST EXECUTION ────────────────────────── */}
      {execTargetTc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 id="exec-modal-title" className="font-display text-base font-bold text-slate-900">
                  Execute {execTargetTc.testId} ({execTargetTc.requirementId})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{execTargetTc.scenario}</p>
              </div>
              <button
                type="button"
                onClick={() => setExecTargetTc(null)}
                aria-label="Close execution modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordExecution} className="p-6 space-y-4">
              {execError && (
                <div role="alert" className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {execError}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <p>
                  <strong className="text-slate-800">Steps:</strong>{' '}
                  {execTargetTc.executionSteps || 'Follow test scenario steps.'}
                </p>
                <p>
                  <strong className="text-slate-800">Expected:</strong>{' '}
                  {execTargetTc.expectedResult}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Execution Status *
                  </label>
                  <select
                    value={execForm.status}
                    onChange={(e) =>
                      setExecForm({
                        ...execForm,
                        status: e.target.value as 'Pass' | 'Fail' | 'Blocked' | 'Not Run',
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Testing Origin
                  </label>
                  <select
                    value={execForm.executionOrigin}
                    onChange={(e) =>
                      setExecForm({
                        ...execForm,
                        executionOrigin: e.target.value as ExecutionOrigin,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Internal QA">Internal QA</option>
                    <option value="External User / Client">External User / Client</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Test Cycle
                  </label>
                  <select
                    value={execForm.cycleId}
                    onChange={(e) => setExecForm({ ...execForm, cycleId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Ad-hoc Execution</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.executionOrigin})
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
                    value={execForm.environment}
                    onChange={(e) => setExecForm({ ...execForm, environment: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Browser / Device
                  </label>
                  <input
                    type="text"
                    value={execForm.browserDevice}
                    onChange={(e) => setExecForm({ ...execForm, browserDevice: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tester</label>
                  <input
                    type="text"
                    value={execForm.tester}
                    onChange={(e) => setExecForm({ ...execForm, tester: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Actual Observed Result *
                </label>
                <textarea
                  rows={3}
                  value={execForm.actualResult}
                  onChange={(e) => setExecForm({ ...execForm, actualResult: e.target.value })}
                  placeholder="Describe the exact observed system behavior during this run."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Evidence / Screenshot / Log Note
                  </label>
                  <input
                    type="text"
                    value={execForm.evidence}
                    onChange={(e) => setExecForm({ ...execForm, evidence: e.target.value })}
                    placeholder="e.g. HTTP 201 verified, screenshot saved"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Linked Defect ID (if Failed)
                  </label>
                  <input
                    type="text"
                    value={execForm.defectId}
                    onChange={(e) => setExecForm({ ...execForm, defectId: e.target.value })}
                    placeholder="e.g. BUG-001"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExecTargetTc(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingExec}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
                >
                  {savingExec ? 'Recording...' : 'Record Execution Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: SAFE TEST CASE UNLINK & DELETE CONFIRMATION ─────────── */}
      {deleteTcTarget && deleteTcDeps && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tc-delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <h2
                  id="tc-delete-modal-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Preserve History &amp; Delete {deleteTcTarget.testId}?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTcTarget(null);
                  setDeleteTcDeps(null);
                }}
                aria-label="Close confirmation modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <p>
                Test case <span className="font-mono font-semibold text-slate-900">{deleteTcTarget.testId}</span>{' '}
                is linked to{' '}
                <strong>{deleteTcDeps.linkedExecutionsCount} execution run(s)</strong> and{' '}
                <strong>{deleteTcDeps.linkedBugReports.length} defect(s)</strong>.
              </p>

              {deleteTcDeps.linkedExecutionsCount > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
                  <strong>Immutable Execution History:</strong> All{' '}
                  {deleteTcDeps.linkedExecutionsCount} execution run(s) will be preserved with their
                  snapshots ({deleteTcTarget.testId} and scenario) and unlinked cleanly.
                </div>
              )}

              {deleteTcDeps.linkedBugReports.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    Defects to be unlinked (defect &amp; history preserved):
                  </p>
                  <ul className="text-xs text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                    {deleteTcDeps.linkedBugReports.map((bug) => (
                      <li key={bug.id}>
                        <span className="font-mono font-semibold text-slate-800">{bug.bugCode}</span> ({bug.status}) — {bug.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Confirming will preserve all historical execution runs, unlink defects with a defect
                history entry, record an audit log entry, and then delete{' '}
                <span className="font-mono font-semibold">{deleteTcTarget.testId}</span>.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTcTarget(null);
                    setDeleteTcDeps(null);
                  }}
                  disabled={deletingTc}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnlinkDeleteTc}
                  disabled={deletingTc}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-60"
                >
                  {deletingTc ? 'Preserving & Deleting...' : 'Confirm Preserve & Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
