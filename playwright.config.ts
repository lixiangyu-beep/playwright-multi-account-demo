import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3210);
export const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The suite is deterministic (in-memory app, unique data per test), so no retries:
  // a failure is a real finding, not flakiness.
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    // Logs in every seeded account once and saves its storageState under .auth/
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /specs\/.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'node app/server.js',
    url: `${BASE_URL}/health`,
    env: { PORT: String(PORT), FIX_PLANTED_BUGS: process.env.FIX_PLANTED_BUGS ?? '' },
    // CI starts the app in its own step; locally an already-running `npm start` is reused too.
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
