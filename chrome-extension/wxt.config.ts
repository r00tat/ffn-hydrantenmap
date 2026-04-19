import { defineConfig } from 'wxt';
import { loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';
import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from 'node:child_process';

const ROOT_DIR = resolve(__dirname, '..');
const ENV_PREFIXES_MANIFEST = ['NEXT_PUBLIC_', 'CHROME_EXTENSION_PUBLIC_KEY'];
const ENV_PREFIXES_VITE = ['VITE_', 'NEXT_PUBLIC_'];

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
// Build ohnehin mit dem expliziten Tag/Input - diese Funktion ist also vor
// allem fuer lokale Builds (`npm run build:prod`) relevant.
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

// Production builds (npm run build:prod, EXT_ENV_LOCAL=1) layer
// chrome-extension/.env.production.local on top of the shared project-root
// .env.local. Users only need to set vars that differ from dev (typically just
// NEXT_PUBLIC_FIRESTORE_DB).
function envOverlayPlugin(): Plugin {
  return {
    name: 'ext-env-overlay',
    config(_config, { mode }) {
      const overlay = loadEnv(mode, __dirname, ENV_PREFIXES_VITE);
      const define: Record<string, string> = {};
      for (const [key, value] of Object.entries(overlay)) {
        define[`import.meta.env.${key}`] = JSON.stringify(value);
      }
      return { define };
    },
  };
}

// Nur `wxt build` nutzt `dist/` (wird von CI, scripts/package.mjs und
// scripts/publish-cws.mjs erwartet). `wxt` (dev) schreibt in `.output/`, damit
// stale Build-Artefakte aus dist/ nicht vom Vite-Entry-Scanner als Entrypoints
// aufgegriffen werden.
const isBuildCommand = process.argv[2] === 'build';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: isBuildCommand ? 'dist' : '.output',
  outDirTemplate: '',
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  manifestVersion: 3,
  browser: 'chrome',

  dev: {
    server: {
      port: 3100,
    },
  },

  manifest: ({ mode }) => {
    const rootEnv = loadEnv(mode, ROOT_DIR, ENV_PREFIXES_MANIFEST);
    const overlayEnv = process.env.EXT_ENV_LOCAL
      ? loadEnv(mode, __dirname, ENV_PREFIXES_MANIFEST)
      : {};
    const env = { ...rootEnv, ...overlayEnv };

    const clientId = env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        'NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID is not set in .env.local',
      );
    }

    // Base64-kodierter DER Public Key, abgeleitet aus dem privaten Schluessel
    // in chrome-extension/dist.pem (*.pem ist .gitignored).
    //
    // Das `key`-Feld fixiert die Extension-ID sowohl bei Unpacked-Loads als
    // auch bei lokalen Prod-Builds (dist/ direkt laden). Der Chrome Web Store
    // lehnt ZIP-Uploads mit `key` ab — daher entfernt package.mjs das Feld
    // nur aus der ZIP-Datei, nicht aus dist/manifest.json.
    const extensionPublicKey = env.CHROME_EXTENSION_PUBLIC_KEY;

    return {
      name: 'Einsatzkarte',
      description:
        'Einsatzkarte der FF Neusiedl am See \u2014 Einsatzübersicht und Tagebuch',
      version: resolveVersionFromGit(),
      ...(extensionPublicKey ? { key: extensionPublicKey } : {}),
      permissions: ['identity', 'storage'],
      host_permissions: [
        'https://*.firebaseio.com/*',
        'https://*.googleapis.com/*',
        'https://*.firebaseapp.com/*',
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
  },

  vite: () => ({
    envDir: ROOT_DIR,
    envPrefix: ENV_PREFIXES_VITE,
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: process.env.EXT_ENV_LOCAL ? [envOverlayPlugin()] : [],
  }),
});
