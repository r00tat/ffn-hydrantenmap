# CWS Publish Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local `npm run publish:cws` script that builds the Chrome extension and publishes it to the Chrome Web Store.

**Architecture:** A Node.js script (`scripts/publish-cws.mjs`) that reads CWS credentials from environment variables, finds the latest build artifact ZIP, and uses the `chrome-webstore-upload` library to upload + auto-publish. Wired up as `npm run publish:cws` which runs `build:prod` first.

**Tech Stack:** Node.js ESM, `chrome-webstore-upload` npm package

---

### Task 1: Install `chrome-webstore-upload` dependency

**Files:**
- Modify: `chrome-extension/package.json` (devDependencies)

**Step 1: Install the package**

Run (from `chrome-extension/`):
```bash
npm install --save-dev chrome-webstore-upload
```

**Step 2: Verify installation**

Run:
```bash
node -e "import('chrome-webstore-upload').then(m => console.log('OK', typeof m.default))"
```
Expected: `OK function`

**Step 3: Commit**

```bash
git add chrome-extension/package.json chrome-extension/package-lock.json
git commit -m "chore(chrome-extension): add chrome-webstore-upload dependency"
```

---

### Task 2: Create `scripts/publish-cws.mjs`

**Files:**
- Create: `chrome-extension/scripts/publish-cws.mjs`

**Step 1: Write the publish script**

```js
// Publishes the latest einsatzkarte-*.zip to the Chrome Web Store.
//
// Required environment variables:
//   CWS_CLIENT_ID        — Google OAuth2 client ID
//   CWS_CLIENT_SECRET    — Google OAuth2 client secret
//   CWS_REFRESH_TOKEN    — OAuth2 refresh token
//   CWS_EXTENSION_ID     — Chrome Web Store extension ID
//
// Run `npm run build:prod` before this script to generate the ZIP.

import chromeWebstoreUpload from 'chrome-webstore-upload';
import { createReadStream, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(__dirname, '..');

// --- Validate environment variables ---
const required = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_EXTENSION_ID',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `Error: missing environment variables: ${missing.join(', ')}\n` +
      'Set them before running this script.',
  );
  process.exit(1);
}

// --- Find the latest ZIP artifact ---
const zipPattern = /^einsatzkarte-.*\.zip$/;
const zips = readdirSync(extRoot).filter((f) => zipPattern.test(f));
if (zips.length === 0) {
  console.error(
    'Error: no einsatzkarte-*.zip found. Run `npm run build:prod` first.',
  );
  process.exit(1);
}
if (zips.length > 1) {
  console.error(
    `Error: found multiple ZIP files: ${zips.join(', ')}. ` +
      'Expected exactly one (build:prod cleans old artifacts).',
  );
  process.exit(1);
}
const zipPath = resolve(extRoot, zips[0]);
console.log(`Publishing ${zips[0]} to Chrome Web Store...`);

// --- Upload and publish ---
const store = chromeWebstoreUpload({
  extensionId: process.env.CWS_EXTENSION_ID,
  clientId: process.env.CWS_CLIENT_ID,
  clientSecret: process.env.CWS_CLIENT_SECRET,
  refreshToken: process.env.CWS_REFRESH_TOKEN,
});

const zipStream = createReadStream(zipPath);
const uploadResult = await store.uploadExisting(zipStream);

if (uploadResult.uploadState === 'FAILURE') {
  console.error('Upload failed:', JSON.stringify(uploadResult, null, 2));
  process.exit(1);
}
console.log('Upload successful:', uploadResult.uploadState);

const publishResult = await store.publish();
if (publishResult.status.includes('OK')) {
  console.log('Published successfully!');
} else {
  console.error('Publish failed:', JSON.stringify(publishResult, null, 2));
  process.exit(1);
}
```

**Step 2: Test that the script validates env vars**

Run:
```bash
cd chrome-extension && node scripts/publish-cws.mjs
```
Expected: Error message listing all 4 missing env vars, exit code 1.

**Step 3: Commit**

```bash
git add chrome-extension/scripts/publish-cws.mjs
git commit -m "feat(chrome-extension): add CWS publish script"
```

---

### Task 3: Add `publish:cws` npm script

**Files:**
- Modify: `chrome-extension/package.json` (scripts section)

**Step 1: Add the script**

Add to `scripts` in `chrome-extension/package.json`:
```json
"publish:cws": "npm run build:prod && node scripts/publish-cws.mjs"
```

**Step 2: Verify dry-run (without CWS credentials)**

Run:
```bash
cd chrome-extension && npm run publish:cws
```
Expected: Build succeeds, then script exits with error about missing CWS env vars.

**Step 3: Commit**

```bash
git add chrome-extension/package.json
git commit -m "feat(chrome-extension): add npm run publish:cws script"
```

---

### Task 4: Update README with publish instructions

**Files:**
- Modify: `chrome-extension/README.md`

**Step 1: Add publish section**

Add after the existing "Release Build" section:

```markdown
### Publish to Chrome Web Store

Set the following environment variables:

- `CWS_CLIENT_ID` — Google OAuth2 client ID (Chrome Web Store API)
- `CWS_CLIENT_SECRET` — Google OAuth2 client secret
- `CWS_REFRESH_TOKEN` — OAuth2 refresh token
- `CWS_EXTENSION_ID` — Chrome Web Store extension ID

Then run:

```bash
npm run publish:cws
```

This runs a full production build and publishes the extension to the Chrome Web Store.

To generate the credentials, see [Chrome Web Store API docs](https://developer.chrome.com/docs/webstore/using-api).

**Step 2: Commit**

```bash
git add chrome-extension/README.md
git commit -m "docs(chrome-extension): add CWS publish instructions to README"
```
