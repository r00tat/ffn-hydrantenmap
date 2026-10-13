import { defineConfig } from 'vitest/config';

// Regeltests gegen den Firestore-Emulator (`npm run test:rules`). Eigene
// Konfiguration und nicht Teil von `npm run test`, weil der Emulator Java
// braucht und über `firebase emulators:exec` gestartet wird. Alle Dateien
// teilen sich einen Emulator; sie laufen deshalb nacheinander, sonst löschte
// `clearFirestore()` der einen Datei die Testdaten der anderen.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['firebase/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
