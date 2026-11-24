import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const scripts: Record<string, string> = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).scripts;
const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');

describe('package.json scripts', () => {
  it('kennt keine pre-/post-Hooks, solange .npmrc ignore-scripts setzt', () => {
    // Mit `ignore-scripts=true` laufen pre*/post*-Hooks bei `npm run` nicht —
    // ein `prebuild` wäre still wirkungslos, auch im Docker-Build.
    expect(npmrc).toMatch(/^ignore-scripts=true$/m);
    const hooks = Object.keys(scripts).filter((name) => {
      const base = name.replace(/^(pre|post)/, '');
      return base !== name && base in scripts;
    });
    expect(hooks).toEqual([]);
  });

  it.each(['dev', 'dev:https', 'build'])(
    '%s kopiert die WebAssembly-Decoder von pdfjs selbst (JBIG2 in Scans)',
    (name) => {
      expect(scripts[name]).toMatch(/^node scripts\/copyPdfjsAssets\.mjs && next /);
    },
  );
});
