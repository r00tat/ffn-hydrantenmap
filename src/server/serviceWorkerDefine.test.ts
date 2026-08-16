import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SERVICE_WORKER_ENV_KEYS,
  serviceWorkerDefine,
} from './serviceWorkerDefine';

describe('serviceWorkerDefine', () => {
  it('inlines every declared variable as a JSON string literal', () => {
    const define = serviceWorkerDefine({
      NEXT_PUBLIC_FIREBASE_APIKEY: '{"apiKey":"abc"}',
    });

    expect(define['process.env.NEXT_PUBLIC_FIREBASE_APIKEY']).toBe(
      JSON.stringify('{"apiKey":"abc"}'),
    );
    // Das Ergebnis muss gültiges JavaScript sein — esbuild setzt den Wert
    // wörtlich in den Bundle-Quelltext ein.
    expect(
      JSON.parse(define['process.env.NEXT_PUBLIC_FIREBASE_APIKEY']),
    ).toBe('{"apiKey":"abc"}');
  });

  it('inlines an empty string when the variable is unset', () => {
    const define = serviceWorkerDefine({});

    // Nicht `undefined`: als Ersatztext wäre das ein Bezeichner, der im Worker
    // zwar existiert, aber jeden `JSON.parse`-Aufruf zu einem Fehler machte.
    expect(define['process.env.NEXT_PUBLIC_FIREBASE_APIKEY']).toBe('""');
  });

  it('escapes quotes so a config value cannot break out of the literal', () => {
    const define = serviceWorkerDefine({
      NEXT_PUBLIC_FIREBASE_APIKEY: '{"a":"b\\"c"}',
    });

    expect(JSON.parse(define['process.env.NEXT_PUBLIC_FIREBASE_APIKEY'])).toBe(
      '{"a":"b\\"c"}',
    );
  });

  it('defines exactly the declared keys and nothing else', () => {
    expect(Object.keys(serviceWorkerDefine({})).sort()).toEqual(
      SERVICE_WORKER_ENV_KEYS.map((key) => `process.env.${key}`).sort(),
    );
  });
});

/**
 * Der eigentliche Regressionstest zu #663: Der Service Worker wird von esbuild
 * gebaut, nicht von Next.js — dort ersetzt niemand `process.env.X`, und
 * `process` gibt es im `ServiceWorkerGlobalScope` nicht. Eine übersehene
 * Referenz lässt das Skript beim Auswerten mit `ReferenceError` sterben, die
 * Registrierung scheitert und die PWA läuft weiter unter ihrem alten Worker.
 *
 * Deshalb wird der Worker-Quelltext hier gegen die Ersetzungsliste geprüft
 * statt darauf zu vertrauen, dass beim nächsten Mal jemand daran denkt.
 */
describe('service worker sources', () => {
  const workerDir = path.join(process.cwd(), 'src/worker');

  const sources = fs
    .readdirSync(workerDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)(
    '%s only reads env variables that are inlined at build time',
    (file) => {
      const code = fs.readFileSync(path.join(workerDir, file), 'utf8');
      const used = [...code.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map(
        (match) => match[1],
      );

      expect(
        used.filter(
          (key) =>
            !(SERVICE_WORKER_ENV_KEYS as readonly string[]).includes(key),
        ),
      ).toEqual([]);
    },
  );
});
