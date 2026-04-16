import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import { resolve } from 'path';

const ROOT_DIR = resolve(__dirname, '..');
const ENV_PREFIXES = ['VITE_', 'NEXT_PUBLIC_'];

// Production builds (npm run build:prod, EXT_ENV_LOCAL=1) layer
// chrome-extension/.env.production.local on top of the shared project-root
// .env.local. Users only need to set vars that differ from dev (typically just
// NEXT_PUBLIC_FIRESTORE_DB).
function envOverlayPlugin(): Plugin {
  return {
    name: 'ext-env-overlay',
    config(_config, { mode }) {
      const overlay = loadEnv(mode, __dirname, ENV_PREFIXES);
      const define: Record<string, string> = {};
      for (const [key, value] of Object.entries(overlay)) {
        define[`import.meta.env.${key}`] = JSON.stringify(value);
      }
      return { define };
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    ...(process.env.EXT_ENV_LOCAL ? [envOverlayPlugin()] : []),
  ],
  envDir: ROOT_DIR,
  envPrefix: ENV_PREFIXES,
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    cors: {
      origin: '*',
    },
    strictPort: true,
    port: 5173,
    hmr: {
      port: 5173,
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
    },
  },
});
