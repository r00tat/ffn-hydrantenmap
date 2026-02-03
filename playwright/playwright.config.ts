import { defineConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Load only DOCS_TEST_* variables from .env.local for Playwright
const envLocalPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    // Only load DOCS_TEST_* variables
    const match = line.match(/^(DOCS_TEST_[^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      // Remove surrounding quotes if present
      let value = match[2];
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  });
}

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
