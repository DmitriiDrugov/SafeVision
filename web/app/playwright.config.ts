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
    // `npm run start` emits a warning under `output: 'standalone'` but still
    // serves the page-router app correctly for our E2E needs. Switching to
    // `node .next/standalone/server.js` would require copying static assets,
    // which `npm run build` doesn't do automatically.
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Demo mode — tests exercise the frontend-only showcase path.
      NEXT_PUBLIC_DEMO_MODE: 'true',
      NEXT_PUBLIC_API_URL: '',
    },
  },
})
