import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/playwright/**',
      '**/.skills/**',
      // chrome-extension has its own vitest config (jsdom environment) and test runner.
      '**/chrome-extension/**',
    ],
  },
});
