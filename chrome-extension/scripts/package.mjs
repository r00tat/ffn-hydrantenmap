// Packages the contents of chrome-extension/dist/ into a ZIP and a signed CRX.
//
// Inputs:
//   - dist/               must exist (run `vite build` before this script)
//   - dist.pem            private key used to sign the CRX (gitignored)
//   - env OUTPUT_BASE     optional basename for the output files
//                         (default: "einsatzkarte-<version>" read from manifest)
//
// Outputs (in chrome-extension/):
//   - <OUTPUT_BASE>.zip   flat archive for Chrome Web Store upload
//   - <OUTPUT_BASE>.crx   signed extension for Enterprise/Self-Hosting

import crx3 from 'crx3';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(__dirname, '..');
const distDir = resolve(extRoot, 'dist');
const manifestPath = resolve(distDir, 'manifest.json');
const keyPath = resolve(extRoot, 'dist.pem');

if (!existsSync(manifestPath)) {
  console.error(
    `Error: ${manifestPath} not found. Run \`vite build\` (or \`npm run build\`) first.`,
  );
  process.exit(1);
}

if (!existsSync(keyPath)) {
  console.error(
    `Error: private key not found at ${keyPath}. Place dist.pem in chrome-extension/ before packaging.`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '0.0.0';
const outputBase = process.env.OUTPUT_BASE || `einsatzkarte-${version}`;

const zipPath = resolve(extRoot, `${outputBase}.zip`);
const crxPath = resolve(extRoot, `${outputBase}.crx`);

await crx3([manifestPath], {
  keyPath,
  crxPath,
  zipPath,
});

console.log(`\u2713 ${zipPath}  \u2192 Upload zu Chrome Web Store`);
console.log(`\u2713 ${crxPath}  \u2192 Enterprise Policy / Self-Hosting`);
