import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import { resolve } from 'path';
import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from 'node:child_process';

// Leitet die Extension-Version aus dem neuesten Git-Tag ab (vX.Y.Z -> X.Y.Z)
// und haengt bei Dev-Builds die Anzahl der Commits seit dem Tag als vierte
// Komponente an. Beispiele:
//   - HEAD == Tag v2.44.0                  -> "2.44.0"
//   - HEAD == Tag v2.44.0 + 3 Commits      -> "2.44.0.3"
//   - Tag hat bereits 4 Komponenten        -> Commit-Count wird ignoriert
//   - kein git / keine Tags                -> "0.0.0"
//
// Chrome akzeptiert 1-4 punktgetrennte Ganzzahlen (0-65535) und zieht bei
// Updates einen hoeheren Versionswert vor, daher eignet sich die monoton
// wachsende Commit-Zahl, um lokale Zwischenstaende voneinander abzugrenzen.
// Uncommittete Aenderungen im Working Tree lassen sich in einer Chrome-Version
// nicht kodieren.
//
// Im CI ueberschreibt der "Patch manifest version" Step die Version nach dem
// vite-build ohnehin mit dem expliziten Tag/Input - diese Funktion ist also
// vor allem fuer lokale Builds (`npm run build:prod`) relevant.
function resolveVersionFromGit(): string {
  const gitOptions: ExecFileSyncOptionsWithStringEncoding = {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  };
  try {
    const tag = execFileSync(
      'git',
      ['describe', '--tags', '--abbrev=0'],
      gitOptions,
    ).trim();
    const base = tag.replace(/^v/, '');
    if (!/^\d+(\.\d+){0,3}$/.test(base)) {
      console.warn(
        `[manifest] Tag "${tag}" ist keine gueltige Chrome-Version, verwende 0.0.0`,
      );
      return '0.0.0';
    }

    const ahead = Number(
      execFileSync(
        'git',
        ['rev-list', '--count', `${tag}..HEAD`],
        gitOptions,
      ).trim(),
    );
    if (!Number.isFinite(ahead) || ahead <= 0) {
      return base;
    }
    if (base.split('.').length >= 4) {
      console.warn(
        `[manifest] Tag "${tag}" hat bereits 4 Komponenten, Commit-Count (${ahead}) wird ignoriert`,
      );
      return base;
    }
    return `${base}.${ahead}`;
  } catch {
    // git nicht verfuegbar, kein Repo, oder keine Tags
  }
  return '0.0.0';
}

export default defineManifest(async (env) => {
  // Always loads the shared project-root .env* as base. For production builds
  // triggered via `npm run build:prod` (EXT_ENV_LOCAL=1), the
  // chrome-extension-local .env* is layered on top, so only overriding vars
  // (e.g. NEXT_PUBLIC_FIRESTORE_DB) need to be set there.
  const envPrefixes = ['NEXT_PUBLIC_', 'CHROME_EXTENSION_PUBLIC_KEY'];
  const rootEnv = loadEnv(env.mode, resolve(__dirname, '..'), envPrefixes);
  const overlayEnv = process.env.EXT_ENV_LOCAL
    ? loadEnv(env.mode, resolve(__dirname), envPrefixes)
    : {};
  const viteEnv = { ...rootEnv, ...overlayEnv };

  const clientId = viteEnv.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID is not set in .env.local',
    );
  }

  // Base64-kodierter DER Public Key, abgeleitet aus dem privaten Schluessel
  // in chrome-extension/dist.pem (*.pem ist .gitignored).
  //
  // Das `key`-Feld fixiert die Extension-ID nur bei Unpacked-Loads im
  // Dev-Modus. Bei Production-Builds (EXT_ENV_LOCAL=1) wird es weggelassen:
  //   - Der Chrome Web Store lehnt ZIP-Uploads mit `key` ab
  //     ("Das Feld 'key' ist im Manifest nicht zulaessig").
  //   - Die CRX wird mit dist.pem signiert; Chrome leitet die Extension-ID
  //     automatisch aus dem in der CRX eingebetteten Public Key ab,
  //     sodass die ID auch ohne `key` im Manifest stabil bleibt.
  const extensionPublicKey = process.env.EXT_ENV_LOCAL
    ? undefined
    : viteEnv.CHROME_EXTENSION_PUBLIC_KEY;

  return {
    manifest_version: 3,
    name: 'Einsatzkarte',
    description:
      'Einsatzkarte der FF Neusiedl am See \u2014 Einsatz\u00fcbersicht und Tagebuch',
    version: resolveVersionFromGit(),
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
