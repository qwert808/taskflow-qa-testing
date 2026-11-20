import { test, expect } from '@playwright/test';
import { AuthPage, WorkspacePage } from './pages/TaskFlowPage.mjs';

function uniqueEmail(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
}

test.describe('Authentication Flows', () => {
  test('validates invalid registration, prevents duplicate email, and supports login/logout', async ({ page }) => {
    const auth = new AuthPage(page);
    const workspace = new WorkspacePage(page);
    const email = uniqueEmail('pw_auth');

    await auth.goto();
    await auth.register({ name: 'A', email: 'not-an-email', password: '123' });
    await expect(page.getByText('Enter a valid email address')).toBeVisible();

    await auth.register({ name: 'Playwright QA', email, password: 'Playwright2026' });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await workspace.signOut();
    await expect(page.getByRole('heading', { name: 'Sign in to TaskFlow' })).toBeVisible();

    // Duplicate email rejected
    await auth.register({ name: 'Duplicate', email, password: 'Playwright2026' });
    await expect(page.getByText(/already exists/i)).toBeVisible();

    // Invalid login rejected
    await auth.login({ email, password: 'WrongPassword1' });
    await expect(page.getByText(/Invalid email address or password/i)).toBeVisible();

    // Valid login succeeds
    await auth.login({ email, password: 'Playwright2026' });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('unauthenticated API requests are denied with 401', async ({ request }) => {
    const res = await request.get('/api/tasks');
    expect(res.status()).toBe(401);
  });
});

test.describe('Task Management, Search, Filtering & Sorting', () => {
  test('creates, edits, toggles status, filters, searches, and deletes tasks', async ({ page }) => {
    const auth = new AuthPage(page);
    const workspace = new WorkspacePage(page);
    const email = uniqueEmail('pw_tasks');

    await auth.goto();
    await auth.register({ name: 'Task Tester', email, password: 'Playwright2026' });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await workspace.navigateTo('Tasks');
    await workspace.createTask({
      title: 'Playwright High Priority Task',
      description: 'Verify CRUD lifecycle',
      priority: 'high',
      dueDate: '2026-12-20',
    });
    await expect(page.getByText('Playwright High Priority Task')).toBeVisible();

    // Complete task
    await page.getByRole('button', { name: 'Mark "Playwright High Priority Task" as completed' }).click();
    await expect(page.getByRole('button', { name: 'Mark "Playwright High Priority Task" as pending' })).toBeVisible();

    // Filter by priority & search empty state
    await page.getByLabel('Filter by priority').selectOption('high');
    await expect(page.getByText('Playwright High Priority Task')).toBeVisible();

    await page.getByLabel('Search tasks by title').fill('nonexistent-xyz');
    await expect(page.getByText('No matching tasks found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters' }).click();

    // Edit task
    await page.getByRole('button', { name: 'Edit "Playwright High Priority Task"' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Task Title').fill('Playwright Edited Task');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Playwright Edited Task')).toBeVisible();

    // Delete task
    await page.getByRole('button', { name: 'Delete "Playwright Edited Task"' }).click();
    await expect(page.getByText('Your task list is empty')).toBeVisible();
  });
});

test.describe('Authorisation & Cross-User Isolation', () => {
  test('User B cannot view, edit, or delete User A tasks via API', async ({ request }) => {
    const regA = await request.post('/api/auth/register', {
      data: { name: 'Iso A', email: uniqueEmail('iso_a'), password: 'Playwright2026' },
    });
    const { token: tokenA } = await regA.json();

    const taskRes = await request.post('/api/tasks', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: { title: 'Private Task A', priority: 'high', status: 'pending', dueDate: '2026-12-25' },
    });
    const { task } = await taskRes.json();

    const regB = await request.post('/api/auth/register', {
      data: { name: 'Iso B', email: uniqueEmail('iso_b'), password: 'Playwright2026' },
    });
    const { token: tokenB } = await regB.json();

    const getAttempt = await request.get(`/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(getAttempt.status()).toBe(403);

    const delAttempt = await request.delete(`/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(delAttempt.status()).toBe(403);
  });
});

test.describe('Responsive UI & Accessibility', () => {
  test('renders without horizontal overflow on desktop and mobile viewports', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.register({ name: 'UI Tester', email: uniqueEmail('pw_ui'), password: 'Playwright2026' });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});
