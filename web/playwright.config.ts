import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:18765',
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'cd .. && mkdir -p tmp && rm -f tmp/playwright.db && ASKUSER_ADDR=127.0.0.1:18765 ASKUSER_DB=tmp/playwright.db go run ./cmd/popupd',
    url: 'http://127.0.0.1:18765/api/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
