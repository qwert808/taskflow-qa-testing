import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  isValidIsoDate,
  validateLoginInput,
  validatePasswordChangeInput,
  validateProfileInput,
  validateRegistrationInput,
  validateTaskInput,
  validateTaskStatus,
} from './validation';

test('email validation accepts valid emails and rejects malformed formats (AUTH-02)', () => {
  assert.equal(isValidEmail('tester@example.com'), true);
  assert.equal(isValidEmail('qa.lead+1@sub.domain.org'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(isValidEmail('missing@tld'), false);
  assert.equal(isValidEmail('spaces in@example.com'), false);
});

test('registration validation enforces name, email, and strong password (AUTH-01, AUTH-02)', () => {
  const valid = validateRegistrationInput({
    name: 'Alex Rivera',
    email: 'Alex.QA@Example.com',
    password: 'Password123',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data?.email, 'alex.qa@example.com');

  const invalid = validateRegistrationInput({
    name: 'A',
    email: 'bad@',
    password: 'short',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.password);
});

test('login validation checks non-empty password and email format', () => {
  const missing = validateLoginInput({ email: '', password: '' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.email);
  assert.ok(missing.errors.password);

  const ok = validateLoginInput({ email: 'qa@example.com', password: 'Secret1' });
  assert.equal(ok.valid, true);
});

test('task validation rejects empty title and invalid enums (TASK-02, TASK-06)', () => {
  const invalid = validateTaskInput(
    {
      title: '   ',
      priority: 'extreme',
      status: 'unknown',
      dueDate: '2026-02-30',
    },
    { todayIso: '2026-11-19' }
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.priority);
  assert.ok(invalid.errors.status);
  assert.ok(invalid.errors.dueDate);
});

test('task validation enforces past deadline policy on creation unless explicitly allowed (TC-014, TASK-07)', () => {
  const blockedPast = validateTaskInput(
    {
      title: 'Backdated QA test',
      priority: 'high',
      status: 'pending',
      dueDate: '2026-11-10',
    },
    { isUpdate: false, todayIso: '2026-11-19' }
  );
  assert.equal(blockedPast.valid, false);
  assert.ok(blockedPast.errors.dueDate);

  const allowedPast = validateTaskInput(
    {
      title: 'Backdated QA test',
      priority: 'high',
      status: 'pending',
      dueDate: '2026-11-10',
      allowPastDueDate: true,
    },
    { isUpdate: false, todayIso: '2026-11-19' }
  );
  assert.equal(allowedPast.valid, true);
  assert.equal(allowedPast.data?.dueDate, '2026-11-10');

  const future = validateTaskInput(
    {
      title: 'Future deadline task',
      priority: 'medium',
      status: 'pending',
      dueDate: '2026-12-15',
    },
    { isUpdate: false, todayIso: '2026-11-19' }
  );
  assert.equal(future.valid, true);
});

test('ISO date calendar verification rejects impossible calendar dates', () => {
  assert.equal(isValidIsoDate('2026-12-15'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('15-12-2026'), false);
});

test('profile and password change validation enforce matching confirmation and difference', () => {
  assert.equal(validateProfileInput({ name: 'Jordan', email: 'jordan@example.com' }).valid, true);

  const mismatch = validatePasswordChangeInput({
    currentPassword: 'OldPassword1',
    newPassword: 'NewPassword2',
    confirmPassword: 'DifferentPassword2',
  });
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.errors.confirmPassword);

  const same = validatePasswordChangeInput({
    currentPassword: 'SamePassword1',
    newPassword: 'SamePassword1',
    confirmPassword: 'SamePassword1',
  });
  assert.equal(same.valid, false);
  assert.ok(same.errors.newPassword);
});

test('task status validator accepts only pending or completed', () => {
  assert.equal(validateTaskStatus('completed').valid, true);
  assert.equal(validateTaskStatus('pending').valid, true);
  assert.equal(validateTaskStatus('archived').valid, false);
});
