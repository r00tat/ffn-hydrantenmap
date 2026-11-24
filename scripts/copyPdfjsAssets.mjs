/**
 * Copies the WebAssembly decoders of pdfjs-dist (JBIG2, JPEG 2000, ICC colour
 * profiles) to public/pdfjs/wasm/, where the plan viewer loads them via
 * `wasmUrl`. Without them pdfjs silently drops JBIG2/JPX images, which are
 * common in scanned plans. Chained into the `dev`, `dev:https` and `build`
 * scripts — not a `pre*` hook, because `.npmrc` sets `ignore-scripts=true`,
 * which silently disables those. The target is gitignored so the files always
 * match the installed pdfjs version.
 * See docs/objektplaene.md, "Viewer".
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('pdfjs-dist/package.json')), 'wasm');
// Decoders plus their JavaScript fallbacks (`*_nowasm_fallback.js`), which
// pdfjs requests when WebAssembly is unavailable. QuickJS is only used for
// PDF scripting, which the viewer does not enable.
const FILES = readdirSync(source).filter(
  (f) => !f.startsWith('quickjs') && (f.endsWith('.wasm') || f.endsWith('_nowasm_fallback.js')),
);
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pdfjs', 'wasm');

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(source, file), join(target, file));
}
console.log(`pdfjs wasm: ${FILES.length} files copied to ${target}`);
