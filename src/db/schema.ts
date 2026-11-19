import { relations } from 'drizzle-orm';
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  authProvider: varchar('auth_provider', { length: 32 }).notNull().default('local'),
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

export const testCases = pgTable('test_cases', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  testId: varchar('test_id', { length: 24 }).notNull(),
  requirementId: varchar('requirement_id', { length: 24 }).notNull(),
  module: varchar('module', { length: 64 }).notNull(),
  testType: varchar('test_type', { length: 32 }).notNull().default('Manual'),
  scenario: varchar('scenario', { length: 240 }).notNull(),
  preconditions: text('preconditions').notNull().default(''),
  testData: text('test_data').notNull().default(''),
  executionSteps: text('execution_steps').notNull().default(''),
  expectedResult: text('expected_result').notNull(),
  actualResult: text('actual_result').notNull().default(''),
  priority: varchar('priority', { length: 16 }).notNull().default('High'),
  status: varchar('status', { length: 24 }).notNull().default('Not Executed'),
  defectId: varchar('defect_id', { length: 32 }).notNull().default(''),
  executedAt: timestamp('executed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bugReports = pgTable('bug_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  bugCode: varchar('bug_code', { length: 24 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  module: varchar('module', { length: 64 }).notNull(),
  environment: varchar('environment', { length: 120 }).notNull().default('Chrome, Desktop'),
  precondition: text('precondition').notNull().default(''),
  stepsToReproduce: text('steps_to_reproduce').notNull(),
  expectedResult: text('expected_result').notNull(),
  actualResult: text('actual_result').notNull(),
  severity: varchar('severity', { length: 16 }).notNull().default('High'),
  priority: varchar('priority', { length: 16 }).notNull().default('High'),
  status: varchar('status', { length: 24 }).notNull().default('Open'),
  evidence: text('evidence').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  testCases: many(testCases),
  bugReports: many(bugReports),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
}));

export const testCasesRelations = relations(testCases, ({ one }) => ({
  user: one(users, {
    fields: [testCases.userId],
    references: [users.id],
  }),
}));

export const bugReportsRelations = relations(bugReports, ({ one }) => ({
  user: one(users, {
    fields: [bugReports.userId],
    references: [users.id],
  }),
}));
