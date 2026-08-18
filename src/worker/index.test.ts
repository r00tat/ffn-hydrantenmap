import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `src/worker/index.ts` läuft nur im `ServiceWorkerGlobalScope`
 * (`self.registration`, `self.__SW_MANIFEST`) und lässt sich hier nicht
 * importieren. Geprüft wird deshalb die Quelle — dasselbe Vorgehen wie in
 * `serviceWorkerDefine.test.ts`.
 */
const source = fs.readFileSync(
  path.join(process.cwd(), 'src/worker/index.ts'),
  'utf8',
);

/**
 * Ohne das prüfte der Test seine eigene Begründung mit: In index.ts steht
 * ausführlich, *warum* `navigationPreload: true` weg ist — und zitiert die
 * Option dabei wörtlich.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('service worker: navigation preload', () => {
  it('schaltet Navigation Preload nicht ein', () => {
    // Ein Preload je Navigation, den der Worker nicht abfangen kann: Beim Start
    // der PWA über einen ACTION_VIEW-Intent laufen mehrere Navigationen auf
    // dieselbe URL, deren Preloads sich am HTTP-Cache-Eintrag gegenseitig
    // sperren — je 20 s bis ERR_CACHE_LOCK_TIMEOUT. Ausführlich in index.ts.
    expect(code).not.toMatch(/navigationPreload\s*:\s*true/);
    expect(code).not.toMatch(/\benableNavigationPreload\s*\(/);
  });

  it('schaltet Navigation Preload aktiv ab', () => {
    // Pflicht statt Kosmetik: `navigationPreload.enable()` hängt persistent an
    // der Registration, und Serwist schaltet nur ein, nie aus. Ohne diesen
    // Aufruf bliebe jede bereits installierte PWA im alten Zustand.
    expect(code).toMatch(/^disableNavigationPreload\(\);$/m);
    expect(code).toMatch(
      /import\s*\{[^}]*\bdisableNavigationPreload\b[^}]*\}\s*from\s*'serwist'/,
    );
  });
});
