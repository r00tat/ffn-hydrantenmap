import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  envDir: resolve(__dirname, '..'),
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
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
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
    },
  },
});
