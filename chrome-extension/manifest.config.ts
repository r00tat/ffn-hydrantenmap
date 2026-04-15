import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import { resolve } from 'path';

export default defineManifest(async (env) => {
  const viteEnv = loadEnv(env.mode, resolve(__dirname, '..'), [
    'NEXT_PUBLIC_',
    'CHROME_EXTENSION_PUBLIC_KEY',
  ]);

  const clientId = viteEnv.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID is not set in .env.local',
    );
  }

  // Base64-kodierter DER Public Key, abgeleitet aus dem privaten Schluessel
  // in chrome-extension/dist.pem (*.pem ist .gitignored). Fixiert die
  // Extension-ID, wenn gesetzt. Beim Upload in den Chrome Web Store kann der
  // Key weggelassen werden.
  const extensionPublicKey = viteEnv.CHROME_EXTENSION_PUBLIC_KEY;

  return {
    manifest_version: 3,
    name: 'Einsatzkarte',
    description:
      'Einsatzkarte der FF Neusiedl am See \u2014 Einsatz\u00fcbersicht und Tagebuch',
    version: '0.1.0',
    ...(extensionPublicKey ? { key: extensionPublicKey } : {}),
    permissions: ['identity', 'storage'] as const,
    host_permissions: [
      'https://*.firebaseio.com/*',
      'https://*.googleapis.com/*',
      'https://*.firebaseapp.com/*',
    ],
    action: {
      default_popup: 'src/popup/index.html',
      default_icon: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    },
    background: {
      service_worker: 'src/background/service-worker.ts',
      type: 'module' as const,
    },
    content_scripts: [
      {
        matches: ['https://sybos.lfv-bgld.at/*'],
        js: ['src/content/sybos.ts'],
        css: [],
      },
    ],
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    oauth2: {
      client_id: clientId,
      scopes: ['openid', 'email', 'profile'],
    },
  };
});
