import { defineConfig } from '@playwright/test';

// 🎭 Browser tests (Playwright): unmaiyaana Chrome la click panni test
// Thani server (3003) + thani database (flowboard_e2e_test) + thani website (5176): unga data ah thodaadhu
const API_PORT = 3003;
const WEB_PORT = 5176;

export default defineConfig({
  testDir: './e2e',
  workers: 1, // ore database: ore neraththula oru test
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome', // computer la irukkura Chrome (browser download theva illa)
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node index.ts',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/api/hello`,
      env: { ...process.env, PORT: String(API_PORT), MONGODB_DB: 'flowboard_e2e_test', ADMIN_PASSWORD: 'e2e-admin-pass-123' },
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { ...process.env, API_URL: `http://localhost:${API_PORT}` },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
