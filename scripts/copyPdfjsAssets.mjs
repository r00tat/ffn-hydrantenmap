/**
 * Copies the WebAssembly decoders of pdfjs-dist (JBIG2, JPEG 2000, ICC colour
 * profiles) to public/pdfjs/wasm/, where the plan viewer loads them via
 * `wasmUrl`. Without them pdfjs silently drops JBIG2/JPX images, which are
 * common in scanned plans. Runs before `dev` and `build`; the target is
 * gitignored so the files always match the installed pdfjs version.
 * See docs/objektplaene.md, "Viewer".
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'];

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('pdfjs-dist/package.json')), 'wasm');
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pdfjs', 'wasm');

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(source, file), join(target, file));
}
console.log(`pdfjs wasm: ${FILES.length} files copied to ${target}`);
