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
    server: {
      deps: {
        // @mui/material@9.1+ ships Transition.mjs with a directory import
        // (`react-transition-group/TransitionGroupContext`) that Node's native
        // ESM loader cannot resolve when the module is externalized. Inlining
        // lets Vite transform and resolve it instead.
        inline: ['@mui/material'],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/playwright/**',
      '**/.skills/**',
      // chrome-extension has its own vitest config (jsdom environment) and test runner.
      '**/chrome-extension/**',
      // worktrees are separate checkouts — their tests run from their own tree.
      '**/.worktrees/**',
    ],
  },
});
