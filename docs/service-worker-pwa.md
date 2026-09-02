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

## Web Worker: Turbopacks Bootstrap darf der Service Worker nicht anfassen

`new Worker(new URL('…', import.meta.url))` lädt bei Turbopack nicht das eigene Modul,
sondern einen generischen Bootstrap-Chunk `/_next/static/chunks/turbopack-worker-*.js`.
Welche Chunks der Worker nachladen soll, steht **nicht** im Skript, sondern in seiner
eigenen URL — und bei einem dedizierten `Worker` im **Fragment**:

```js
let i = "SharedWorker" === t.name;
i ? d.searchParams.set("params", u)                 // SharedWorker → Query
  : d.hash = "#params=" + encodeURIComponent(u);    // Worker → Fragment
```

Ein Fragment geht nie an den Server. Beantwortet der Service Worker die Anfrage — aus dem
Precache, aus einem Runtime-Cache oder auch nur durchgereicht —, wird die `location` des
Workers aus der URL der Response gesetzt, und die trägt kein Fragment. Der Bootstrap bricht
dann mit `Missing worker bootstrap config` ab und der Worker startet überhaupt nicht.

Das traf den Höhenmodell-Worker: in der Entwicklung lief alles (dort ist der Service Worker
per `disable` aus, siehe [layout.tsx](../src/app/layout.tsx)), in Produktion startete er nie.
Ein frisches Browserprofil funktionierte einmal — beim allerersten Aufruf kontrolliert der
Service Worker die Seite noch nicht.

Zwei Stellen halten das offen:

- **`globIgnores: ['**/turbopack-worker-*.js']`** in
  [src/app/serwist/[path]/route.ts](../src/app/serwist/[path]/route.ts) hält den Chunk aus
  dem Precache. Der Precache verwirft beim Abgleich sogar ausdrücklich den Hash.
- **Ein eigener `fetch`-Listener vor `serwist.addEventListeners()`** in
  [src/worker/index.ts](../src/worker/index.ts) bricht für diesen Chunk die Weitergabe ab
  (`stopImmediatePropagation()`). Ruft danach niemand `respondWith`, holt der Browser ihn
  selbst — mit Fragment, genau wie ohne Service Worker.

**Die Reihenfolge ist tragend.** Listener laufen in der Reihenfolge ihrer Registrierung;
steht der Bypass hinter `addEventListeners()`, kommt Serwist zuerst zum Zug und
`stopImmediatePropagation()` wirkt nicht mehr. Ein Test in `index.test.ts` hält das fest.

Einzelne Regeln aus `defaultCache` zu entfernen genügt **nicht**: den Chunk beantworten dort
vier, darunter die allgemeine für `.js` und ein Auffangnetz für die eigene Origin. Sie zu
streichen änderte das Verhalten für alles andere mit.

## Ein Service Worker darf die Anwendung nicht schlechter stellen als gar keiner

`CacheFirst` wirft `SerwistError('no-response')`, sobald der Cache-Zugriff scheitert — der
`fetch()` der Seite scheitert dann mit, obwohl das Netz die Antwort hätte. In DevTools sieht
man dabei den Request des Workers mit HTTP 200 und trotzdem einen Fehler in der Anwendung.

`runtimeCaching()` in [patterns.ts](../src/worker/patterns.ts) legt deshalb um **jede** Regel
einen Rückfall aufs Netz. Dazu kommen in [index.ts](../src/worker/index.ts):

- die Serwist-Einrichtung in einem `try` — wirft sie, gibt es lieber einen Worker ohne
  Caching-Regeln als gar keinen (ohne Regel holt der Browser die Antworten selbst);
- Listener auf `error` und `unhandledrejection`, damit ein Fehler im Worker nicht nur als
  „Uncaught (in promise)" in der Konsole steht;
- ein Notausstieg: die Seite kann `{ type: 'sw-reset' }` schicken, der Worker leert dann
  seine Caches und meldet sich ab. Ohne ihn bleibt einem Benutzer nur „Website-Daten
  löschen" — in einer installierten PWA am Telefon praktisch unauffindbar.

## Push: die Nutzlast muss unterscheidbar sein

`onBackgroundMessage` hat bis zur Atemschutzüberwachung **jede** Data-Message als
Chat-Nachricht behandelt und aus `data.name`/`data.message` einen Titel „Einsatz Chat: …"
gebaut. Jede weitere Art von Benachrichtigung erscheint damit als
„Einsatz Chat: undefined".

Neue Nachrichten tragen deshalb ein `kind` und werden **vor** dem Chat-Zweig geprüft. Die
Atemschutzwarnung ist der erste Fall:
[atemschutzPush.ts](../src/common/atemschutzPush.ts) hält Form, Prüfung (`isAtemschutzPush`)
und die Kennung der Anzeige (`pushTag`). Das Modul ist bewusst rein und importiert nur
Typen — der Worker kann nichts bündeln, was auf `firestore` oder `firebase-admin` zeigt.

Der **Text kommt fertig vom Server**: Der Worker hat keinen Übersetzungskatalog und würde
sonst einen Schlüssel anzeigen.

Zwei Dinge an der Anzeige, die aus dem Code nicht hervorgehen:

- `tag` wird je Trupp gesetzt, nicht je Warnung. Eine neue Warnung zum selben Trupp soll
  die alte **ersetzen**; drei Meldungen untereinander sind keine dreifache Information,
  sondern eine Liste, in der die aktuelle untergeht.
- `requireInteraction` steht nur bei der Rückzugswarnung. Die Sicherheitsmeldung soll nicht
  von selbst verschwinden, die Erinnerungen dürfen es.

Der Klick auf eine Benachrichtigung folgt `notification.data.url`. Vorher stand dort fest
`/chat`, und der Vergleich `client.url === '/chat'` traf nie zu: `client.url` ist absolut,
der Pfad nicht. Jetzt wird auf das Ende der URL geprüft — ein offenes Fenster wird also
wirklich fokussiert statt ein zweites geöffnet.

Hintergrund der Warnungen selbst (Fristen, Empfänger, Zeitplan):
[atemschutzueberwachung.md](atemschutzueberwachung.md).
