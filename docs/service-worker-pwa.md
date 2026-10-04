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

## App-Shell: Seiten für den Kaltstart ohne Netz

Navigationen auf eigene Seiten beantwortet nicht mehr Serwists `defaultCache`,
sondern die Regel aus `appShellRoute` ([patterns.ts](../src/worker/patterns.ts),
Logik in [appShell.ts](../src/worker/appShell.ts)). Navigationen tragen keinen
`Content-Type: text/html` im Request, fielen in `defaultCache` also in die
Auffangregel `others`: NetworkFirst **ohne** Zeitgrenze, 32 Einträge, ein Tag.
Im WLAN ohne Internet hing damit jede Navigation, bis der Browser aufgab, und
nach einem Tag ohne Besuch war die Seite weg.

- **Ein Cache je Build** (`app-shell-<NEXT_PUBLIC_BUILD_ID>`). Das HTML
  verweist auf die Chunks seines Builds, und die räumt der neue Worker aus dem
  Precache. Beim `activate` löscht der Worker deshalb die App-Shell früherer
  Builds; `useAppShellWarmup` wärmt nach dem `controllerchange` neu vor.
- **Netz zuerst, acht Sekunden** — zwei, wenn das Netz in den letzten 30
  Sekunden schon ausgefallen ist (`createNetworkHealth`, geteilt mit der
  RSC-Regel unten). Danach, bei einem Netzfehler oder einer 5xx-Antwort, der
  Cache: erst die eigene Seite, dann dieselbe ohne Query (`/map?lat=…`), dann
  der Precache dieses Builds, dann eine **Vorlage**, dann `/offline`, zuletzt
  eine eingebaute HTML-Seite. Bewusst nicht die übrigen Caches: Die Auffangregel `others` hält
  HTML früherer Builds, dessen Chunks offline fehlen — eine weiße Seite wäre
  schlechter als `/offline`. Gespeichert wird nur eine `200` ohne Umleitung
  mit `text/html`.
- **Vorlage für Einsatzseiten.** Ein offline angelegter Einsatz hat seine ID
  auf dem Gerät bekommen; seine Seiten hat nie jemand abgerufen. Die Seite
  desselben Abschnitts eines anderen Einsatzes dient als Vorlage, und die
  Einsatz-ID darin wird ersetzt — sie steht im Pfad, in Links und in den
  RSC-Daten des HTML (`"firecallId","…"`). Ohne Ersetzen hydrierte die Seite
  mit dem falschen Einsatz. Nur IDs ab 15 Zeichen: Firestore vergibt 20
  zufällige Zeichen, die sonst nirgends im HTML stehen.
- **Alle Seiten, nicht eine Auswahl.** Wer offline navigiert, soll keinen
  Unterschied merken. Die Liste steht in
  [appShellRoutes.ts](../src/common/appShellRoutes.ts); jede Route unter
  `src/app` steht dort oder unter `APP_SHELL_EXCLUDED_ROUTES` mit Grund, und
  `appShellRoutes.test.ts` prüft das gegen das Dateisystem. Die Abschnitte
  unter `/einsatz/<id>/<section>` sind per Typ an `FIRECALL_SECTION_NAMES`
  gebunden. Vorher stand nur eine Auswahl in der Liste, und neue Seiten
  fehlten unbemerkt.
- **Vorwärmen statt Precache.** Die Einsatzpfade sind dynamisch, der Worker
  kennt sie beim Installieren nicht. Die angemeldete Seite schickt deshalb
  online, zehn Sekunden nach dem Start und je Einsatz,
  `{ type: APP_SHELL_WARM_REQUEST, urls }` (`useAppShellWarmup`,
  [appShellWarmup.ts](../src/lib/appShellWarmup.ts)), die Seiten des
  Einsatzes zuerst. Ein Eintrag in `additionalPrecacheEntries` hätte zudem
  die Installation des Workers an den Abruf einer dynamischen Seite
  gehängt — scheitert der, gibt es gar keinen Worker.
- **Im Hintergrund, und nur was fehlt.** Der Worker ruft höchstens zwei
  Seiten gleichzeitig ab und überspringt, was der Cache dieses Builds schon
  hält. Der erste Lauf nach einem Deploy holt rund hundert Seiten, jeder
  weitere fast nichts; ein abgebrochener Lauf setzt fort, wo er stand.
  Aktuell hält eine Seite ohnehin jede Online-Navigation dorthin.
- **Neue Versuche.** Das Ergebnis trennt `failed` (Netzfehler, Zeitgrenze,
  5xx) von `rejected` (Umleitung, 4xx). Bei `failed` fragt die Seite erneut:
  nach 30 Sekunden, dann doppelt so lange, höchstens fünfmal, und bei jedem
  Reconnect. Vorher galt ein Einsatz nach dem ersten Lauf als erledigt,
  auch wenn einzelne Seiten gescheitert waren — im Offline-Test fehlte so die
  Atemschutzüberwachung. `rejected` wird nicht wiederholt.
- **Kürzen ohne die allgemeinen Seiten.** Höchstens 200 Einträge. Verdrängt
  werden zuerst die ältesten Einsatzseiten und Adressen mit Query; die Seiten
  ohne Einsatz gelten für jeden Einsatz und bleiben. Vorher warf die Grenze
  von 80 die ältesten Einträge hinaus, und das waren genau diese Seiten.
- **RSC-Abrufe: eigene Regel mit Zeitgrenze.** RSC-Payloads werden nicht
  vorgehalten: Ihr Cache-Schlüssel trägt `_rsc`, einen Hash über den
  Router-Zustand, der sich nicht vorhersagen lässt. Scheitert der RSC-Abruf,
  navigiert Next.js selbst hart („Falling back to browser navigation"), und
  diese Navigation beantwortet die App-Shell. Vorher lagen RSC-Abrufe bei
  Serwists `pages-rsc`: `NetworkFirst` **ohne** Zeitgrenze, im WLAN ohne
  Internet lief der Klick also ins Leere, und der Cache konnte RSC-Daten eines
  früheren Builds liefern. `appShellRscRoute` gibt jetzt nach der Zeitgrenze
  ein 503 ohne RSC-Inhalt zurück, worauf Next.js hart navigiert
  (`fetch-server-response.js`: `!isFlightResponse || !res.ok` →
  `doMpaNavigation`). `pages-rsc` und `pages-rsc-prefetch` löscht der Worker
  beim `activate`. Die experimentelle Offline-Behandlung von Next.js
  (`experimental.useOffline`, wartet bei Netzfehler auf die Verbindung statt
  hart zu navigieren) ist bewusst aus.
- Beide Regeln stehen **hinter** `cachePatterns` (die `NetworkOnly`-Regeln für den
  Ping `/api/ping`, die Gastseite und den Auth-Handler greifen weiter zuerst;
  der Ping darf nie aus einem Cache kommen, sonst täuschte er offline „online"
  vor, siehe [offline-modus.md](offline-modus.md#verbindungsstatus-erkennen)) und vor
  `defaultCache`. Sie sind wie jede andere in `resilient` eingepackt, werfen
  selbst aber nie: Am Ende steht die eingebaute Seite bzw. das 503 — ein Wurf
  ließe `resilient` aufs Netz ausweichen, und das hinge im WLAN ohne Internet
  wieder.

## Wechsel innerhalb eines Einsatzes ohne Neuladen

Karte und Abschnitte eines Einsatzes unterscheiden sich im Code nicht: Beide
Routen (`/einsatz/[firecallId]` und `/einsatz/[firecallId]/[section]`)
rendern [FirecallView](../src/components/pages/FirecallView.tsx), die den
Abschnitt aus `usePathname()` liest. Die Links in Menü und Kopfzeile sind
[FirecallLink](../src/components/site/FirecallLink.tsx): Liegt das Ziel im
selben Einsatz ([firecallNavigation.ts](../src/common/firecallNavigation.ts)),
verhindert ihr `onClick` die Navigation von `next/link` und ruft
`history.pushState`. Next.js hat `pushState` gepatcht: `usePathname` folgt,
der interne Verlaufszustand wird in den Eintrag kopiert, und der
Zurück-Button stellt ihn ohne Neuladen wieder her.

- **Kein Server, kein Cache.** Ein Router-Wechsel fragte den RSC-Payload ab;
  offline scheiterte der und Next.js lud hart aus der App-Shell — mit
  Wartezeit und Verlust des Seitenzustands. So bleibt online wie offline
  alles im Browser; nur ein noch nie geladener Abschnitt holt seinen Chunk,
  und der liegt im Precache.
- **`useParams` bleibt beim alten Wert**, er kommt aus dem Router-Baum. Das
  ist unschädlich, solange nur innerhalb *eines* Einsatzes gewechselt wird —
  ein anderer Einsatz, Kostenersatz und Schadstoff gehen über den Router. Wer
  im Abschnitt den Abschnitt braucht, liest `usePathname()`.
- **Die Seiten je Einsatz bleiben im Vorwärmen.** Sie tragen den Kaltstart
  ohne Netz und das Neuladen auf einem Abschnitt. Ein Einsatz, der nie
  vorgewärmt wurde, bekommt seine Seite aus der Vorlage (oben).

## „Neue Version verfügbar" nur bei einem anderen Build

Der Worker läuft mit `skipWaiting` und `clientsClaim`; die Meldung in
[useServiceWorkerUpdate.ts](../src/hooks/useServiceWorkerUpdate.ts) hängt am
`controllerchange`. Das Ereignis allein heißt aber keine neue Version, und so
erschien die Meldung auch auf Geräten, die schon den neuesten Stand hatten,
oft erst nach einer Weile, wenn die App wieder aktiv wurde:

- **Erste Übernahme.** Hatte die Seite beim Laden keinen Controller
  (Erstaufruf, harter Reload, nach `sw-reset`), übernimmt sie der Worker per
  `clientsClaim()`, und auch das ist ein `controllerchange`. Der Hook merkt sich
  deshalb, ob beim Mounten ein Controller da war, und schweigt beim ersten
  Wechsel, wenn nicht.
- **Seite neu, Worker zieht nach.** Navigationen gehen über NetworkFirst. Die
  Seite kommt also schon mit dem neuen Build vom Netz, und der Browser findet
  den neuen Worker erst danach (beim Navigieren oder beim Fortsetzen der App).
  Neu laden brächte dann nichts.

Der Hook fragt den neuen Controller deshalb per `MessageChannel` nach seiner
Build-ID (`SW_BUILD_ID_REQUEST` in
[serviceWorker.ts](../src/common/serviceWorker.ts)) und meldet nur, wenn sie von
`NEXT_PUBLIC_BUILD_ID` der Seite abweicht. Damit der Worker die ID kennt, steht
sie in `SERVICE_WORKER_ENV_KEYS`. Ist eine der beiden IDs unbekannt (lokaler
Build, keine Antwort), wird gemeldet: lieber einmal zu oft als ein echtes
Update verschwiegen.

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

## Die Dev-Variante trägt ihre Kennzeichnung im Namen

Dev und Produktion sehen identisch aus. Wer beide als PWA installiert hat, muss
am Namen erkennen, in welcher er gerade schreibt — in dev angelegte Einträge
fehlen im echten Einsatz. Deshalb stellt `withEnvironmentPrefix`
([src/common/appEnvironment.ts](../src/common/appEnvironment.ts)) dem Titel und
den Manifest-Namen in dev `🚧 DEV ` **voran**. Vorangestellt, weil Browser-Tab
und Homescreen-Label hinten abschneiden und „Einsatzkarte" das Label schon
allein ausfüllt.

Zwei Folgen davon:

- Das Manifest ist keine statische `manifest.json` mehr, sondern
  [src/app/manifest.ts](../src/app/manifest.ts) — statisches JSON kann nicht von
  der Umgebung abhängen. Next liefert es unter `/manifest.webmanifest` und setzt
  den `<link rel="manifest">` selbst; im Layout steht deshalb keiner mehr.
- Unterschieden wird an `NEXT_PUBLIC_FIRESTORE_DB` (prod leer, sonst `ffndev`),
  nicht an einer eigenen Variable. Die gäbe es nur um des Namens willen, müsste
  aber durch Dockerfile, Deploy-Workflow, beide Terraform-Umgebungen und
  `.env.local` gezogen werden — `publicBuildEnv.test.ts` erzwingt die Kette. Der
  lokale Entwicklungsserver zählt damit ebenfalls als Dev-Variante.

Die native Android-App bleibt bewusst außen vor: es gibt genau ein APK, das über
die Einstellung „Server-URL (Override)" mal auf prod und mal auf dev zeigt. Ein
`DEV` im `app_name` der `strings.xml` wäre für dieselbe Installation also mal
richtig und mal falsch.
