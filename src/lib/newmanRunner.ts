import fs from 'node:fs';
import path from 'node:path';
import newman from 'newman';
import type { AutomationFailedEndpoint } from './types.ts';

export interface NewmanExecutionResult {
  suite: 'newman';
  runLabel: string;
  totalItems: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  avgResponseMs: number;
  failedEndpoints: AutomationFailedEndpoint[];
  reportPath: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlReport(
  result: NewmanExecutionResult,
  executions: Array<{ name: string; method: string; status: number; responseTime: number; failed: number }>
): string {
  const passPct =
    result.totalAssertions === 0
      ? 0
      : Math.round((result.passedAssertions / result.totalAssertions) * 100);
  const rows = executions
    .map(
      (ex) =>
        `<tr>
          <td>${escapeHtml(ex.name)}</td>
          <td><code>${escapeHtml(ex.method)}</code></td>
          <td><code>${ex.status}</code></td>
          <td>${ex.responseTime} ms</td>
          <td style="color:${ex.failed === 0 ? '#15803d' : '#b91c1c'};font-weight:600;">${
            ex.failed === 0 ? 'PASS' : `FAIL (${ex.failed})`
          }</td>
        </tr>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TaskFlow API Guard — Newman Execution Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px; }
    .container { max-width: 1080px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi-label { font-size: 12px; color: #64748b; }
    .kpi-val { font-size: 20px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; color: #475569; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>TaskFlow API Guard — Newman Execution Report</h1>
    <p class="meta">Executed: ${new Date().toISOString()} · Duration: ${result.durationMs} ms · Avg Response: ${result.avgResponseMs} ms</p>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Requests</div><div class="kpi-val">${result.totalItems}</div></div>
      <div class="kpi"><div class="kpi-label">Assertions</div><div class="kpi-val">${result.totalAssertions}</div></div>
      <div class="kpi"><div class="kpi-label">Passed</div><div class="kpi-val" style="color:#15803d">${result.passedAssertions}</div></div>
      <div class="kpi"><div class="kpi-label">Failed</div><div class="kpi-val" style="color:${result.failedAssertions > 0 ? '#b91c1c' : '#0f172a'}">${result.failedAssertions}</div></div>
      <div class="kpi"><div class="kpi-label">Pass Rate</div><div class="kpi-val">${passPct}%</div></div>
    </div>
    <table>
      <thead><tr><th>Request</th><th>Method</th><th>HTTP Status</th><th>Response Time</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function runTaskFlowNewmanSuite(
  baseUrl: string = `http://127.0.0.1:${process.env.PORT || 3000}`
): Promise<NewmanExecutionResult> {
  const collectionPath = path.resolve(
    process.cwd(),
    'qa/postman/taskflow-api-guard.postman_collection.json'
  );
  const reportsDir = path.resolve(process.cwd(), 'reports/newman');
  fs.mkdirSync(reportsDir, { recursive: true });

  const junitPath = path.join(reportsDir, 'junit-report.xml');
  const htmlPath = path.join(reportsDir, 'api-guard-report.html');
  const jsonPath = path.join(reportsDir, 'latest-summary.json');

  return new Promise((resolve, reject) => {
    newman.run(
      {
        collection: collectionPath,
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        reporters: ['junit'],
        reporter: {
          junit: { export: junitPath },
        },
        insecure: true,
        timeoutRequest: 15000,
      },
      (err, summary) => {
        if (err) {
          reject(err);
          return;
        }
        const stats = summary.run.stats;
        const timings = summary.run.timings;
        const totalItems = stats.requests?.total ?? 0;
        const totalAssertions = stats.assertions?.total ?? 0;
        const failedAssertions = stats.assertions?.failed ?? 0;
        const passedAssertions = Math.max(0, totalAssertions - failedAssertions);
        const durationMs = Math.max(
          0,
          Math.round((timings.completed ?? Date.now()) - (timings.started ?? Date.now()))
        );
        const avgResponseMs = Math.round(timings.responseAverage ?? 0);

        const failedEndpoints: AutomationFailedEndpoint[] = (summary.run.failures ?? []).map(
          (f) => ({
            name: f.source?.name ?? 'Unknown Request',
            assertion: f.error?.test ?? f.error?.name ?? 'Assertion',
            message: f.error?.message ?? 'Failed assertion',
          })
        );

        const execRows = (summary.run.executions ?? []).map((ex) => ({
          name: ex.item?.name ?? 'Request',
          method: ex.request?.method ?? 'GET',
          status: ex.response?.code ?? 0,
          responseTime: ex.response?.responseTime ?? 0,
          failed: (ex.assertions ?? []).filter((a) => Boolean(a.error)).length,
        }));

        const result: NewmanExecutionResult = {
          suite: 'newman',
          runLabel: 'TaskFlow API Guard (34 Requests)',
          totalItems,
          totalAssertions,
          passedAssertions,
          failedAssertions,
          durationMs,
          avgResponseMs,
          failedEndpoints,
          reportPath: '/api/qa/automation/newman-report',
        };

        fs.writeFileSync(htmlPath, buildHtmlReport(result, execRows));
        fs.writeFileSync(
          jsonPath,
          JSON.stringify({ ...result, executedAt: new Date().toISOString() }, null, 2)
        );
        resolve(result);
      }
    );
  });
}
