// Playwright E2E Configuration for TaskFlow (run with `npx playwright test` locally or in GitLab CI)
export default {
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright/html', open: 'never' }],
    ['junit', { outputFile: 'reports/playwright/junit.xml' }],
  ],
  use: {
    baseURL: process.env.TASKFLOW_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
};
