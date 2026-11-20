import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  authProvider: varchar('auth_provider', { length: 32 }).notNull().default('local'),
  qaRequirementsInitialized: boolean('qa_requirements_initialized').notNull().default(false),
  qaTestCasesInitialized: boolean('qa_test_cases_initialized').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull().default(''),
  priority: varchar('priority', { length: 16 }).notNull().default('medium'),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  dueDate: date('due_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const requirements = pgTable(
  'requirements',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reqCode: varchar('req_code', { length: 32 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    category: varchar('category', { length: 32 }).notNull().default('Functional'),
    module: varchar('module', { length: 64 }).notNull(),
    userStory: text('user_story').notNull().default(''),
    acceptanceCriteria: text('acceptance_criteria').notNull(),
    priority: varchar('priority', { length: 16 }).notNull().default('High'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('requirements_user_id_id_uniq').on(table.userId, table.id),
    unique('requirements_user_req_code_uniq').on(table.userId, table.reqCode),
  ]
);

export const testCases = pgTable(
  'test_cases',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    testId: varchar('test_id', { length: 24 }).notNull(),
    requirementId: varchar('requirement_id', { length: 32 }).notNull().default(''),
    requirementRefId: integer('requirement_ref_id'),
    module: varchar('module', { length: 64 }).notNull(),
    testType: varchar('test_type', { length: 32 }).notNull().default('Manual'),
    technique: varchar('technique', { length: 48 }).notNull().default('Positive Testing'),
    scenario: varchar('scenario', { length: 240 }).notNull(),
    preconditions: text('preconditions').notNull().default(''),
    testData: text('test_data').notNull().default(''),
    executionSteps: text('execution_steps').notNull().default(''),
    expectedResult: text('expected_result').notNull(),
    actualResult: text('actual_result').notNull().default(''),
    priority: varchar('priority', { length: 16 }).notNull().default('High'),
    status: varchar('status', { length: 24 }).notNull().default('Not Run'),
    tester: varchar('tester', { length: 120 }).notNull().default(''),
    defectId: varchar('defect_id', { length: 32 }).notNull().default(''),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('test_cases_user_id_id_uniq').on(table.userId, table.id),
    unique('test_cases_user_test_id_uniq').on(table.userId, table.testId),
    foreignKey({
      name: 'test_cases_user_requirement_fk',
      columns: [table.userId, table.requirementRefId],
      foreignColumns: [requirements.userId, requirements.id],
    }).onDelete('restrict'),
  ]
);

export const testCycles = pgTable('test_cycles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  scope: varchar('scope', { length: 48 }).notNull().default('Regression'),
  executionOrigin: varchar('execution_origin', { length: 32 }).notNull().default('Internal QA'),
  environment: varchar('environment', { length: 120 }).notNull().default('Localhost / Staging'),
  status: varchar('status', { length: 24 }).notNull().default('Active'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const testExecutions = pgTable(
  'test_executions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    testCaseId: integer('test_case_id'),
    testCaseCodeSnapshot: varchar('test_case_code_snapshot', { length: 24 }).notNull().default(''),
    testCaseScenarioSnapshot: varchar('test_case_scenario_snapshot', { length: 240 })
      .notNull()
      .default(''),
    cycleId: integer('cycle_id').references(() => testCycles.id, { onDelete: 'set null' }),
    testType: varchar('test_type', { length: 32 }).notNull().default('Functional'),
    executionOrigin: varchar('execution_origin', { length: 32 }).notNull().default('Internal QA'),
    environment: varchar('environment', { length: 120 }).notNull().default('Localhost / Staging'),
    browserDevice: varchar('browser_device', { length: 120 }).notNull().default('Chrome · Desktop'),
    tester: varchar('tester', { length: 120 }).notNull(),
    testData: text('test_data').notNull().default(''),
    expectedResult: text('expected_result').notNull(),
    actualResult: text('actual_result').notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    evidence: text('evidence').notNull().default(''),
    defectId: varchar('defect_id', { length: 32 }).notNull().default(''),
    executedAt: timestamp('executed_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'test_executions_user_test_case_fk',
      columns: [table.userId, table.testCaseId],
      foreignColumns: [testCases.userId, testCases.id],
    }).onDelete('restrict'),
  ]
);

export const bugReports = pgTable(
  'bug_reports',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    bugCode: varchar('bug_code', { length: 24 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull().default(''),
    module: varchar('module', { length: 64 }).notNull(),
    environment: varchar('environment', { length: 120 }).notNull().default('Chrome, Desktop'),
    browserDevice: varchar('browser_device', { length: 120 }).notNull().default('Chrome · Desktop'),
    precondition: text('precondition').notNull().default(''),
    stepsToReproduce: text('steps_to_reproduce').notNull(),
    expectedResult: text('expected_result').notNull(),
    actualResult: text('actual_result').notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('High'),
    priority: varchar('priority', { length: 16 }).notNull().default('High'),
    status: varchar('status', { length: 24 }).notNull().default('Open'),
    assignedDeveloper: varchar('assigned_developer', { length: 120 })
      .notNull()
      .default('Unassigned'),
    reporter: varchar('reporter', { length: 120 }).notNull().default(''),
    linkedRequirementId: varchar('linked_requirement_id', { length: 32 }).notNull().default(''),
    linkedRequirementRefId: integer('linked_requirement_ref_id'),
    linkedTestCaseId: varchar('linked_test_case_id', { length: 32 }).notNull().default(''),
    linkedTestCaseRefId: integer('linked_test_case_ref_id'),
    gitlabIssueId: varchar('gitlab_issue_id', { length: 48 }).notNull().default(''),
    gitlabIssueUrl: text('gitlab_issue_url').notNull().default(''),
    evidence: text('evidence').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('bug_reports_user_id_id_uniq').on(table.userId, table.id),
    unique('bug_reports_user_bug_code_uniq').on(table.userId, table.bugCode),
    foreignKey({
      name: 'bug_reports_user_requirement_fk',
      columns: [table.userId, table.linkedRequirementRefId],
      foreignColumns: [requirements.userId, requirements.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'bug_reports_user_test_case_fk',
      columns: [table.userId, table.linkedTestCaseRefId],
      foreignColumns: [testCases.userId, testCases.id],
    }).onDelete('restrict'),
  ]
);

export const defectHistory = pgTable(
  'defect_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    bugId: integer('bug_id').notNull(),
    actor: varchar('actor', { length: 120 }).notNull(),
    action: varchar('action', { length: 48 }).notNull(),
    fromStatus: varchar('from_status', { length: 24 }).notNull().default(''),
    toStatus: varchar('to_status', { length: 24 }).notNull().default(''),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'defect_history_user_bug_fk',
      columns: [table.userId, table.bugId],
      foreignColumns: [bugReports.userId, bugReports.id],
    }).onDelete('cascade'),
  ]
);

export const automationRuns = pgTable('automation_runs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  suite: varchar('suite', { length: 32 }).notNull(),
  runLabel: varchar('run_label', { length: 160 }).notNull(),
  totalItems: integer('total_items').notNull().default(0),
  totalAssertions: integer('total_assertions').notNull().default(0),
  passedAssertions: integer('passed_assertions').notNull().default(0),
  failedAssertions: integer('failed_assertions').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  avgResponseMs: integer('avg_response_ms').notNull().default(0),
  failedEndpointsJson: text('failed_endpoints_json').notNull().default('[]'),
  reportPath: varchar('report_path', { length: 255 }).notNull().default(''),
  executedAt: timestamp('executed_at').defaultNow().notNull(),
});

export const qaAuditLogs = pgTable('qa_audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  entityType: varchar('entity_type', { length: 32 }).notNull(),
  entityId: integer('entity_id').notNull(),
  entityCode: varchar('entity_code', { length: 32 }).notNull().default(''),
  action: varchar('action', { length: 48 }).notNull(),
  actor: varchar('actor', { length: 120 }).notNull(),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  requirements: many(requirements),
  testCases: many(testCases),
  testCycles: many(testCycles),
  testExecutions: many(testExecutions),
  bugReports: many(bugReports),
  automationRuns: many(automationRuns),
  qaAuditLogs: many(qaAuditLogs),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
}));

export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  user: one(users, { fields: [requirements.userId], references: [users.id] }),
  testCases: many(testCases),
  bugReports: many(bugReports),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  user: one(users, { fields: [testCases.userId], references: [users.id] }),
  requirement: one(requirements, {
    fields: [testCases.requirementRefId],
    references: [requirements.id],
  }),
  executions: many(testExecutions),
  bugReports: many(bugReports),
}));

export const testCyclesRelations = relations(testCycles, ({ one, many }) => ({
  user: one(users, { fields: [testCycles.userId], references: [users.id] }),
  executions: many(testExecutions),
}));

export const testExecutionsRelations = relations(testExecutions, ({ one }) => ({
  user: one(users, { fields: [testExecutions.userId], references: [users.id] }),
  testCase: one(testCases, { fields: [testExecutions.testCaseId], references: [testCases.id] }),
  cycle: one(testCycles, { fields: [testExecutions.cycleId], references: [testCycles.id] }),
}));

export const bugReportsRelations = relations(bugReports, ({ one, many }) => ({
  user: one(users, { fields: [bugReports.userId], references: [users.id] }),
  linkedRequirement: one(requirements, {
    fields: [bugReports.linkedRequirementRefId],
    references: [requirements.id],
  }),
  linkedTestCase: one(testCases, {
    fields: [bugReports.linkedTestCaseRefId],
    references: [testCases.id],
  }),
  history: many(defectHistory),
}));

export const defectHistoryRelations = relations(defectHistory, ({ one }) => ({
  user: one(users, { fields: [defectHistory.userId], references: [users.id] }),
  bug: one(bugReports, { fields: [defectHistory.bugId], references: [bugReports.id] }),
}));

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  user: one(users, { fields: [automationRuns.userId], references: [users.id] }),
}));

export const qaAuditLogsRelations = relations(qaAuditLogs, ({ one }) => ({
  user: one(users, { fields: [qaAuditLogs.userId], references: [users.id] }),
}));
