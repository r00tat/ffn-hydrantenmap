import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Die Regeltests laufen nur gegen prod. Weichen die beiden Dateien
// voneinander ab, wäre dev ungetestet — und ein Unterschied fiele erst beim
// Deploy auf. Läuft auch in `npm run test`, weil er keinen Emulator braucht.
describe('Firestore-Regeln dev und prod', () => {
  it('sind identisch', () => {
    const read = (env: string) =>
      readFileSync(path.join(import.meta.dirname, env, 'firestore.rules'), 'utf8');
    expect(read('dev')).toBe(read('prod'));
  });
});
