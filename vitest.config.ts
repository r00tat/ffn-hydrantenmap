import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    // Über der Vorgabe von 5s. Die Dialog-Tests fahren mit `userEvent` ganze
    // MUI-Formulare durch und liegen unter Volllast schon ohne Coverage bei gut
    // 2s; die Instrumentierung von coverage-v8 legt rund 40% drauf und der
    // CI-Runner ist langsamer als jede Entwicklermaschine. Bei 5s kippte davon
    // der langsamste Test (FahrtenbuchDialog, "frei eingegebener Einsatz ohne
    // ID") in CI über die Grenze — nicht hängend, nur zu knapp bemessen.
    testTimeout: 15_000,
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    server: {
      deps: {
        // @mui/material@9.1+ ships Transition.mjs with a directory import
        // (`react-transition-group/TransitionGroupContext`) that Node's native
        // ESM loader cannot resolve when the module is externalized. Inlining
        // lets Vite transform and resolve it instead.
        inline: ['@mui/material'],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/playwright/**',
      '**/.skills/**',
      // chrome-extension has its own vitest config (jsdom environment) and test runner.
      '**/chrome-extension/**',
      // worktrees are separate checkouts — their tests run from their own tree.
      '**/.worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      // text: lokale Konsole. json-summary + json: Grundlage des PR-Kommentars
      // und des Badges. lcov: Coverage-Anzeige in der IDE (Coverage Gutters).
      reporter: ['text', 'json-summary', 'json', 'lcov'],
      // Ohne das schreibt Vitest bei einem fehlgeschlagenen Test gar keinen
      // Report — der Auswertungs-Job im PR liefe dann ins Leere, statt zu
      // zeigen, wie die Abdeckung vor dem Fehler aussah.
      reportOnFailure: true,
      // Alles unter src/ zählt, auch ungetestete Dateien — sonst misst der
      // Report nur die Dateien, die ohnehin schon Tests haben.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/test-setup.ts',
        'src/test-utils/**',
        // Einmal-Skripte, die über `npm run extract`/`import`/… von Hand
        // laufen und bewusst keine Tests haben.
        'src/server/harparser.ts',
        'src/server/firestore-import.ts',
        'src/server/export-import.ts',
        'src/server/cluster-import.ts',
        'src/server/hydrant-geohash.ts',
        'src/server/streckenkilometer-extract.ts',
      ],
    },
  },
});
