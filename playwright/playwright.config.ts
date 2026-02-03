import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'screenshots',
      testMatch: 'screenshots.spec.ts',
    },
  ],
});
