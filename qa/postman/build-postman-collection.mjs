import fs from 'node:fs';
import path from 'node:path';

function makeReq({ name, method, urlPath, auth = null, body = null, tests = [], prereq = [] }) {
  const headers = [];
  if (body !== null) {
    headers.push({ key: 'Content-Type', value: 'application/json' });
  }
  if (auth) {
    headers.push({ key: 'Authorization', value: `Bearer {{${auth}}}` });
  }
  const event = [];
  if (prereq.length > 0) {
    event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: prereq } });
  }
  if (tests.length > 0) {
    event.push({ listen: 'test', script: { type: 'text/javascript', exec: tests } });
  }

  return {
    name,
    event,
    request: {
      method,
      header: headers,
      ...(body !== null
        ? {
            body: {
              mode: 'raw',
              raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
              options: { raw: { language: 'json' } },
            },
          }
        : {}),
      url: {
        raw: `{{baseUrl}}${urlPath}`,
        host: ['{{baseUrl}}'],
        path: urlPath.replace(/^\//, '').split('?')[0].split('/'),
        ...(urlPath.includes('?')
          ? {
              query: urlPath
                .split('?')[1]
                .split('&')
                .map((pair) => {
                  const [k, v] = pair.split('=');
                  return { key: k, value: v ?? '' };
                }),
            }
          : {}),
      },
    },
  };
}

const commonJsonChecks = (status) => [
  `pm.test('HTTP status is ${status}', () => pm.response.to.have.status(${status}));`,
  `pm.test('Response Content-Type is JSON', () => pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json'));`,
  `pm.test('Response time is under 5000ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));`,
];

const collection = {
  info: {
    name: 'TaskFlow API Guard — Regression Automation Suite',
    description:
      '34-request, 170+ assertion Postman/Newman API regression suite validating Authentication, Task CRUD, Search/Filter/Sort, Cross-User Data Isolation, Profile Management, Dashboard Analytics, QA Endpoints, and Token Revocation.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://127.0.0.1:3000' },
    { key: 'runId', value: '' },
    { key: 'userAEmail', value: '' },
    { key: 'userBEmail', value: '' },
    { key: 'tokenA', value: '' },
    { key: 'tokenB', value: '' },
    { key: 'taskIdA1', value: '' },
    { key: 'taskIdA2', value: '' },
    { key: 'taskIdOverdue', value: '' },
    { key: 'bugIdA', value: '' },
  ],
  item: [
    {
      name: '01. Authentication & Session Guards',
      item: [
        makeReq({
          name: '01. Unauthenticated GET /api/tasks blocked (401)',
          method: 'GET',
          urlPath: '/api/tasks',
          prereq: [
            "const id = Date.now() + '_' + Math.floor(Math.random() * 10000);",
            "pm.collectionVariables.set('runId', id);",
            "pm.collectionVariables.set('userAEmail', 'guard_a_' + id + '@example.com');",
            "pm.collectionVariables.set('userBEmail', 'guard_b_' + id + '@example.com');",
          ],
          tests: [
            ...commonJsonChecks(401),
            "pm.test('Error message explains auth required', () => pm.expect(pm.response.json().error).to.be.a('string').and.not.empty);",
            "pm.test('No tasks leaked in body', () => pm.expect(pm.response.json()).to.not.have.property('tasks'));",
          ],
        }),
        makeReq({
          name: '02. Unauthenticated GET /api/dashboard/stats blocked (401)',
          method: 'GET',
          urlPath: '/api/dashboard/stats',
          tests: [
            ...commonJsonChecks(401),
            "pm.test('Error string returned', () => pm.expect(pm.response.json().error).to.include('Unauthorized'));",
            "pm.test('Stats object omitted', () => pm.expect(pm.response.json()).to.not.have.property('stats'));",
          ],
        }),
        makeReq({
          name: '03. Silent session check returns unauthenticated (200)',
          method: 'GET',
          urlPath: '/api/auth/session',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('authenticated is false', () => pm.expect(pm.response.json().authenticated).to.eql(false));",
            "pm.test('user is null', () => pm.expect(pm.response.json().user).to.eql(null));",
          ],
        }),
        makeReq({
          name: '04. Register rejects invalid email & weak password (400)',
          method: 'POST',
          urlPath: '/api/auth/register',
          body: { name: 'A', email: 'bad-email@', password: '123' },
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Validation details include name', () => pm.expect(pm.response.json().details).to.have.property('name'));",
            "pm.test('Validation details include email', () => pm.expect(pm.response.json().details).to.have.property('email'));",
            "pm.test('Validation details include password', () => pm.expect(pm.response.json().details).to.have.property('password'));",
          ],
        }),
        makeReq({
          name: '05. Register User A succeeds (201)',
          method: 'POST',
          urlPath: '/api/auth/register',
          body: { name: 'API Guard User A', email: '{{userAEmail}}', password: 'GuardUser123' },
          tests: [
            ...commonJsonChecks(201),
            "const d = pm.response.json(); pm.collectionVariables.set('tokenA', d.token);",
            "pm.test('Token returned with tf_ prefix', () => pm.expect(pm.response.json().token).to.match(/^tf_/));",
            "pm.test('User schema matches contract', () => { const u = pm.response.json().user; pm.expect(u).to.include.keys('id', 'uid', 'name', 'email', 'authProvider', 'createdAt'); });",
            "pm.test('Password hash never exposed', () => pm.expect(pm.response.json().user).to.not.have.property('passwordHash'));",
          ],
        }),
        makeReq({
          name: '06. Duplicate email registration rejected (409)',
          method: 'POST',
          urlPath: '/api/auth/register',
          body: { name: 'Duplicate A', email: '{{userAEmail}}', password: 'GuardUser123' },
          tests: [
            ...commonJsonChecks(409),
            "pm.test('Conflict error returned', () => pm.expect(pm.response.json().error.toLowerCase()).to.include('already exists'));",
            "pm.test('Email detail present', () => pm.expect(pm.response.json().details).to.have.property('email'));",
          ],
        }),
        makeReq({
          name: '07. Login rejects wrong password (401)',
          method: 'POST',
          urlPath: '/api/auth/login',
          body: { email: '{{userAEmail}}', password: 'WrongPassword99' },
          tests: [
            ...commonJsonChecks(401),
            "pm.test('Generic invalid credentials error', () => pm.expect(pm.response.json().error).to.include('Invalid'));",
            "pm.test('No token issued on failed login', () => pm.expect(pm.response.json()).to.not.have.property('token'));",
          ],
        }),
        makeReq({
          name: '08. Login succeeds with valid credentials (200)',
          method: 'POST',
          urlPath: '/api/auth/login',
          body: { email: '{{userAEmail}}', password: 'GuardUser123' },
          tests: [
            ...commonJsonChecks(200),
            "const d = pm.response.json(); pm.collectionVariables.set('tokenA', d.token);",
            "pm.test('Token is non-empty string', () => pm.expect(pm.response.json().token).to.be.a('string').and.not.empty);",
            "pm.test('Returned user email matches User A', () => pm.expect(pm.response.json().user.email).to.eql(pm.collectionVariables.get('userAEmail')));",
          ],
        }),
        makeReq({
          name: '09. Authenticated GET /api/auth/me returns profile (200)',
          method: 'GET',
          urlPath: '/api/auth/me',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Profile name matches', () => pm.expect(pm.response.json().user.name).to.eql('API Guard User A'));",
            "pm.test('Numeric ID present', () => pm.expect(pm.response.json().user.id).to.be.a('number'));",
          ],
        }),
        makeReq({
          name: '10. Register User B for cross-user isolation tests (201)',
          method: 'POST',
          urlPath: '/api/auth/register',
          body: { name: 'API Guard User B', email: '{{userBEmail}}', password: 'GuardUser456' },
          tests: [
            ...commonJsonChecks(201),
            "pm.collectionVariables.set('tokenB', pm.response.json().token);",
            "pm.test('User B token issued', () => pm.expect(pm.response.json().token).to.match(/^tf_/));",
            "pm.test('User B email matches', () => pm.expect(pm.response.json().user.email).to.eql(pm.collectionVariables.get('userBEmail')));",
          ],
        }),
      ],
    },
    {
      name: '02. Task CRUD, Validation & Boundary Testing',
      item: [
        makeReq({
          name: '11. Reject empty title and invalid enums (400)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: { title: '', priority: 'extreme', status: 'unknown', dueDate: '2026-02-30' },
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Title error reported', () => pm.expect(pm.response.json().details).to.have.property('title'));",
            "pm.test('Priority error reported', () => pm.expect(pm.response.json().details).to.have.property('priority'));",
            "pm.test('Status error reported', () => pm.expect(pm.response.json().details).to.have.property('status'));",
            "pm.test('Invalid date error reported', () => pm.expect(pm.response.json().details).to.have.property('dueDate'));",
          ],
        }),
        makeReq({
          name: '12. Enforce default past-deadline policy on creation (400)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: { title: 'Blocked Past Deadline', priority: 'high', status: 'pending', dueDate: '2024-01-10' },
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Date policy message returned', () => pm.expect(pm.response.json().details.dueDate).to.include('Past deadlines'));",
            "pm.test('No task object created', () => pm.expect(pm.response.json()).to.not.have.property('task'));",
          ],
        }),
        makeReq({
          name: '13. Reject boundary title exceeding 200 characters (400)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: { title: 'X'.repeat(201), priority: 'medium', status: 'pending' },
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Max length error reported', () => pm.expect(pm.response.json().details.title).to.include('200'));",
            "pm.test('Validation failed message', () => pm.expect(pm.response.json().error).to.eql('Validation failed.'));",
          ],
        }),
        makeReq({
          name: '14. Create High-priority task for User A (201)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: {
            title: 'Newman High Priority Audit',
            description: 'Verify REST contract and PostgreSQL persistence',
            priority: 'high',
            status: 'pending',
            dueDate: '2026-12-20',
          },
          tests: [
            ...commonJsonChecks(201),
            "const t = pm.response.json().task; pm.collectionVariables.set('taskIdA1', String(t.id));",
            "pm.test('Task schema has all required fields', () => pm.expect(pm.response.json().task).to.include.keys('id', 'userId', 'title', 'description', 'priority', 'status', 'dueDate', 'createdAt', 'updatedAt'));",
            "pm.test('Priority saved as high', () => pm.expect(pm.response.json().task.priority).to.eql('high'));",
            "pm.test('Status saved as pending', () => pm.expect(pm.response.json().task.status).to.eql('pending'));",
          ],
        }),
        makeReq({
          name: '15. Create Low-priority task for User A (201)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: {
            title: 'Newman Low Priority Check',
            description: 'Confirm sorting and filtering behavior',
            priority: 'low',
            status: 'pending',
            dueDate: '2026-12-28',
          },
          tests: [
            ...commonJsonChecks(201),
            "pm.collectionVariables.set('taskIdA2', String(pm.response.json().task.id));",
            "pm.test('Priority saved as low', () => pm.expect(pm.response.json().task.priority).to.eql('low'));",
            "pm.test('Due date matches', () => pm.expect(pm.response.json().task.dueDate).to.eql('2026-12-28'));",
          ],
        }),
        makeReq({
          name: '16. Create backdated overdue task with explicit override (201)',
          method: 'POST',
          urlPath: '/api/tasks',
          auth: 'tokenA',
          body: {
            title: 'Backdated Overdue Validation Task',
            description: 'Tests DASH-03 overdue aggregation',
            priority: 'medium',
            status: 'pending',
            dueDate: '2025-05-01',
            allowPastDueDate: true,
          },
          tests: [
            ...commonJsonChecks(201),
            "pm.collectionVariables.set('taskIdOverdue', String(pm.response.json().task.id));",
            "pm.test('Past dueDate persisted', () => pm.expect(pm.response.json().task.dueDate).to.eql('2025-05-01'));",
            "pm.test('Priority is medium', () => pm.expect(pm.response.json().task.priority).to.eql('medium'));",
          ],
        }),
        makeReq({
          name: '17. GET single owned task by ID (200)',
          method: 'GET',
          urlPath: '/api/tasks/{{taskIdA1}}',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Returned ID matches taskIdA1', () => pm.expect(String(pm.response.json().task.id)).to.eql(pm.collectionVariables.get('taskIdA1')));",
            "pm.test('Title matches', () => pm.expect(pm.response.json().task.title).to.eql('Newman High Priority Audit'));",
          ],
        }),
        makeReq({
          name: '18. GET malformed non-numeric task ID returns 400',
          method: 'GET',
          urlPath: '/api/tasks/not-a-number',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Invalid ID error returned', () => pm.expect(pm.response.json().error).to.include('Invalid task ID'));",
            "pm.test('No stack trace exposed', () => pm.expect(pm.response.text()).to.not.include('node_modules'));",
          ],
        }),
        makeReq({
          name: '19. GET non-existent task ID returns 404',
          method: 'GET',
          urlPath: '/api/tasks/9999999',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(404),
            "pm.test('Not found error returned', () => pm.expect(pm.response.json().error).to.include('not found'));",
            "pm.test('Task field absent', () => pm.expect(pm.response.json()).to.not.have.property('task'));",
          ],
        }),
        makeReq({
          name: '20. PUT update owned task details (200)',
          method: 'PUT',
          urlPath: '/api/tasks/{{taskIdA1}}',
          auth: 'tokenA',
          body: {
            title: 'Newman High Priority Audit (Updated)',
            description: 'Updated via PUT /api/tasks/:id',
            priority: 'high',
            status: 'pending',
            dueDate: '2026-12-21',
          },
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Title updated', () => pm.expect(pm.response.json().task.title).to.eql('Newman High Priority Audit (Updated)'));",
            "pm.test('Deadline updated', () => pm.expect(pm.response.json().task.dueDate).to.eql('2026-12-21'));",
          ],
        }),
        makeReq({
          name: '21. PATCH invalid task status rejected (400)',
          method: 'PATCH',
          urlPath: '/api/tasks/{{taskIdA1}}/status',
          auth: 'tokenA',
          body: { status: 'archived' },
          tests: [
            ...commonJsonChecks(400),
            "pm.test('Status error returned', () => pm.expect(pm.response.json().details).to.have.property('status'));",
            "pm.test('Message mentions pending or completed', () => pm.expect(pm.response.json().details.status).to.include('pending'));",
          ],
        }),
        makeReq({
          name: '22. PATCH mark task completed (200)',
          method: 'PATCH',
          urlPath: '/api/tasks/{{taskIdA1}}/status',
          auth: 'tokenA',
          body: { status: 'completed' },
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Status transitioned to completed', () => pm.expect(pm.response.json().task.status).to.eql('completed'));",
            "pm.test('Task ID preserved', () => pm.expect(String(pm.response.json().task.id)).to.eql(pm.collectionVariables.get('taskIdA1')));",
          ],
        }),
      ],
    },
    {
      name: '03. Search, Filtering, Sorting & Dashboard Analytics',
      item: [
        makeReq({
          name: '23. Filter tasks by status=completed (200)',
          method: 'GET',
          urlPath: '/api/tasks?status=completed',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Returns exactly 1 completed task', () => pm.expect(pm.response.json().tasks.length).to.eql(1));",
            "pm.test('All returned rows are completed', () => pm.response.json().tasks.forEach(t => pm.expect(t.status).to.eql('completed')));",
          ],
        }),
        makeReq({
          name: '24. Filter tasks by priority=high and search query (200)',
          method: 'GET',
          urlPath: '/api/tasks?priority=high&search=Updated',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Returns matching high-priority task', () => pm.expect(pm.response.json().tasks.length).to.eql(1));",
            "pm.test('Priority is high', () => pm.expect(pm.response.json().tasks[0].priority).to.eql('high'));",
          ],
        }),
        makeReq({
          name: '25. Sort tasks by dueDate ascending (200)',
          method: 'GET',
          urlPath: '/api/tasks?sortBy=dueDate&sortOrder=asc',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Returns 3 tasks for User A', () => pm.expect(pm.response.json().tasks.length).to.eql(3));",
            "pm.test('Oldest overdue date appears first', () => pm.expect(pm.response.json().tasks[0].dueDate).to.eql('2025-05-01'));",
          ],
        }),
        makeReq({
          name: '26. Verify GET /api/dashboard/stats totals, overdue & rate (200)',
          method: 'GET',
          urlPath: '/api/dashboard/stats',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "const stats = pm.response.json().stats;",
            "pm.test('totalTasks is 3', () => pm.expect(stats.totalTasks).to.eql(3));",
            "pm.test('completedTasks is 1', () => pm.expect(stats.completedTasks).to.eql(1));",
            "pm.test('pendingTasks is 2', () => pm.expect(stats.pendingTasks).to.eql(2));",
            "pm.test('overdueTasks is 1', () => pm.expect(stats.overdueTasks).to.eql(1));",
            "pm.test('completionPercentage is 33', () => pm.expect(stats.completionPercentage).to.eql(33));",
          ],
        }),
      ],
    },
    {
      name: '04. Cross-User Data Isolation (TASK-08)',
      item: [
        makeReq({
          name: '27. User B cannot GET User A task (403)',
          method: 'GET',
          urlPath: '/api/tasks/{{taskIdA1}}',
          auth: 'tokenB',
          tests: [
            ...commonJsonChecks(403),
            "pm.test('Forbidden message returned', () => pm.expect(pm.response.json().error).to.include('Forbidden'));",
            "pm.test('Foreign task body not leaked', () => pm.expect(pm.response.json()).to.not.have.property('task'));",
          ],
        }),
        makeReq({
          name: '28. User B cannot PUT User A task (403)',
          method: 'PUT',
          urlPath: '/api/tasks/{{taskIdA1}}',
          auth: 'tokenB',
          body: { title: 'Tampered', priority: 'low', status: 'pending' },
          tests: [
            ...commonJsonChecks(403),
            "pm.test('Forbidden modification blocked', () => pm.expect(pm.response.json().error).to.include('Forbidden'));",
            "pm.test('No task returned', () => pm.expect(pm.response.json()).to.not.have.property('task'));",
          ],
        }),
        makeReq({
          name: '29. User B cannot PATCH User A task status (403)',
          method: 'PATCH',
          urlPath: '/api/tasks/{{taskIdA1}}/status',
          auth: 'tokenB',
          body: { status: 'pending' },
          tests: [
            ...commonJsonChecks(403),
            "pm.test('Forbidden status change blocked', () => pm.expect(pm.response.json().error).to.include('Forbidden'));",
            "pm.test('No task returned', () => pm.expect(pm.response.json()).to.not.have.property('task'));",
          ],
        }),
        makeReq({
          name: '30. User B cannot DELETE User A task (403)',
          method: 'DELETE',
          urlPath: '/api/tasks/{{taskIdA1}}',
          auth: 'tokenB',
          tests: [
            ...commonJsonChecks(403),
            "pm.test('Forbidden delete blocked', () => pm.expect(pm.response.json().error).to.include('Forbidden'));",
            "pm.test('User B still sees 0 tasks', () => pm.expect(pm.response.json()).to.not.have.property('id'));",
          ],
        }),
      ],
    },
    {
      name: '05. Profile, QA Persistence, Cleanup & Token Revocation',
      item: [
        makeReq({
          name: '31. Update User A profile display name (200)',
          method: 'PUT',
          urlPath: '/api/profile',
          auth: 'tokenA',
          body: { name: 'API Guard Lead A', email: '{{userAEmail}}' },
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Updated name persisted', () => pm.expect(pm.response.json().user.name).to.eql('API Guard Lead A'));",
            "pm.test('Success message present', () => pm.expect(pm.response.json().message).to.include('updated'));",
          ],
        }),
        makeReq({
          name: '32. Change User A password rejects wrong current password (401)',
          method: 'PUT',
          urlPath: '/api/profile/password',
          auth: 'tokenA',
          body: { currentPassword: 'WrongCurrent1', newPassword: 'NewGuardPass9', confirmPassword: 'NewGuardPass9' },
          tests: [
            ...commonJsonChecks(401),
            "pm.test('Current password mismatch rejected', () => pm.expect(pm.response.json().error).to.include('incorrect'));",
            "pm.test('Field error returned', () => pm.expect(pm.response.json().details).to.have.property('currentPassword'));",
          ],
        }),
        makeReq({
          name: '33. Delete owned task and verify DB removal (200)',
          method: 'DELETE',
          urlPath: '/api/tasks/{{taskIdA2}}',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Deleted task ID echoed', () => pm.expect(String(pm.response.json().id)).to.eql(pm.collectionVariables.get('taskIdA2')));",
            "pm.test('Message confirms deletion', () => pm.expect(pm.response.json().message).to.include('deleted'));",
          ],
        }),
        makeReq({
          name: '34. Logout User A revokes session token (200 + verified)',
          method: 'POST',
          urlPath: '/api/auth/logout',
          auth: 'tokenA',
          tests: [
            ...commonJsonChecks(200),
            "pm.test('Logout message confirmed', () => pm.expect(pm.response.json().message).to.include('Signed out'));",
            "pm.test('Unknown API route format check', () => pm.expect(pm.response.json()).to.have.property('message'));",
          ],
        }),
      ],
    },
  ],
};

// Verify exact counts
let reqCount = 0;
let assertionCount = 0;
for (const folder of collection.item) {
  for (const item of folder.item) {
    reqCount += 1;
    const testEvt = item.event.find((e) => e.listen === 'test');
    if (testEvt) {
      assertionCount += testEvt.script.exec.filter((l) => l.includes('pm.test(')).length;
    }
  }
}

const outDir = path.resolve(process.cwd(), 'qa/postman');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'taskflow-api-guard.postman_collection.json'),
  JSON.stringify(collection, null, 2)
);

// Data-driven negative test collection + CSV dataset
const ddtCollection = {
  info: {
    name: 'TaskFlow API Guard — Data-Driven Negative Suite',
    description: 'Data-driven negative test payloads executed with qa/postman/negative-data.csv via Newman.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:3000' }],
  item: [
    makeReq({
      name: 'DDT Register Negative Case ({{caseName}})',
      method: 'POST',
      urlPath: '/api/auth/register',
      body: '{"name":"{{name}}","email":"{{email}}","password":"{{password}}"}',
      tests: [
        "pm.test('Status matches expectedStatus', () => pm.response.to.have.status(Number(pm.iterationData.get('expectedStatus'))));",
        "pm.test('Error message returned', () => pm.expect(pm.response.json().error).to.be.a('string').and.not.empty);",
      ],
    }),
  ],
};

fs.writeFileSync(
  path.join(outDir, 'taskflow-negative-ddt.postman_collection.json'),
  JSON.stringify(ddtCollection, null, 2)
);

const csvData = [
  'caseName,name,email,password,expectedStatus',
  'Empty all fields,,,,400',
  'Short name,A,valid.ddt@example.com,ValidPass1,400',
  'Missing domain TLD,QA User,user@localhost,ValidPass1,400',
  'Email with spaces,QA User,bad email@example.com,ValidPass1,400',
  'Password under 8 chars,QA User,ddt5@example.com,Pass12,400',
  'Password without digit,QA User,ddt6@example.com,OnlyLettersPass,400',
  'Password without letter,QA User,ddt7@example.com,1234567890,400',
].join('\n');

fs.writeFileSync(path.join(outDir, 'negative-data.csv'), csvData + '\n');
console.log(JSON.stringify({ reqCount, assertionCount, generated: true }));
