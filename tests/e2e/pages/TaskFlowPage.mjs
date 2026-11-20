/**
 * Page Object Models for TaskFlow Playwright E2E Suite.
 * Uses accessible role/label locators and avoids arbitrary fixed waits.
 */

export class AuthPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
  }

  async register({ name, email, password }) {
    await this.page.getByRole('tab', { name: 'Create Account' }).click();
    await this.page.getByLabel('Full Name').fill(name);
    await this.page.getByLabel('Email Address').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Create Account' }).click();
  }

  async login({ email, password }) {
    await this.page.getByRole('tab', { name: 'Sign In' }).click();
    await this.page.getByLabel('Email Address').fill(email);
    await this.page.getByLabel('Password', { exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }
}

export class WorkspacePage {
  constructor(page) {
    this.page = page;
  }

  async navigateTo(sectionName) {
    const mobileMenuBtn = this.page.getByRole('button', { name: 'Open navigation menu' });
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
    }
    await this.page.getByRole('button', { name: sectionName, exact: true }).click();
  }

  async createTask({ title, description = '', priority = 'medium', dueDate = '' }) {
    await this.page.getByRole('button', { name: 'New Task' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Task Title').fill(title);
    if (description) {
      await dialog.getByLabel('Description').fill(description);
    }
    await dialog.getByLabel('Priority', { exact: true }).selectOption(priority);
    if (dueDate) {
      await dialog.getByLabel('Deadline', { exact: true }).fill(dueDate);
    }
    await dialog.getByRole('button', { name: 'Create Task' }).click();
  }

  async signOut() {
    const mobileMenuBtn = this.page.getByRole('button', { name: 'Open navigation menu' });
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
    }
    await this.page.getByRole('button', { name: 'Sign Out' }).click();
  }
}
