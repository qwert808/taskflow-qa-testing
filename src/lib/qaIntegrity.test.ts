import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REQUIREMENTS,
  DEFAULT_TEST_CASES,
  LEGACY_V1_REQUIREMENTS,
} from './qaTemplates.ts';
import { buildTraceabilityMatrix } from './analytics.ts';
import type { RequirementRecord, TestCaseRecord } from './types.ts';

test('DEFAULT_REQUIREMENTS contains exactly 23 unique requirement codes', () => {
  assert.equal(DEFAULT_REQUIREMENTS.length, 23);
  const codes = DEFAULT_REQUIREMENTS.map((r) => r.reqCode.trim().toUpperCase());
  assert.equal(new Set(codes).size, 23);
});

test('LEGACY_V1_REQUIREMENTS contains exactly 6 unique v1 codes disjoint from DEFAULT_REQUIREMENTS', () => {
  assert.equal(LEGACY_V1_REQUIREMENTS.length, 6);
  const defaultCodes = new Set(DEFAULT_REQUIREMENTS.map((r) => r.reqCode.trim().toUpperCase()));
  const legacyCodes = LEGACY_V1_REQUIREMENTS.map((r) => r.reqCode.trim().toUpperCase());
  assert.equal(new Set(legacyCodes).size, 6);
  for (const code of legacyCodes) {
    assert.equal(defaultCodes.has(code), false, `Unexpected overlap for legacy code ${code}`);
  }
});

test('All 30 DEFAULT_TEST_CASES have unique IDs and resolve to a DEFAULT_REQUIREMENTS code', () => {
  assert.equal(DEFAULT_TEST_CASES.length, 30);
  const testIds = DEFAULT_TEST_CASES.map((tc) => tc.testId.trim().toUpperCase());
  assert.equal(new Set(testIds).size, 30);

  const reqCodes = new Set(DEFAULT_REQUIREMENTS.map((r) => r.reqCode.trim().toUpperCase()));
  for (const tc of DEFAULT_TEST_CASES) {
    const ref = tc.requirementId.trim().toUpperCase();
    assert.ok(
      reqCodes.has(ref),
      `Default test case ${tc.testId} references unknown requirement "${tc.requirementId}"`
    );
  }
});

test('buildTraceabilityMatrix separates linked and explicitly unlinked test cases cleanly', () => {
  const reqs: RequirementRecord[] = [
    {
      id: 1,
      userId: 100,
      reqCode: 'AUTH-01',
      title: 'User Registration',
      category: 'Functional',
      module: 'Authentication',
      userStory: '',
      acceptanceCriteria: 'Creates account',
      priority: 'Critical',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      userId: 100,
      reqCode: 'TASK-01',
      title: 'Task Creation',
      category: 'Functional',
      module: 'Task Management',
      userStory: '',
      acceptanceCriteria: 'Creates task',
      priority: 'High',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const tcs: TestCaseRecord[] = [
    {
      id: 10,
      userId: 100,
      testId: 'TC-001',
      requirementId: 'AUTH-01',
      requirementRefId: 1,
      module: 'Authentication',
      testType: 'Functional',
      technique: 'Positive Testing',
      scenario: 'Valid registration',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: '201',
      actualResult: '201',
      priority: 'Critical',
      status: 'Pass',
      tester: 'QA',
      defectId: '',
      executedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 11,
      userId: 100,
      testId: 'TC-002',
      requirementId: '',
      requirementRefId: null,
      module: 'Task Management',
      testType: 'Exploratory',
      technique: 'Error Guessing',
      scenario: 'Exploratory unlinked case',
      preconditions: '',
      testData: '',
      executionSteps: '',
      expectedResult: 'No crash',
      actualResult: '',
      priority: 'Low',
      status: 'Not Run',
      tester: '',
      defectId: '',
      executedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const rtm = buildTraceabilityMatrix(reqs, tcs);
  assert.equal(rtm.totalRequirements, 2);
  assert.equal(rtm.coveredRequirements, 1);
  assert.equal(rtm.coveragePercentage, 50);
  assert.equal(rtm.uncoveredRequirements.length, 1);
  assert.equal(rtm.uncoveredRequirements[0].reqCode, 'TASK-01');
  assert.equal(rtm.unlinkedTestCases.length, 1);
  assert.equal(rtm.unlinkedTestCases[0].testId, 'TC-002');
});
