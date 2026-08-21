# Service Worker und PWA

Gebaut mit `@serwist/turbopack`. Der Service Worker wird aus
`src/worker/index.ts` gebaut und über den Route Handler
[src/app/serwist/\[path\]/route.ts](../src/app/serwist/[path]/route.ts) als SSG-Route unter
`/serwist/sw.js` ausgeliefert — nicht mehr als Datei in `public/`. Er enthält sowohl das
Serwist-Precaching als auch die FCM-Background-Handler.

- Registriert wird er im Root-Scope, einmal über den `SerwistProvider` in
  [src/app/layout.tsx](../src/app/layout.tsx) (in Dev deaktiviert) und einmal in
  [src/components/firebase/messaging.ts](../src/components/firebase/messaging.ts), sobald
  Push-Rechte erteilt sind. Root-Scope trotz Unterpfad geht, weil der Route Handler
  `Service-Worker-Allowed: /` setzt.
- Die alte URL `/firebase-messaging-sw.js` gibt es nicht mehr. Firebase braucht diesen
  festen Pfad nur, wenn `getToken()` keine eigene Registrierung bekommt — `messaging.ts`
  übergibt eine. Bereits installierte PWAs behalten ihre alte Registrierung aber (ein 404
  auf das Skript meldet einen Worker nicht ab), deshalb räumt
  `unregisterLegacyServiceWorker()` aus [src/common/serviceWorker.ts](../src/common/serviceWorker.ts)
  sie aktiv weg. Diese Funktion darf erst entfernt werden, wenn alle Clients migriert sind.
- **`process.env` im Worker muss eingetragen werden.** Der Worker wird von esbuild
  gebaut, **nicht** von der Next.js-Pipeline — dort ersetzt niemand
  `process.env.NEXT_PUBLIC_*`, und im `ServiceWorkerGlobalScope` gibt es kein
  `process`. Eine stehengebliebene Referenz beendet die Auswertung des Skripts mit
  `ReferenceError: process is not defined`; die Registrierung scheitert dann
  **vollständig** — kein Precaching, keine Caching-Regeln, keine Push-Nachrichten,
  und eine installierte PWA bleibt unter ihrem alten Worker (Ursache von #663).
  Jede Variable, die ein Modul unter `src/worker/` liest, gehört deshalb in
  `SERVICE_WORKER_ENV_KEYS` in [serviceWorkerDefine.ts](../src/server/serviceWorkerDefine.ts);
  der Route Handler reicht die Tabelle als `esbuildOptions.define` weiter. Ein Test
  dort liest die Worker-Quellen und schlägt fehl, wenn eine Variable fehlt.
  Von selbst setzt esbuild nur `process.env.NODE_ENV` ein, abgeleitet aus `minify`.
- Alles, was auf oberster Ebene des Workers laufen kann, gehört in ein `try`. Die
  Firebase-Messaging-Einrichtung steht deshalb in `startBackgroundMessaging()` mit
  `catch` drumherum: Push ist die Kür, Precaching die Pflicht — ein Wurf dort darf
  nicht den ganzen Worker mitnehmen.
- Serwist bündelt den Worker mit `esbuild-wasm` (Default auf allen Nicht-Windows-Systemen).
  Zur Laufzeit wird esbuild nicht gebraucht, weil die Route vollständig prerendered ist —
  daher fehlt es korrekt im `.next/standalone/node_modules`.
