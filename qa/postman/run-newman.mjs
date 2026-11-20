import path from 'node:path';
import fs from 'node:fs';
import newman from 'newman';

const baseUrl = process.env.TASKFLOW_BASE_URL || 'http://127.0.0.1:3000';
const mode = process.argv.includes('--ddt') ? 'ddt' : 'regression';
const reportsDir = path.resolve(process.cwd(), 'reports/newman');
fs.mkdirSync(reportsDir, { recursive: true });

const options =
  mode === 'ddt'
    ? {
        collection: path.resolve(process.cwd(), 'qa/postman/taskflow-negative-ddt.postman_collection.json'),
        iterationData: path.resolve(process.cwd(), 'qa/postman/negative-data.csv'),
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        reporters: ['cli', 'junit'],
        reporter: { junit: { export: path.join(reportsDir, 'junit-ddt-report.xml') } },
      }
    : {
        collection: path.resolve(process.cwd(), 'qa/postman/taskflow-api-guard.postman_collection.json'),
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        reporters: ['cli', 'junit'],
        reporter: { junit: { export: path.join(reportsDir, 'junit-report.xml') } },
      };

newman.run(options, (err, summary) => {
  if (err) {
    console.error('Newman execution error:', err);
    process.exit(1);
  }
  const failed = summary.run.stats.assertions.failed;
  const total = summary.run.stats.assertions.total;
  const reqs = summary.run.stats.requests.total;
  console.log(`\nNewman ${mode} summary: ${reqs} requests, ${total - failed}/${total} assertions passed.`);
  if (failed > 0) {
    process.exit(1);
  }
});
