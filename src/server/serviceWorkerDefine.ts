/**
 * Umgebungsvariablen, die der Service Worker liest, und die deshalb beim Bauen
 * in sein Bundle eingesetzt werden müssen.
 *
 * Nur `NEXT_PUBLIC_*` gehört hier hinein: Der gebaute Worker wird als Skript
 * ausgeliefert, sein Inhalt ist öffentlich.
 */
export const SERVICE_WORKER_ENV_KEYS = ['NEXT_PUBLIC_FIREBASE_APIKEY'] as const;

/**
 * `define`-Tabelle für den esbuild-Lauf, mit dem `@serwist/turbopack` den
 * Service Worker aus `src/worker/index.ts` baut.
 *
 * Nötig, weil dieser Build **neben** der Next.js-Pipeline läuft. Im Anwendungs-
 * code ersetzt Next `process.env.NEXT_PUBLIC_*` durch den Wert; esbuild tut das
 * nicht, und im `ServiceWorkerGlobalScope` gibt es kein `process`. Eine
 * stehengebliebene Referenz beendet die Auswertung des Skripts also mit
 * `ReferenceError: process is not defined` — die Registrierung scheitert
 * vollständig, und eine installierte PWA bleibt unter ihrem alten Worker
 * hängen, der den Precache eines längst abgelösten Builds ausliefert.
 * Genau das war der Splash-Screen-Hänger aus #663.
 *
 * Der Wert wird als JSON-String-Literal eingesetzt, nicht roh: esbuild kopiert
 * ihn wörtlich in den Quelltext, ein unmaskiertes Anführungszeichen aus der
 * Konfiguration würde das Bundle zerlegen.
 *
 * Fehlt eine Variable, wird ein leerer String eingesetzt statt `undefined`.
 * `undefined` wäre im Bundle ein gültiger Ausdruck und der Worker liefe damit
 * bis zum ersten Zugriff weiter — der leere String macht den Fehler dort
 * sichtbar, wo er hingehört (`parseFirebaseConfig` meldet ihn und lässt den
 * Rest des Workers laufen).
 */
export function serviceWorkerDefine(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return Object.fromEntries(
    SERVICE_WORKER_ENV_KEYS.map((key) => [
      `process.env.${key}`,
      JSON.stringify(env[key] ?? ''),
    ]),
  );
}
