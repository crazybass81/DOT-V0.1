/**
 * 간단한 Vercel 테스트용 Playwright 설정
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/vercel-simple.test.js',

  fullyParallel: true,
  retries: 0,
  workers: 1,

  reporter: [['list']],

  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    navigationTimeout: 45000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  outputDir: 'test-results/simple-artifacts',
  timeout: 60000,
  expect: { timeout: 10000 }
});