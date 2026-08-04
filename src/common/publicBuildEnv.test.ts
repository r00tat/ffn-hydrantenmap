import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `next build` inlines `process.env.NEXT_PUBLIC_*` into the Client-Bundle — was
 * zum Build-Zeitpunkt nicht gesetzt ist, ist im Browser für immer `undefined`.
 *
 * Seit `.dockerignore` die lokalen Env-Dateien ausschließt, erreicht die
 * Konfiguration den Build ausschließlich über Docker-Build-Args. Fehlt dort eine
 * Variable, baut das Image trotzdem erfolgreich und die App ist erst im Browser
 * kaputt (`FirebaseError: "projectId" not provided in firebase.initializeApp.`).
 *
 * Dieser Test hält deshalb die Kette zusammen: jede im Client-Code gelesene
 * `NEXT_PUBLIC_*`-Variable muss im Dockerfile als Build-Arg deklariert und vom
 * Deploy-Workflow gefüllt werden.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Nur lokal per `.env.local` gesetzt (App-Check-Debug-Provider). Darf bewusst
 * nie in ein deploytes Bundle gelangen — siehe #628.
 */
const localOnlyVars = ['NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // src/server läuft nur zur Laufzeit auf dem Server und liest process.env dort.
      return entry.name === 'server' && dir === path.join(repoRoot, 'src')
        ? []
        : sourceFiles(full);
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [full];
  });
}

function clientPublicEnvVars(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
      if (!localOnlyVars.includes(match[1])) {
        found.add(match[1]);
      }
    }
  }
  return [...found].sort();
}

const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
const workflow = fs.readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'cloud-run.yml'),
  'utf8'
);

function workflowBuildArgs(): string {
  const match = workflow.match(/^(\s+)build-args: \|\n((?:\1\s+.*\n)+)/m);
  return match?.[2] ?? '';
}

describe('NEXT_PUBLIC_* Build-Konfiguration', () => {
  const vars = clientPublicEnvVars();

  it('findet die im Client gelesenen Variablen', () => {
    // Sanity check: ohne Treffer würden die Tests unten nichts prüfen.
    expect(vars).toContain('NEXT_PUBLIC_FIREBASE_APIKEY');
    expect(vars).toContain('NEXT_PUBLIC_FIRESTORE_DB');
  });

  it.each(vars)('%s ist im Dockerfile als Build-Arg deklariert', (name) => {
    expect(dockerfile).toMatch(new RegExp(`^ARG ${name}(=|$)`, 'm'));
    expect(dockerfile).toMatch(new RegExp(`^ENV ${name}=`, 'm'));
  });

  it.each(vars)('%s wird vom Cloud-Run-Workflow als Build-Arg übergeben', (name) => {
    expect(workflowBuildArgs()).toMatch(new RegExp(`^\\s*${name}=`, 'm'));
  });

  it.each(localOnlyVars)('%s gelangt nicht in einen Deploy-Build', (name) => {
    expect(dockerfile).not.toContain(name);
    expect(workflow).not.toContain(name);
  });
});
