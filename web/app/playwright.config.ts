import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 * Tests mock all backend API calls via page.route() so no live services
 * are required.  The Next.js app is built and started by the webServer
 * block automatically.
 *
 * Run locally:
 *   npm run test:e2e          # headless chromium
 *   npm run test:e2e:ui       # interactive UI mode
 *
 * CI requires a production build:
 *   npm run build && npm run test:e2e
 */

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Dummy values — API calls are mocked in tests via page.route()
      NEXT_PUBLIC_API_URL: 'http://localhost:8004',
      NEXT_PUBLIC_RULES_API_URL: 'http://localhost:8003',
      NEXT_PUBLIC_WS_URL: 'ws://localhost:8005/ws/incidents',
    },
  },
})
