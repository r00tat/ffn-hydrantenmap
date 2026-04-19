# WXT Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate `chrome-extension/` from `@crxjs/vite-plugin` to [WXT](https://wxt.dev), closing Dependabot Alert #91 (rollup 2.79.2 path-traversal) and aligning the extension on an actively maintained Vite-4/rollup-4 toolchain.

**Architecture:** Big-Bang in-place migration. File layout changes from `src/popup`, `src/background`, `src/content` to WXT's `entrypoints/` convention. `manifest.config.ts` + `vite.config.ts` consolidate into a single `wxt.config.ts` that preserves the existing env-overlay and git-tag-based version logic. CRX packaging (`scripts/package.mjs`) stays; CWS upload script is replaced by `wxt submit`. Output directory stays `dist/` so CI and package scripts remain unchanged.

**Tech Stack:** WXT 0.20+, `@wxt-dev/module-react`, Vite 6 (peer), React 19, MUI 9, Firebase 12, Vitest 4, TypeScript 5.8.

**Design Doc:** `docs/plans/2026-04-19-wxt-migration-design.md`

**Branch:** `feature/wxt-migration` (already created, off `main`)

**Reference — existing files being migrated:**
- `chrome-extension/manifest.config.ts` (MV3 manifest, env-loading, git-version)
- `chrome-extension/vite.config.ts` (Vite+CRX plugin, env overlay, @shared alias)
- `chrome-extension/src/popup/{index.html, index.tsx, App.tsx, components/, hooks/}`
- `chrome-extension/src/background/service-worker.ts`
- `chrome-extension/src/content/sybos.ts` + 14 helpers (incl. 7 `*.test.ts`)
- `chrome-extension/src/shared/{auth, config, firebase, types}.ts`
- `chrome-extension/scripts/{package, publish-cws}.mjs`
- `.github/workflows/chrome-extension-release.yml`

---

## Task 1: Install WXT, remove crxjs/vite/jsdom conflicts

**Files:**
- Modify: `chrome-extension/package.json` (devDependencies, scripts)
- Auto-regenerated: `chrome-extension/package-lock.json`

**Step 1: Remove crxjs, add WXT**

Run (from `chrome-extension/`):
```bash
cd chrome-extension
npm uninstall @crxjs/vite-plugin @vitejs/plugin-react chrome-webstore-upload
npm install --save-dev wxt @wxt-dev/module-react
```

**Step 2: Verify package-lock no longer pins rollup 2.x**

Run:
```bash
grep -c '"rollup-2.79.2"\|"rollup-2\.' package-lock.json || echo "no rollup 2.x left"
grep -A1 '"node_modules/rollup"' package-lock.json | head -5
```
Expected: `no rollup 2.x left` (or no lines with rollup 2.x); remaining `node_modules/rollup` should be 4.x (via Vite).

**Step 3: Update scripts in `chrome-extension/package.json`**

Replace the `scripts` block with:
```json
"scripts": {
  "dev": "wxt",
  "build": "tsc --noEmit && wxt build",
  "build:prod": "tsc --noEmit && EXT_ENV_LOCAL=1 wxt build && node scripts/package.mjs",
  "test": "vitest run",
  "publish:cws": "npm run build:prod && wxt submit --chrome-zip \"$(ls einsatzkarte-*.zip | head -n1)\""
}
```

(Removed: `preview`, `cws:login`. The `cws:login` workflow is replaced by `wxt submit init` — documented separately.)

**Step 4: Commit**

```bash
git add chrome-extension/package.json chrome-extension/package-lock.json
git commit -m "chore(chrome-extension): swap @crxjs/vite-plugin for wxt"
```

Note: the build is intentionally broken at this point — next tasks restore it.

---

## Task 2: Create minimal `wxt.config.ts`

**Files:**
- Create: `chrome-extension/wxt.config.ts`

**Step 1: Write a minimal config (skeleton manifest, no env-overlay yet)**

```typescript
// chrome-extension/wxt.config.ts
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
```

**Step 2: Create empty `entrypoints/` placeholder so WXT doesn't fail**

```bash
mkdir chrome-extension/entrypoints
```

**Step 3: Run WXT init/typegen and build (expect partial success)**

```bash
cd chrome-extension
npx wxt prepare     # generates .wxt/ types
npm run build 2>&1 | tail -20
```
Expected: build completes with 0 entrypoints (or warns that no entrypoints were found). `dist/manifest.json` exists with name/description/icons. TypeScript passes.

**Step 4: Commit**

```bash
git add chrome-extension/wxt.config.ts
git commit -m "chore(chrome-extension): add minimal wxt.config.ts"
```

---

## Task 3: Migrate background service worker

**Files:**
- Create: `chrome-extension/entrypoints/background.ts`
- Delete: `chrome-extension/src/background/service-worker.ts`

**Step 1: Read existing service worker**

Open `chrome-extension/src/background/service-worker.ts` and identify:
- Module-level runtime code (listeners, `chrome.runtime.onInstalled`, etc.)
- Top-level imports

**Step 2: Wrap in `defineBackground`**

Create `chrome-extension/entrypoints/background.ts`:
```typescript
import { defineBackground } from 'wxt/sandbox';
// ... existing imports from service-worker.ts, pathed to @shared or ./relative

export default defineBackground({
  type: 'module',
  main() {
    // ... all runtime code from the old service-worker.ts body
    // (chrome.runtime.onInstalled.addListener, etc.)
  },
});
```

Import-path rewrite rule: anything that was `../shared/*` or `../../shared/*` becomes `@shared/*` (alias already configured).

**Step 3: Delete the old file**

```bash
git rm chrome-extension/src/background/service-worker.ts
rmdir chrome-extension/src/background 2>/dev/null || true
```

**Step 4: Build and inspect manifest**

```bash
npm run build 2>&1 | tail -20
cat dist/manifest.json | jq '.background'
```
Expected: `{"service_worker":"background.js","type":"module"}` (or similar WXT output path).

**Step 5: Commit**

```bash
git add chrome-extension/entrypoints/background.ts chrome-extension/src/background
git commit -m "refactor(chrome-extension): migrate background to wxt entrypoint"
```

---

## Task 4: Migrate popup

**Files:**
- Create: `chrome-extension/entrypoints/popup/{index.html, main.tsx, App.tsx, components/, hooks/}`
- Delete: `chrome-extension/src/popup/` (whole folder)

**Step 1: Move popup files via `git mv`**

```bash
cd chrome-extension
git mv src/popup entrypoints/popup
# WXT expects the HTML's script reference; the existing index.tsx name works,
# but rename to main.tsx to follow WXT convention:
git mv entrypoints/popup/index.tsx entrypoints/popup/main.tsx
```

**Step 2: Update `entrypoints/popup/index.html`**

Change the `<script src="./index.tsx">` to `<script src="./main.tsx">` (only change needed; all other HTML is fine).

**Step 3: Fix any relative imports that broke**

Search for `../shared`, `../../shared`, `../background`, `../content` in `entrypoints/popup/**`:
```bash
grep -rn "from ['\"]\.\./" entrypoints/popup/
```
Rewrite each hit:
- `../shared/*` → `@shared/*`
- `../content/*` → `@/src/content/*` (only if needed — popup shouldn't depend on content)
- Anything into `src/popup/...` → relative to new location

**Step 4: Build and inspect**

```bash
npm run build 2>&1 | tail -20
cat dist/manifest.json | jq '.action'
ls dist/popup*
```
Expected: `"default_popup": "popup.html"` (or `popup/index.html`), `popup.html` or similar file exists in `dist/`.

**Step 5: Commit**

```bash
git add chrome-extension/entrypoints/popup chrome-extension/src/popup
git commit -m "refactor(chrome-extension): migrate popup to wxt entrypoint"
```

---

## Task 5: Migrate content script (including helpers and tests)

**Files:**
- Create: `chrome-extension/entrypoints/sybos.content/index.ts`
- Move: all of `chrome-extension/src/content/*` → `chrome-extension/entrypoints/sybos.content/`
- Delete: `chrome-extension/src/content/`

**Step 1: Move the content folder**

```bash
cd chrome-extension
git mv src/content entrypoints/sybos.content
# Entry file currently named sybos.ts — WXT expects index.ts inside the dir:
git mv entrypoints/sybos.content/sybos.ts entrypoints/sybos.content/index.ts
```

**Step 2: Rewrite `entrypoints/sybos.content/index.ts` to use `defineContentScript`**

Current file has top-level runtime code (`document.readyState` check, `setInterval`, etc.). ALL of that must move into `main()`:

```typescript
import { defineContentScript } from 'wxt/sandbox';
import { initWidget } from './sybos-widget';
import { loadFirecall } from './sybos-firecall';

export default defineContentScript({
  matches: ['https://sybos.lfv-bgld.at/*'],
  runAt: 'document_end',
  cssInjectionMode: 'manifest',  // keeps sybos.css as a manifest-declared CSS
  css: ['sybos.css'],

  main() {
    if (document.readyState === 'complete') {
      initWidget(loadFirecall);
    } else {
      window.addEventListener('load', () => initWidget(loadFirecall));
      const fallback = setInterval(() => {
        if (document.readyState === 'complete') {
          clearInterval(fallback);
          initWidget(loadFirecall);
        }
      }, 500);
      setTimeout(() => clearInterval(fallback), 30_000);
    }

    setInterval(() => {
      if (!document.getElementById('einsatzkarte-widget') && document.body) {
        initWidget(loadFirecall);
      }
    }, 2000);
  },
});
```

(Adjust `cssInjectionMode` / `css` field if WXT's current API prefers a different key — verify against `wxt prepare` type output.)

**Step 3: Run the existing test suite — it MUST stay green**

```bash
npm run test 2>&1 | tail -30
```
Expected: all 7 `*.test.ts` files pass (name-matching, vehicle-matching, vehicle-list-matching, sybos-table, sybos-vehicle-table, sybos-vehicle-list, sybos-mannschaft-edit-table). If any test fails because of changed import paths, fix the import paths in the test file (sibling imports should be unchanged; only `../shared` → `@shared`).

**Step 4: Build and inspect**

```bash
npm run build 2>&1 | tail -20
cat dist/manifest.json | jq '.content_scripts'
```
Expected: content_scripts array with `matches: ["https://sybos.lfv-bgld.at/*"]`, `js: ["content-scripts/sybos.js"]` (or similar), `css: [...]`.

**Step 5: Commit**

```bash
git add chrome-extension/entrypoints/sybos.content chrome-extension/src/content
git commit -m "refactor(chrome-extension): migrate sybos content script to wxt"
```

---

## Task 6: Port git-version and env-overlay into `wxt.config.ts`

**Files:**
- Modify: `chrome-extension/wxt.config.ts`

**Step 1: Add `resolveVersionFromGit()` helper**

Copy verbatim from `chrome-extension/manifest.config.ts` lines 26-67. Place near the top of `wxt.config.ts`.

**Step 2: Add `envOverlayPlugin()` helper**

Copy from `chrome-extension/vite.config.ts` lines 14-26. Adapt the prefixes array to include `CHROME_EXTENSION_PUBLIC_KEY` (currently only `VITE_`/`NEXT_PUBLIC_`).

**Step 3: Convert `manifest` to async function with env loading**

Replace the existing `manifest: { ... }` with:

```typescript
manifest: async ({ mode }) => {
  const envPrefixes = ['NEXT_PUBLIC_', 'CHROME_EXTENSION_PUBLIC_KEY'];
  const rootEnv = loadEnv(mode, resolve(__dirname, '..'), envPrefixes);
  const overlayEnv = process.env.EXT_ENV_LOCAL
    ? loadEnv(mode, __dirname, envPrefixes)
    : {};
  const env = { ...rootEnv, ...overlayEnv };

  const clientId = env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error('NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID is not set in .env.local');
  }

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
```

Add `import { loadEnv } from 'vite';` at the top.

**Step 4: Update `vite:` config to register env-overlay plugin and envDir**

```typescript
vite: () => ({
  envDir: resolve(__dirname, '..'),
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [...(process.env.EXT_ENV_LOCAL ? [envOverlayPlugin()] : [])],
}),
```

**Step 5: Build and verify manifest completeness**

Requires `.env.local` in project root with `NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID`. Run:

```bash
cd chrome-extension
npm run build
cat dist/manifest.json | jq '{name, version, permissions, host_permissions, oauth2, key: (.key // "none")}'
```
Expected: `version` matches `git describe --tags --abbrev=0 | sed 's/^v//'` (possibly with a `.N` suffix for commits-ahead), `oauth2.client_id` is set, `host_permissions` has the three Firebase entries.

**Step 6: Test the `EXT_ENV_LOCAL=1` path**

Create a temporary `chrome-extension/.env.production.local` with `CHROME_EXTENSION_PUBLIC_KEY='TESTVALUE'` and run:
```bash
EXT_ENV_LOCAL=1 npm run build
cat dist/manifest.json | jq '.key'
rm chrome-extension/.env.production.local
```
Expected: `"TESTVALUE"`.

**Step 7: Commit**

```bash
git add chrome-extension/wxt.config.ts
git commit -m "feat(chrome-extension): port env-overlay and git-version to wxt.config"
```

---

## Task 7: Update `tsconfig.json`, `.gitignore`, and env typings

**Files:**
- Modify: `chrome-extension/tsconfig.json`
- Modify: `chrome-extension/.gitignore` (create if missing)
- Delete: `chrome-extension/src/vite-env.d.ts`

**Step 1: Point tsconfig at WXT's generated config**

Open `chrome-extension/tsconfig.json`. Change `compilerOptions` and root to:
```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": [".wxt/**/*", "entrypoints/**/*", "src/**/*", "wxt.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

(If current tsconfig has custom options like `strict`, `jsx`, etc., preserve them — WXT's base has sensible defaults but do not drop project-specific tweaks without reason.)

**Step 2: Update `.gitignore`**

Ensure these entries exist in `chrome-extension/.gitignore`:
```
.wxt/
.output/
dist/
dist.pem
.env.production.local
einsatzkarte-*.zip
einsatzkarte-*.crx
```

(Keep existing entries, just add missing ones.)

**Step 3: Delete `src/vite-env.d.ts`**

```bash
git rm chrome-extension/src/vite-env.d.ts
```
WXT generates its own types via `wxt prepare` into `.wxt/`.

**Step 4: Run type check**

```bash
cd chrome-extension
npx wxt prepare
npx tsc --noEmit 2>&1 | tail
```
Expected: 0 errors.

**Step 5: Commit**

```bash
git add chrome-extension/tsconfig.json chrome-extension/.gitignore chrome-extension/src/vite-env.d.ts
git commit -m "chore(chrome-extension): align tsconfig and gitignore with wxt"
```

---

## Task 8: Remove `manifest.config.ts` and `vite.config.ts`

**Files:**
- Delete: `chrome-extension/manifest.config.ts`
- Delete: `chrome-extension/vite.config.ts`

**Step 1: Verify neither is imported anywhere**

```bash
cd chrome-extension
grep -rn "manifest.config\|vite.config" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.json"
```
Expected: no hits (except possibly references inside `.wxt/` generated files — ignore those).

**Step 2: Delete**

```bash
git rm manifest.config.ts vite.config.ts
```

**Step 3: Build + test one more time**

```bash
npm run build
npm run test
```
Expected: both green.

**Step 4: Commit**

```bash
git add -u
git commit -m "chore(chrome-extension): remove legacy manifest.config.ts and vite.config.ts"
```

---

## Task 9: Replace `scripts/publish-cws.mjs` with `wxt submit`

**Files:**
- Delete: `chrome-extension/scripts/publish-cws.mjs`

**Step 1: Verify `scripts/package.mjs` is still valid**

Open `chrome-extension/scripts/package.mjs`. Confirm:
- `distDir` is still `resolve(extRoot, 'dist')` — YES (unchanged, WXT writes there)
- CRX signing via `crx3` still uses `chrome-extension/dist.pem` — YES
- No runtime changes needed

Run:
```bash
cd chrome-extension
# Only runs if dist.pem exists locally; skip if not
if [ -f dist.pem ]; then
  node scripts/package.mjs
  ls einsatzkarte-*.{zip,crx}
else
  echo "skipped: no dist.pem"
fi
```
Expected: if dist.pem present, `.zip` and `.crx` produced; otherwise skip message.

**Step 2: Delete old CWS script**

```bash
git rm chrome-extension/scripts/publish-cws.mjs
```

**Step 3: Commit**

```bash
git add -u
git commit -m "chore(chrome-extension): remove publish-cws.mjs, use wxt submit"
```

---

## Task 10: Update CI workflow `chrome-extension-release.yml`

**Files:**
- Modify: `.github/workflows/chrome-extension-release.yml`

**Step 1: Replace the "Publish to Chrome Web Store" step**

Find the step starting with `- name: Publish to Chrome Web Store` (around line 248). Replace its `run:` body:

From:
```yaml
run: |
  set -eo pipefail
  if [[ -z "${CWS_CLIENT_ID}" || ... ]]; then
    echo "::notice::Chrome Web Store publish skipped ..."
    exit 0
  fi
  node scripts/publish-cws.mjs
```

To:
```yaml
run: |
  set -eo pipefail
  if [[ -z "${CWS_CLIENT_ID}" || -z "${CWS_CLIENT_SECRET}" || -z "${CWS_REFRESH_TOKEN}" || -z "${CWS_EXTENSION_ID}" ]]; then
    echo "::notice::Chrome Web Store publish skipped — CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, or CWS_EXTENSION_ID not configured"
    exit 0
  fi
  npx wxt submit \
    --chrome-zip "${ZIP_FILE}" \
    --chrome-extension-id "${CWS_EXTENSION_ID}" \
    --chrome-client-id "${CWS_CLIENT_ID}" \
    --chrome-client-secret "${CWS_CLIENT_SECRET}" \
    --chrome-refresh-token "${CWS_REFRESH_TOKEN}"
```

(Verify flag names via `npx wxt submit --help` locally — adjust if WXT uses env vars `WXT_CHROME_*` instead.)

**Step 2: Other CI steps stay as-is**

- Checkout, setup Node, version resolve, key derive, env-file write, `npm ci`, `npm run build` (EXT_ENV_LOCAL=1), manifest-patch, `node scripts/package.mjs`, Drive upload, cleanup — all unchanged, since `dist/` path and `scripts/package.mjs` are preserved.

**Step 3: Syntax-check the workflow**

```bash
# Verify YAML is valid
yq . .github/workflows/chrome-extension-release.yml > /dev/null && echo "yaml ok"
```

**Step 4: Commit**

```bash
git add .github/workflows/chrome-extension-release.yml
git commit -m "ci(chrome-extension): use wxt submit for Chrome Web Store publish"
```

---

## Task 11: Full local verification

**Files:** none modified (verification only)

**Step 1: Clean install from scratch**

```bash
cd chrome-extension
rm -rf node_modules dist .wxt
npm ci
```
Expected: install succeeds. `npm audit` shows 0 high/critical.

**Step 2: Run type check + lint + tests + build in main project**

From repo root:
```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map
npm run check
```
Expected: green. (Main Next.js app is independent from chrome-extension, but this catches accidental breakage of any shared config.)

**Step 3: Run chrome-extension build + tests**

```bash
cd chrome-extension
npm run build
npm run test
```
Expected: `dist/manifest.json` valid, all 7 tests pass.

**Step 4: Inspect produced manifest matches pre-migration**

Compare key fields:
```bash
jq '{
  manifest_version,
  name,
  permissions,
  host_permissions,
  action: (.action // {}) | keys,
  background,
  content_scripts: [.content_scripts[] | {matches, js, css}],
  oauth2,
  icons
}' dist/manifest.json
```
Expected:
- `manifest_version: 3`
- `permissions: ["identity", "storage"]`
- `host_permissions`: 3 Firebase entries
- `action` has `default_popup`, `default_icon`
- `background.service_worker` set, `type: "module"`
- `content_scripts` has the sybos match
- `oauth2.client_id` set, `scopes: ["openid", "email", "profile"]`

**Step 5: Load unpacked in Chrome**

1. Open `chrome://extensions`, enable Developer Mode
2. „Load unpacked" → select `chrome-extension/dist/`
3. Click the Einsatzkarte popup icon → popup renders, OAuth login flow starts
4. Navigate to any `https://sybos.lfv-bgld.at/*` page → Einsatzkarte widget injects

**Step 6: Test production package build (if `dist.pem` present)**

```bash
EXT_ENV_LOCAL=1 npm run build:prod
ls einsatzkarte-*.{zip,crx}
unzip -p einsatzkarte-*.zip manifest.json | jq '.key // "no key field (correct)"'
```
Expected:
- both `.zip` and `.crx` produced
- `.zip`'s manifest has NO `key` field (package.mjs strips it)
- `dist/manifest.json` (unpacked) DOES retain `key`

**Step 7: Confirm no crxjs / rollup-2.x residue**

```bash
grep -c "@crxjs" package.json package-lock.json || echo "no @crxjs left"
jq '.packages | to_entries[] | select(.key | test("rollup")) | {key, version: .value.version}' package-lock.json
```
Expected: no `@crxjs`; only rollup 4.x entries.

**Step 8: Commit verification notes (if any)**

No commit if only verification. If any adjustments were needed, each should have been its own commit.

---

## Task 12: Open PR

**Files:** none

**Step 1: Push branch**

```bash
git push -u origin feature/wxt-migration
```

**Step 2: Create PR via gh**

```bash
unset GITHUB_TOKEN
gh pr create --title "refactor(chrome-extension): migrate from @crxjs/vite-plugin to WXT" --body "$(cat <<'EOF'
## Zusammenfassung

Migriert die Chrome-Extension von `@crxjs/vite-plugin` auf [WXT](https://wxt.dev). Schließt Dependabot Alert #91 (rollup 2.79.2 Path-Traversal, CVE-2026-27606): crxjs pinnte rollup hart auf die verwundbare 2.79.2, der Upstream-Fix-PR hängt seit Februar. WXT bringt rollup 4 und wird aktiv maintained.

Design: `docs/plans/2026-04-19-wxt-migration-design.md`.

## Änderungen

- `chrome-extension/package.json`: `@crxjs/vite-plugin`, `@vitejs/plugin-react`, `chrome-webstore-upload` entfernt; `wxt` und `@wxt-dev/module-react` hinzugefügt.
- Dateistruktur: `src/popup/`, `src/background/`, `src/content/` → `entrypoints/popup/`, `entrypoints/background.ts`, `entrypoints/sybos.content/`. `src/shared/` bleibt via `@shared`-Alias erreichbar.
- `manifest.config.ts` + `vite.config.ts` konsolidiert in `wxt.config.ts`. Eigene `resolveVersionFromGit()`- und Env-Overlay-Logik (`EXT_ENV_LOCAL`) bleibt 1:1 erhalten.
- Content-Script auf `defineContentScript` umgestellt — Top-Level-Runtime-Code wandert in `main()`.
- `scripts/publish-cws.mjs` entfernt, CI-Workflow nutzt `wxt submit`. `scripts/package.mjs` (CRX-Signing) bleibt unverändert.
- `outDir: 'dist'` beibehalten → CI-Pfade und Packaging-Script unverändert.
- `tsconfig.json` erbt jetzt von `.wxt/tsconfig.json`.

## Test plan

- [ ] `npm run check` im Projekt-Root grün
- [ ] `cd chrome-extension && npm run build && npm run test` grün
- [ ] `dist/manifest.json` enthält Permissions, Host-Permissions, OAuth2, Background, Content-Scripts, Icons wie vor der Migration
- [ ] Unpacked-Load in Chrome: Popup öffnet, OAuth-Login funktioniert
- [ ] Auf `https://sybos.lfv-bgld.at/*` wird das Einsatzkarte-Widget injiziert
- [ ] `EXT_ENV_LOCAL=1 npm run build:prod` erzeugt `.crx` + `.zip`; `.zip`-Manifest enthält KEIN `key`-Feld
- [ ] CI-Run auf dem Branch läuft durch (Build, Packaging, Drive-Upload)
- [ ] Nach Merge in `main`: Dependabot Alert #91 schließt sich automatisch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Verify labels applied**

Per CLAUDE.md: this PR type is `refactor:` — falls „enhancement" passender Label passt automatisch via Workflow. Wenn nicht, nach-Labelen.

**Step 4: Post-merge check**

After merge: visit https://github.com/r00tat/ffn-hydrantenmap/security/dependabot/91 — alert should be auto-closed within ~1 hour by GitHub's scanner.
