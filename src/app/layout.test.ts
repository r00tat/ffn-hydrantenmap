import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Das Root-Layout ist eine Server-Komponente mit Schriften, Übersetzungen und
 * Metadaten; es zu rendern hieße, halb Next.js nachzubauen. Geprüft wird die
 * Quelle — wie in `src/worker/index.test.ts`.
 */
const source = fs.readFileSync(
  path.join(process.cwd(), 'src/app/layout.tsx'),
  'utf8',
);

const serwistProvider = source.match(/<SerwistProvider\b[\s\S]*?>/)?.[0] ?? '';

describe('RootLayout: SerwistProvider', () => {
  it('ist im Layout eingebunden', () => {
    expect(serwistProvider).not.toBe('');
  });

  it('lädt die Seite beim Online-Gehen nicht neu', () => {
    // Serwist hängt sonst an jedes `online`-Ereignis ein `location.reload()`.
    // Zurück im Netz baute sich die Karte dann komplett neu auf, offene
    // Dialoge und Eingaben gingen verloren — obwohl Firestore, die
    // Warteschlangen und die Anmeldung den Reconnect selbst behandeln.
    expect(serwistProvider).toMatch(/reloadOnOnline=\{false\}/);
  });
});
