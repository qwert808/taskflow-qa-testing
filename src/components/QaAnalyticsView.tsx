import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { qaApi } from '../lib/api';
import { computeQaPortfolioReport } from '../lib/analytics';
import type {
  AutomationRunRecord,
  BugReportRecord,
  BugStatus,
  QaPriority,
  RequirementRecord,
  TestCaseRecord,
  TestExecutionRecord,
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

const SEVERITY_COLORS: Record<QaPriority, string> = {
  Critical: '#b91c1c',
  High: '#c2410c',
  Medium: '#b45309',
  Low: '#64748b',
};

const BUG_STATUS_COLORS: Record<BugStatus, string> = {
  Open: '#b91c1c',
  'In Progress': '#1d4ed8',
  Fixed: '#4338ca',
  Retesting: '#b45309',
  Closed: '#15803d',
  Reopened: '#be123c',
};

export function QaAnalyticsView() {
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [executions, setExecutions] = useState<TestExecutionRecord[]>([]);
  const [bugs, setBugs] = useState<BugReportRecord[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, tcRes, exRes, bugRes, autoRes] = await Promise.all([
        qaApi.listRequirements(),
        qaApi.listTestCases(),
        qaApi.listExecutions(),
        qaApi.listBugs(),
        qaApi.listAutomationRuns(),
      ]);
      setRequirements(reqRes.requirements);
      setTestCases(tcRes.testCases);
      setExecutions(exRes.executions);
      setBugs(bugRes.bugs);
      setAutomationRuns(autoRes.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QA analytics report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const report = useMemo(
    () => computeQaPortfolioReport(requirements, testCases, executions, bugs, automationRuns),
    [requirements, testCases, executions, bugs, automationRuns]
  );

  const handleExportSummaryCsv = () => {
    downloadCsv(
      'taskflow-qa-summary-report.csv',
      ['Metric', 'Value', 'Notes'],
      [
        ['Total Requirements', String(report.totalRequirements), 'SRS requirements stored in PostgreSQL'],
        [
          'Requirement Coverage',
          `${report.requirementCoveragePct}%`,
          `${report.coveredRequirements} of ${report.totalRequirements} linked to test cases`,
        ],
        ['Total Test Cases', String(report.totalTestCases), 'Designed test cases'],
        ['Executed Test Cases', String(report.executedTestCases), 'Pass + Fail + Blocked'],
        ['Passed Test Cases', String(report.passedTestCases), ''],
        ['Failed Test Cases', String(report.failedTestCases), ''],
        ['Blocked Test Cases', String(report.blockedTestCases), ''],
        ['Not Run Test Cases', String(report.notRunTestCases), ''],
        [
          'Pass Rate',
          report.passRatePct === null ? 'No execution data' : `${report.passRatePct}%`,
          'Calculated from executed test cases only',
        ],
        ['Total Defects', String(report.totalDefects), ''],
        ['Open Defects', String(report.openDefects), 'All non-Closed defects'],
        ['Critical / High Open Defects', String(report.criticalHighDefects), ''],
        [
          'Defect Closure Rate',
          report.defectClosureRatePct === null
            ? 'No defects logged'
            : `${report.defectClosureRatePct}%`,
          '',
        ],
        ['Regression Status', report.regressionStatus, 'Derived from regression cases + Newman runs'],
        [
          'Latest Newman Run',
          report.latestNewmanRun
            ? `${report.latestNewmanRun.passedAssertions}/${report.latestNewmanRun.totalAssertions} assertions passed`
            : 'Not executed yet',
          report.latestNewmanRun?.executedAt ?? '',
        ],
        [
          'Latest PostgreSQL Integrity Run',
          report.latestPostgresRun
            ? `${report.latestPostgresRun.passedAssertions}/${report.latestPostgresRun.totalAssertions} checks passed`
            : 'Not executed yet',
          report.latestPostgresRun?.executedAt ?? '',
        ],
      ]
    );
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
        Computing real-time QA Portfolio Analytics from PostgreSQL...
      </div>
    );
  }

  const maxSeverityCount = Math.max(1, ...Object.values(report.defectsBySeverity));
  const maxStatusCount = Math.max(1, ...Object.values(report.defectsByStatus));
  const maxTrendTotal = Math.max(1, ...report.executionTrend.map((p) => p.total));

  const totalTcForBar = Math.max(1, report.totalTestCases);
  const passW = (report.passedTestCases / totalTcForBar) * 100;
  const failW = (report.failedTestCases / totalTcForBar) * 100;
  const blockW = (report.blockedTestCases / totalTcForBar) * 100;
  const notRunW = (report.notRunTestCases / totalTcForBar) * 100;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {error}
        </div>
      )}

      {/* Report Header + Export Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Executive Quality Engineering Report
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every metric below is calculated live from stored PostgreSQL records and real automation runs. Unexecuted areas are reported explicitly.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleExportSummaryCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV Report</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Requirement Coverage</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {report.requirementCoveragePct}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.coveredRequirements}/{report.totalRequirements} SRS linked
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Executed Test Cases</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {report.executedTestCases}/{report.totalTestCases}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.notRunTestCases} Not Run
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Manual Pass Rate</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {report.passRatePct === null ? '—' : `${report.passRatePct}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {report.passRatePct === null
              ? 'No execution data yet'
              : `${report.passedTestCases} pass · ${report.failedTestCases} fail`}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Open Defects</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {report.openDefects}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.criticalHighDefects} Critical/High
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Defect Closure Rate</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {report.defectClosureRatePct === null ? '—' : `${report.defectClosureRatePct}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {report.totalDefects === 0
              ? 'No defects logged'
              : `${report.closedDefects}/${report.totalDefects} closed`}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Regression Status</p>
          <p
            className={`mt-1 font-display text-xl font-bold ${
              report.regressionStatus === 'Passing'
                ? 'text-emerald-700'
                : report.regressionStatus === 'Failing'
                  ? 'text-red-700'
                  : report.regressionStatus === 'Partial'
                    ? 'text-blue-700'
                    : 'text-slate-600'
            }`}
          >
            {report.regressionStatus}
          </p>
          <p className="mt-1 text-xs text-slate-500">Manual + API Guard</p>
        </div>
      </div>

      {/* Distribution & Coverage Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pass/Fail/Blocked/Not Run Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Test Case Execution Distribution
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {report.totalTestCases} total cases
            </span>
          </div>

          <svg
            viewBox="0 0 400 26"
            preserveAspectRatio="none"
            className="w-full h-5 rounded-md overflow-hidden"
            role="img"
            aria-label="Test case pass fail blocked not run distribution"
          >
            <rect x="0" y="0" width={passW * 4} height="26" fill="#15803d" />
            <rect x={passW * 4} y="0" width={failW * 4} height="26" fill="#b91c1c" />
            <rect x={(passW + failW) * 4} y="0" width={blockW * 4} height="26" fill="#d97706" />
            <rect
              x={(passW + failW + blockW) * 4}
              y="0"
              width={notRunW * 4}
              height="26"
              fill="#e2e8f0"
            />
          </svg>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Passed</p>
              <p className="font-semibold text-emerald-700 tabular-nums">
                {report.passedTestCases}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Failed</p>
              <p className="font-semibold text-red-700 tabular-nums">{report.failedTestCases}</p>
            </div>
            <div>
              <p className="text-slate-500">Blocked</p>
              <p className="font-semibold text-amber-700 tabular-nums">
                {report.blockedTestCases}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Not Run</p>
              <p className="font-semibold text-slate-700 tabular-nums">{report.notRunTestCases}</p>
            </div>
          </div>

          {/* Requirement Coverage Bar */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">SRS Requirement Coverage</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {report.requirementCoveragePct}% ({report.coveredRequirements}/{report.totalRequirements})
              </span>
            </div>
            <svg
              viewBox="0 0 400 14"
              preserveAspectRatio="none"
              className="w-full h-3 rounded-sm overflow-hidden"
              role="img"
              aria-label="Requirement coverage progress bar"
            >
              <rect x="0" y="0" width="400" height="14" fill="#e2e8f0" />
              <rect
                x="0"
                y="0"
                width={Math.round(report.requirementCoveragePct * 4)}
                height="14"
                fill="#1d4ed8"
              />
            </svg>
          </div>
        </div>

        {/* Execution Trend Over Time */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Manual Test Execution Trend
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {executions.length} recorded run{executions.length === 1 ? '' : 's'}
            </span>
          </div>

          {report.executionTrend.length === 0 ? (
            <div className="h-36 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500 px-4 text-center">
              No manual test executions recorded yet. Execute a test case in QA Lab to populate historical execution trends.
            </div>
          ) : (
            <div className="space-y-2.5">
              {report.executionTrend.slice(-7).map((pt) => {
                const passBar = (pt.passed / maxTrendTotal) * 100;
                const failBar = (pt.failed / maxTrendTotal) * 100;
                const blockBar = (pt.blocked / maxTrendTotal) * 100;
                return (
                  <div key={pt.date} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <span className="col-span-3 font-mono text-[11px] text-slate-600">
                      {pt.date}
                    </span>
                    <div className="col-span-7 h-4 bg-slate-100 rounded-sm overflow-hidden flex">
                      <div style={{ width: `${passBar}%`, backgroundColor: '#15803d' }} />
                      <div style={{ width: `${failBar}%`, backgroundColor: '#b91c1c' }} />
                      <div style={{ width: `${blockBar}%`, backgroundColor: '#d97706' }} />
                    </div>
                    <span className="col-span-2 text-right font-mono text-[11px] text-slate-700 tabular-nums">
                      {pt.passed}P / {pt.failed}F
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Defect Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">Defects by Severity</h3>
            <span className="text-xs text-slate-500 tabular-nums">{report.totalDefects} total</span>
          </div>
          {report.totalDefects === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              No defects recorded yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {(['Critical', 'High', 'Medium', 'Low'] as QaPriority[]).map((sev) => {
                const count = report.defectsBySeverity[sev];
                const pct = (count / maxSeverityCount) * 100;
                return (
                  <div key={sev} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <span className="col-span-3 text-slate-700 font-medium">{sev}</span>
                    <div className="col-span-7 h-3.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLORS[sev] }}
                        className="h-full"
                      />
                    </div>
                    <span className="col-span-2 text-right font-mono text-slate-800 tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">Defects by Lifecycle Status</h3>
            <span className="text-xs text-slate-500 tabular-nums">{report.openDefects} active</span>
          </div>
          {report.totalDefects === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              No defects recorded yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {(
                ['Open', 'In Progress', 'Fixed', 'Retesting', 'Closed', 'Reopened'] as BugStatus[]
              ).map((st) => {
                const count = report.defectsByStatus[st];
                const pct = (count / maxStatusCount) * 100;
                return (
                  <div key={st} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <span className="col-span-3 text-slate-700 font-medium">{st}</span>
                    <div className="col-span-7 h-3.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        style={{ width: `${pct}%`, backgroundColor: BUG_STATUS_COLORS[st] }}
                        className="h-full"
                      />
                    </div>
                    <span className="col-span-2 text-right font-mono text-slate-800 tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Automation Suite Summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            API Automation (Newman)
          </p>
          {report.latestNewmanRun ? (
            <>
              <p className="font-display text-xl font-bold text-slate-900 tabular-nums">
                {report.latestNewmanRun.passedAssertions}/{report.latestNewmanRun.totalAssertions}{' '}
                <span className="text-xs font-normal text-slate-500">assertions passed</span>
              </p>
              <p className="text-xs text-slate-600 tabular-nums">
                {report.latestNewmanRun.totalItems} requests · {report.latestNewmanRun.failedAssertions} failed · avg{' '}
                {report.latestNewmanRun.avgResponseMs} ms
              </p>
              <p className="text-[11px] text-slate-500">
                Last run: {new Date(report.latestNewmanRun.executedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Not executed in this workspace yet. Run TaskFlow API Guard from QA Lab → Automation.
            </p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Database Integrity (PostgreSQL)
          </p>
          {report.latestPostgresRun ? (
            <>
              <p className="font-display text-xl font-bold text-slate-900 tabular-nums">
                {report.latestPostgresRun.passedAssertions}/{report.latestPostgresRun.totalAssertions}{' '}
                <span className="text-xs font-normal text-slate-500">checks passed</span>
              </p>
              <p className="text-xs text-slate-600 tabular-nums">
                Duration: {report.latestPostgresRun.durationMs} ms · {report.latestPostgresRun.failedAssertions} failed
              </p>
              <p className="text-[11px] text-slate-500">
                Last run: {new Date(report.latestPostgresRun.executedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Not executed yet. Run the live PostgreSQL Validation Suite from QA Lab → Automation.
            </p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Browser Automation &amp; CI
          </p>
          <p className="text-sm font-semibold text-slate-900">
            Playwright E2E + GitLab CI Configured
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Specs authored in <code className="font-mono">tests/e2e/taskflow.spec.mjs</code> and pipeline in{' '}
            <code className="font-mono">.gitlab-ci.yml</code>. Run locally or in GitLab CI to produce Playwright JUnit artifacts.
          </p>
        </div>
      </div>
    </div>
  );
}
