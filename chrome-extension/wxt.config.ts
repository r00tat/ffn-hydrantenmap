import { defineConfig } from 'wxt';
import { resolve } from 'path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  manifestVersion: 3,
  browser: 'chrome',

  manifest: {
    name: 'Einsatzkarte',
    description:
      'Einsatzkarte der FF Neusiedl am See \u2014 Einsatzübersicht und Tagebuch',
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },

  vite: () => ({
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  }),
});
