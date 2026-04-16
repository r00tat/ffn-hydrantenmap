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
