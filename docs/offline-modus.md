# Offline-Modus

Die App soll ohne Internetverbindung einsatzfähig bleiben (Issue #839): einen
neuen Einsatz offline anlegen und befüllen, beim Reconnect von selbst
synchronisieren, den Verbindungsstatus selbst erkennen und anzeigen, und auch
einen Kaltstart ohne Netz überstehen. Die Benutzerdoku dazu steht unter
[content/docs/de/offline.md](../content/docs/de/offline.md) (`/docs/offline`).

Der Unterbau ist Firestore mit `persistentLocalCache`: Geladenes ist offline
lesbar, Schreibvorgänge landen im lokalen Cache und in einer Warteschlange, die
ein Neuladen übersteht. Zeitstempel kommen vom Gerät (`actor.now`), nicht von
`serverTimestamp()`; offline erfasste Zeiten stimmen also. Alles in diesem
Dokument ist das, was der Cache allein **nicht** leistet.

## Was offline geht und was nicht

| Geht offline | Geht nur online |
| --- | --- |
| Einsatz anlegen und ändern, Einsatztagebuch, Elemente auf der Karte, Ebenen, Besatzung, Einsatzorte | KI-Assistent und Sprach-Assistent |
| Atemschutzsammelplatz (Trupps, Ausgabe), Füllprotokoll erfassen | Verrechnung (`runTransaction`), Mail-Versand (Rechnung, Kostenersatz) |
| Atemschutzüberwachung samt lokaler Warnungen, Geräte & Material im Einsatz zuordnen und verbrauchen (Abbuchen wird nachgeholt) | PDF über den Server, Fahrtenbuch-Fahrten, Mängel samt Bildern |
| Anhänge an bestehenden Einsatz/Element (Upload wird nachgeholt) | Einsatz-Fotos im Drive, Blaulicht-SMS-Import und Duplikatsprüfung |
| Karte, soweit vorgeladen oder schon angesehen (basemap.at) | Straßen-Routing und Höhenprofil einer Leitung (siehe Grenzen) |
| Kaltstart mit zwischengespeicherter Anmeldung (90 Tage) | Verwaltung (Benutzer, Gruppen, Tokens, MCP), Freigabe-Links, Import/Export |

Was offline nicht geht, ist **erkennbar deaktiviert** (`OnlineOnly`, siehe
unten) und bricht nicht mit einem Fehler ab. Die Grenze verläuft entlang der
Technik: Firestore-Schreibvorgänge reiht das SDK ein, Server Actions,
Storage-Uploads und Transaktionen nicht. Was davon nachholbar und idempotent
ist, kommt in eine eigene Warteschlange; der Rest ist „nur online".

## Verbindungsstatus erkennen

`src/lib/connectivity.ts` ist ein modulweiter Store (für
`useSyncExternalStore`, aber auch außerhalb von React lesbar: `isOffline()`,
`onReconnect()`), gestartet vom `ConnectivityProvider` in `AppProviders`.

**Warum nicht `navigator.onLine`:** Es sagt nur, ob das Gerät *irgendeine*
Netzverbindung hat. Im WLAN ohne Internet (Fahrzeug-Router ohne LTE), hinter
einem Captive Portal oder bei einer Mobilverbindung ohne Durchsatz steht dort
fälschlich „online" — genau die Lagen, in denen es im Einsatz darauf ankommt.
`navigator.onLine === false` wird deshalb nur als sicheres *offline* genommen;
*online* heißt erst: der eigene Server hat geantwortet.

- **Ping gegen `/api/ping`:** `HEAD`, `cache: 'no-store'`, ohne Anmeldung,
  Zeitgrenze 5 s. Der Endpunkt antwortet `204` ohne Firestore und ohne
  Sitzung, damit er in jedem Zustand des Servers billig bleibt und auch vor dem
  Login funktioniert. **Nur die 204 zählt**, nicht `res.ok`: Ein Captive Portal
  antwortet gern mit 200 und einer Login-Seite.
- **Service Worker:** `/api/ping` hat eine eigene `NetworkOnly`-Regel als
  erste in `cachePatterns`. Eine Regel mit Cache-Rückfall würde offline eine
  alte Antwort liefern und „online" vortäuschen. Ebenso `NetworkOnly` sind
  die Drive-Dateien eines Einsatzes (`/api/einsatz/*/drive/*`, Sybos-Übertrag):
  Sonst fielen sie unter Serwists `apis`-Regel und lägen als große Fotos und
  Videos hinter der Anmeldung im Cache — auf einem geteilten Gerät auch für
  den nächsten Benutzer.
- **Takt:** alle 30 s, offline alle 10 s; sofort beim `online`-Ereignis, bei
  Fokus und bei `visibilitychange`. Das `offline`-Ereignis schaltet ohne Ping
  um. Im Hintergrund wird nicht gepingt (Akku); die Rückkehr auf die Seite
  prüft sofort. Gleichzeitige Prüfungen teilen sich einen Ping.
- **`syncing`** heißt erreichbar und `getPendingWriteCount() > 0`. Der Store
  hängt direkt am Zähler in `pendingWrites.ts`, nicht am Ping-Takt.
  Der Zähler lebt nur im Arbeitsspeicher, `persistentLocalCache` hält die
  Mutationen aber über ein Neuladen hinweg. Sobald Firebase Auth den Benutzer
  kennt, zählt `trackPersistedPendingWrites` deshalb ein
  `waitForPendingWrites` als einen Platzhalter mit — sonst zeigte ein offline
  neu geöffnetes Gerät weder Anzahl noch `syncing`. Das SDK nennt keine
  Anzahl; der Platzhalter steht für alles aus früheren Läufen.
- **`onReconnect`** feuert beim Wechsel unerreichbar → erreichbar. Daran
  hängen die Warteschlangen, die Anmeldung am Server und das Nachplanen der
  Atemschutzwarnungen.

Angezeigt wird der Status als Chip in der Kopfzeile (`NetworkStatusChip`)
statt der früheren Snackbar, die Inhalte verdeckte: „Offline-Modus" (mit Zahl
der ausstehenden Änderungen), „N Änderungen werden übertragen…", online
nichts. Antippen prüft sofort. `syncing` zeigt der Chip erst, wenn es 1,5 s
anhält (`SYNCING_DISPLAY_DELAY_MS`): Online ist jeder Schreibvorgang einen
Moment unbestätigt, der Chip würde sonst bei jedem Speichern aufblitzen. Der
Store selbst meldet `syncing` sofort.

Firestore erkennt seine Verbindung unabhängig vom Ping. Der Chip kann deshalb
einen Moment früher auf online springen, als das SDK überträgt; die Meldung
„Änderungen wurden synchronisiert" (`useOfflineSync`) wartet auf
`waitForPendingWrites` und kommt erst, wenn wirklich alles bestätigt ist.

## Regel: Dialoge warten nie auf den Server

Firestore läuft mit `persistentLocalCache`. Ein Schreibvorgang landet sofort im
lokalen Cache und in einer Warteschlange, die beim Reconnect übertragen wird —
auch über ein Neuladen hinweg. Das Versprechen, das `setDoc` & Co. zurückgeben,
erfüllt sich aber erst mit der **Bestätigung des Servers**, offline also nie.
Ein Dialog, der vor dem Schließen `await setDoc(...)` schreibt, bleibt offline
auf „Speichern…" stehen.

Deshalb gilt für neuen Code im Client:

- Schreiben über die lokalen Helfer aus `src/lib/firestoreClient.ts`:
  `addDocLocal`, `setDocLocal`, `updateDocLocal`, `deleteDocLocal`,
  `commitBatchLocal`, `commitInBatchesLocal`. Sie kehren sofort zurück.
- Neue Dokumente bekommen ihre ID auf dem Gerät: `addDocLocal` erzeugt die
  Referenz per `doc(collection)` und gibt sie gleich zurück. Wer die ID
  braucht (Einsatz auswählen, Folgeeintrag verknüpfen), hat sie sofort.
- Die wartenden Varianten (`addDoc`, `setDoc`, …) nur, wo das Ergebnis des
  Servers wirklich gebraucht wird. `runTransaction` (Verrechnung, laufende
  Nummern) geht ohnehin nur online.

Was die Helfer tun:

1. Sie rufen das SDK **synchron** auf. Damit steht der Schreibvorgang im Cache,
   bevor der Aufruf zurückkehrt. Prüffehler (etwa ein `undefined`-Feld) wirft
   das SDK synchron; sie kommen beim Aufrufer an.
2. Sie gehen **nicht** über `withFreshAuth`. Das wartet vorher auf
   `ensureFreshAuth`, und ein ablaufendes Token heißt dort
   `getIdToken(true)` plus die Server Action `firebaseTokenLogin` — offline
   also Warten aufs Netz, und so lange stünde der Schreibvorgang nicht einmal
   im Cache. Firestore holt sich sein Token selbst.
3. Erst wenn der Server mit einem Auth-Fehler ablehnt **und** das Gerät online
   ist (`isOffline()` aus `connectivity.ts`), wird die Anmeldung erneuert und
   der Schreibvorgang genau einmal wiederholt. Ein Batch wird nicht wiederholt:
   Ein `WriteBatch` lässt sich nur einmal committen.
4. Das Versprechen der Server-Bestätigung zählt weiter in `pendingWrites.ts`
   mit; daraus entsteht der Zustand `syncing` im Status-Chip.
5. Jede verbleibende Ablehnung landet in `src/lib/syncErrors.ts`.

Folgeschritte, die das Netz brauchen und nichts zum Speichern beitragen —
Straßen-Routing und Höhenprofil einer Leitung (`ensureConnectionDerived`), die
Terminplanung der Atemschutzwarnungen (`planeUeberwachungWarnung`), die
Push-Registrierung —, werden nicht abgewartet. Sonst hinge der Dialog an deren
Zeitüberschreitung.

## Abgelehnte Schreibvorgänge

Die Firestore-Regeln prüft erst der Server, offline also erst beim Reconnect.
Lehnt er ab, nimmt das SDK die Änderung still aus dem Cache: Der Eintrag
verschwindet im Nachhinein, und ohne eigene Anzeige merkt es niemand.

`syncErrors.ts` hält deshalb je Ablehnung Pfad, Art (`add`, `set`, `update`,
`delete`, `batch`), Zeitpunkt, Fehlercode und Meldung. Der Speicher lebt nur im
Arbeitsspeicher: Die Wiederholung ist eine Closure über den ursprünglichen
Schreibvorgang, und die übersteht kein Neuladen. Er fasst höchstens 100
Einträge.

Angezeigt wird das im `NetworkStatusChip` der Kopfzeile (`SyncErrorsChip`): ein roter Chip „N
Änderungen nicht übertragen". Ein Klick öffnet `SyncErrorsDialog` mit den
Einzelheiten und je Eintrag „Erneut versuchen" (setzt denselben Schreibvorgang
noch einmal ab; scheitert er wieder, steht er wieder in der Liste) und
„Verwerfen".

## Synchronisations-Symbol am Eintrag

Im Einsatztagebuch und an der Druckabfrage zeigt ein kleines Wolkensymbol, dass
ein Eintrag erst auf dem Gerät liegt. Quelle ist
`snapshot.metadata.hasPendingWrites` eines eigenen Listeners mit
`includeMetadataChanges: true` (`usePendingDocIds`, Symbol `PendingSyncIcon`). Er hängt bewusst nicht am
allgemeinen `useFirestoreQuery`: Metadaten-Änderungen lösten dort für jede
Liste der App zusätzliche Renders aus. Firestore teilt sich für dieselbe
Abfrage ein Target, der zweite Listener kostet also keinen zweiten Abruf.

## Server Actions und Storage

Firestore-Schreibvorgänge reiht das SDK selbst ein. Alles andere — Server
Actions und Uploads in den Firebase Storage — scheitert offline schlicht.
Jede Server Action im Client-Pfad gehört deshalb in eine von drei Gruppen:

| Gruppe | Beispiele | Verhalten offline |
| --- | --- | --- |
| Nachholen | `planeUeberwachungWarnung`, `syncGeraetVerbrauch` (Verbrauch von Material im Einsatz abbuchen), Anhänge am Einsatz und an Elementen | Warteschlange, beim Reconnect abgearbeitet |
| Firestore lesen | Atemschutz-Gerätebestand (`useAtemschutzGeraete`), Geräte & Material (`useGeraete`) | liest ohnehin aus dem Cache |
| Nur online | KI-Assistent, Verrechnung (`runTransaction`), Blaulicht-SMS-Import und Duplikatsprüfung, Mail-Versand, PDF über den Server, Fahrtenbuch, Mängel, Drive-Fotos, Downloads und KI-Zusammenfassung im Sybos-Übertrag, Verwaltung | erkennbar deaktiviert, mit Hinweis |

Der Gerätebestand wurde schon vorher clientseitig gelesen; `atemschutzStammdaten.ts`
ist `server-only` und dient nur Server Actions (Import, Mangel, Verrechnung), die
ohnehin nur online laufen. Die Firestore-Regeln erlauben Gruppenmitgliedern das
Lesen von `atemschutzGeraet` (`fahrtenbuchMember()`).

`syncGeraetVerbrauch` ist bewusst ein **Abgleich**, keine einmalige Buchung: Die
Action liest den `geraetEinsatz`-Eintrag beim Abarbeiten neu und bucht nur die
Differenz zu den schon vorhandenen Buchungen dieses Eintrags. Ein doppelt
abgearbeiteter Eintrag bucht deshalb nichts doppelt, und ein offline geänderter
oder gelöschter Verbrauch braucht keinen eigenen Storno-Eintrag in der
Warteschlange — derselbe Typ wird einfach noch einmal eingereiht. Details:
[geraete-lager.md](geraete-lager.md).

### Warteschlange (`src/lib/offlineQueue.ts`)

- **IndexedDB**, native API, eine Datenbank `ffnd-offline-queue`. Sie übersteht
  Neuladen und Neustart; ohne IndexedDB fällt sie auf den Arbeitsspeicher zurück.
- **Handler statt Funktionen:** Ein Eintrag trägt `type` und `payload`; der Code
  registriert zum Typ einen Handler. Die Handler registriert
  `offlineQueueHandlers.ts` app-weit (über `useOfflineQueue` im
  `ConnectivityProvider`), damit auch abgearbeitet wird, wenn die Seite, die
  eingereiht hat, längst zu ist.
- **Abarbeiten** der Reihe nach: beim Start der App (Einträge eines früheren
  Laufs) erst nach einem echten Ping — vor dem ersten gilt nur
  `navigator.onLine` —, bei jedem Wechsel auf erreichbar (`onReconnect`),
  sobald die Anmeldung am Server bestätigt ist, beim Zurückkehren in den
  Vordergrund und nach einem Fehlschlag bei erreichbarem Server mit wachsendem
  Abstand (30 s bis 5 min). Ohne diese Wiederholung bliebe ein gescheiterter
  Eintrag bei stabiler Verbindung liegen, denn `onReconnect` feuert dann nicht
  mehr. Ein Aufruf während eines Durchlaufs löst danach einen weiteren aus.
- **Zeitgrenze je Eintrag** (eine Minute je Action, zehn Minuten je Upload):
  Ein hängender Upload blockierte sonst jeden späteren Durchlauf.
- **Vorbereitung vor jedem Durchlauf** (`prepareQueueRun`): erst
  `waitForPendingWrites` mit Zeitgrenze (`firestoreSync.ts`), denn die
  nachgeholte Warnungsplanung liest den Trupp per Admin SDK — ohne Warten sähe
  sie den Stand vor dem Funkloch oder gar keinen Trupp, meldete `nothingDue`
  und der Eintrag wäre verbraucht. Dann `ensureFreshAuth`: Nach langer
  Funkstille sind Token und NextAuth-Sitzung abgelaufen. Dasselbe Warten steht
  vor `useReplanWarningsOnReconnect`.
- **Je Benutzer:** Jeder Eintrag trägt die UID dessen, der ihn eingereiht hat;
  abgearbeitet und angezeigt werden nur die des angemeldeten Benutzers. Auf
  einem geteilten Tablet lädt so nie B die Datei von A mit seinem Token hoch.
  Die Einträge von A bleiben liegen, bis A sich wieder anmeldet.
- **Erst nach der Anmeldung am Server:** Abgearbeitet wird erst, wenn Firebase
  Auth den Benutzer kennt und `authSource === 'server'` ist. Beim
  Android-Kaltstart hat die WebView anfangs keinen Benutzer, und mit Rechten
  aus dem Zwischenspeicher scheiterte jeder Versuch an der Anmeldung.
- **Idempotent:** Ein Eintrag mit demselben Schlüssel ersetzt den vorigen. Die
  Warnungsplanung hat den Schlüssel `planeUeberwachungWarnung:<Einsatz>:<Trupp>` —
  fünf Druckabfragen offline ergeben eine Planung, und die liest den Trupp am
  Server frisch.
- **Fehler:** Scheitert ein Handler am fehlenden Netz oder an der Anmeldung
  (`storage/unauthorized`, `storage/unauthenticated`), bleibt der Eintrag liegen
  und zählt nicht als Versuch. Andere Fehler zählen; nach fünf Versuchen wird der
  Eintrag verworfen und in der Fehlerliste (`syncErrors.ts`, Art `action` bzw.
  `upload`) mit „Erneut versuchen" gemeldet.
- `runOrQueue(type, payload)` führt online sofort aus und reiht offline — oder
  wenn der Aufruf am Netz scheitert — ein. Ein Fehler bei erreichbarem Server
  kommt beim Aufrufer an.

### Upload-Warteschlange (`src/lib/uploadQueue.ts`)

`FileUploader` bekommt ein `offlineTarget` (Dokumentpfad und Array-Feld). Offline
— oder wenn ein Upload mittendrin am Netz scheitert — legt er die Datei samt
Ziel in die Warteschlange; IndexedDB speichert den Blob direkt. Beim Reconnect
wird hochgeladen, und **erst danach** kommt die Referenz (`gs://…`) per
`arrayUnion` ins Dokument. Vorher stünde dort ein Verweis auf eine Datei, die es
noch nicht gibt. Bis dahin zeigt der Uploader einen Platzhalter „wartet auf
Upload", der sich verwerfen lässt (`removeQueued`).

Die Referenz schreibt `updateDocLocal`, nicht `setDoc` mit `merge`: Ist das
Dokument inzwischen gelöscht, soll kein Rumpfdokument entstehen; die Ablehnung
erscheint in der Fehlerliste.

Ohne Ziel — ein neues Element, das noch kein Dokument hat — ist der Upload
offline deaktiviert.

### Nur online (`OnlineOnly`)

`<OnlineOnly>` aus `src/components/site/OnlineOnly.tsx` deaktiviert einen Knopf
offline und legt den Hinweis „Nur mit Internetverbindung verfügbar" als Tooltip
darüber (samt `<span>`, siehe CLAUDE.md). `useOnlineOnly()` liefert Zustand und
Text für eigene Fälle, etwa den KI-Assistenten, der ein laufendes Gespräch auch
offline noch beenden lässt.

Der `EinsatzDialog` überspringt offline den Blaulicht-SMS-Import (mit Hinweis im
Dialog) und die Duplikatsprüfung (mit Hinweis beim Speichern). Der Einsatz
entsteht trotzdem — im Einsatz geht das Anlegen vor.

## Kaltstart ohne Netz

Damit die App nach einem Neustart im Flugmodus ohne Login-Bildschirm aufgeht,
müssen drei Dinge offline vorhanden sein:

1. **Die Seite selbst.** Der Service Worker hält eine App-Shell je Build vor,
   die nach der Anmeldung im Hintergrund vorgewärmt wird — alle Seiten aus
   [appShellRoutes.ts](../src/common/appShellRoutes.ts) und die des aktuellen
   Einsatzes —, und baut die Seiten eines offline angelegten Einsatzes aus
   denen eines anderen. Für die wenigen ausgenommenen Routen gibt es die
   Rückfallseite `/offline`. Details: [service-worker-pwa.md](service-worker-pwa.md).
2. **Der Firebase-Benutzer.** Firebase Auth lädt ihn aus IndexedDB, auch mit
   abgelaufenem ID-Token; ein Netzfehler beim Neuladen des Profils behält ihn.
   Firestore liest damit aus dem Cache dieses Benutzers und reiht
   Schreibvorgänge ein.
3. **Die Rechte der Oberfläche.** Die kommen sonst vom Server. Der
   Zwischenspeicher der letzten Anmeldung (`offlineAuthCache.ts`, 90 Tage, an
   die UID gebunden) springt ein, wenn die Anmeldung am Server scheitert, nach acht
   Sekunden nicht antwortet oder die App schon weiß, dass sie offline ist.
   `getMyGroupsFromServer` hat dieselbe Zeitgrenze. Beim Reconnect wird die
   Anmeldung am Server nachgeholt. Der Status-Chip nennt im Tooltip, dass die
   Rechte aus dem Zwischenspeicher stammen.

**Warum der Zwischenspeicher vertretbar ist:** Er öffnet nur die Oberfläche,
er gewährt keine Daten. Gelesen wird aus dem Firestore-Cache genau dieses
Firebase-Benutzers, also nur, was er online schon lesen durfte; geschrieben
wird über Firestore, und die Regeln prüfen beim Synchronisieren gegen das
echte ID-Token. Wer sich die Einträge in localStorage selbst zurechtbiegt,
sieht ein Admin-Menü, dessen Aktionen alle am Server scheitern — und offline
erfasste Schreibvorgänge ohne Recht erscheinen in der Fehlerliste. Damit die
Frist nicht offline endlos weiterläuft, schreibt nur eine echte Antwort des
Servers den Zwischenspeicher, nie er sich selbst; ein Zeitstempel in der
Zukunft gilt als ungültig, Gäste behalten ihn höchstens bis
`firecallExpiresAt`, Abmelden und eine abgelehnte Anmeldung löschen ihn.
Ausführlich: [berechtigungen.md](berechtigungen.md#zwischenspeicher-der-anmeldung-für-den-kaltstart-ohne-netz).

### Android-App

Die Capacitor-App lädt ihre Seiten **vom Server** (`server.url` in
`capacitor/capacitor.config.ts`, `webDir: 'empty'`), nicht aus dem APK. Die
WebView registriert denselben Service Worker; die App-Shell wirkt dort also
genauso.

Offen ist die Anmeldung. Das JS-SDK legt seinen Benutzer wie im Browser in
IndexedDB ab (Origin `einsatz.ffnd.at`), und abgemeldet wird nur von Hand
(`fbSignOut`). Behält die WebView diesen Speicher über einen Prozessstart,
geht der Kaltstart ohne Netz wie im Browser. In #817 kam die WebView auf einem
Gerät aber **ohne** Benutzer hoch; ob das bei jedem Neustart passiert oder ein
einmal verlorener Speicher war, ist an keinem Gerät belegt. Ohne Benutzer hilft
offline nichts: Die Wiederherstellung (`useFirebaseSessionRecovery`) tauscht
das native ID-Token über eine Server Action gegen ein Custom Token, der
Zwischenspeicher verlangt einen Firebase-Benutzer mit derselben UID, und ohne
Benutzer schrieben Firestore-Schreibvorgänge in die Warteschlange des
anonymen Benutzers, die der Server beim Synchronisieren ablehnt.

Deshalb:

- **Offline wartet die Wiederherstellung auf den Reconnect**, statt vergeblich
  zu fragen, und ein Versuch, der am Verbindungsabbruch scheitert, wird dort
  nachgeholt. Vorher blieb die App nach dem Reconnect bis zum Neuladen ohne
  Daten. Der wartende Versuch hängt an der Lebensdauer der Komponente, nicht
  am Effekt — NextAuth wechselt beim Reconnect gern den Status.
- **Crashlytics zählt den Fall:** Kommt die WebView in der App ohne Benutzer
  hoch, geht ein Non-Fatal `webview started without firebase user` (mit
  `offline`) hinaus. Erst diese Zahl sagt, ob ein eigener Weg nötig ist, etwa
  ein natives Ablegen des JS-SDK-Benutzers.

#### Hauptseite ohne Netz (`MainActivity`, `OfflineLoadPolicy`)

Das Overlay „Einsatzkarte wartet auf Netzwerk…" ist älter als der
Offline-Modus: #514 führte es ein, damit die App bei einem Funkloch oder beim
Wechsel WLAN/LTE nicht auf der Fehlerseite von Chromium hängen bleibt
([Plan](plans/2026-04-21-native-app-stability-design.md)). Ein
`NetworkCallback` und ein Neuversuch nach fünf Sekunden kamen gleich mit und
flogen in #515 wieder hinaus: Sie luden beim Netzwechsel die laufende Seite
neu, weil der Merker `offlineOverlayShown` „Overlay" sagte, obwohl längst die
Karte stand. Seither blieb nur der Knopf.

Scheitert die Hauptseite am Netz, meldet WebView `onReceivedError`. Das heißt
in der App nicht, dass nichts angezeigt wird: Läuft der Service Worker beim
Kaltstart noch nicht, schickt Chromium die Netzanfrage der Navigation parallel
zu seinem Start ab. Offline scheitert sie und wird gemeldet, während der
Worker die Seite aus seinem Cache liefert. Früher ersetzte das Overlay
„Einsatzkarte wartet auf Netzwerk…" sofort genau diese Seite, und erst
„Erneut versuchen" brachte sie zurück — nun mit laufendem Worker.

- **Erst nachsehen, dann das Overlay.** Nach anderthalb Sekunden prüft
  `PROBE_SCRIPT`, was im WebView steht: eine Seite der App (Next.js-Skripte
  oder die eingebaute Offline-Seite des Workers mit
  `<meta name="einsatzkarte-offline">`) bleibt stehen; solange die Navigation
  noch läuft, wird weiter gewartet (höchstens zehn Blicke). Nur sonst kommt
  das Overlay. Steht trotz Fehler eine Seite, geht einmal je Prozess ein
  Non-Fatal an Crashlytics — er belegt die Erklärung oben im Feld.
- **Das Overlay wartet wirklich.** Zwei Sekunden nach dem Einblenden folgt ein
  erster Neuversuch, genau der Knopfdruck von früher. Danach lädt es neu,
  sobald `ConnectivityManager` ein geprüftes Netz meldet
  (`ACCESS_NETWORK_STATE`), und bei bestehendem Netz alle 30 Sekunden. Ohne
  Netz wird nicht im Takt versucht: Jeder Fehlschlag zeigte kurz die
  Fehlerseite von Chromium. **Jedes automatische Neuladen sieht vorher
  ins WebView** (`mayAutoReload`): Steht eine Seite der App, wird nicht
  geladen, sondern nur der Zustand aufgeräumt. Das schließt den Fehler aus
  #515 aus, statt sich wieder auf einen Merker zu verlassen.
- **Neuversuche navigieren auf die gescheiterte Adresse.** Ein
  `location.reload()` lud nur die Overlay-Seite selbst neu, die per
  `loadDataWithBaseURL` kam; das galt auch für das Herunterziehen.
- **Das Overlay kommt nicht mehr synchron aus `onReceivedError`.** Die Seite
  konkurrierte mit der Fehlerseite, die Chromium gerade übernimmt, und blieb
  mitunter auf der Strecke — zurück blieb „Webseite nicht verfügbar" ohne
  jeden Knopf, der Fall einer Seite, die noch nie im Cache lag.
- **`ERROR_UNKNOWN` ohne geprüftes Netz zählt als Funkloch.** `ERR_FAILED`
  und `ERR_NETWORK_CHANGED` landen dort; vorher bekamen sie den Dialog mit
  „URL ändern". Mit Netz bleibt es beim Dialog.
- **Die eingebaute Offline-Seite des Workers (503) bekommt keinen Dialog.**
  Sie trägt den Header `X-Einsatzkarte-Offline-Fallback: 1` und hat selbst
  „Erneut versuchen"; eine echte 5xx des Servers trägt ihn nicht.

### Kein Neuladen beim Reconnect

`SerwistProvider` lädt in der Voreinstellung (`reloadOnOnline`) bei jedem
`online`-Ereignis die ganze Seite neu — die Karte baute sich auf, sobald das
Netz zurückkam. In `src/app/layout.tsx` ist das abgeschaltet: Firestore, die
Warteschlangen und die Wiederherstellung der Anmeldung holen ihren Teil über
`onReconnect` selbst nach.

## Daten für den Offline-Fall vorbereiten

### Firestore-Cache vorwärmen (`src/lib/firestoreWarmup.ts`)

Der persistente Cache beantwortet offline jede Abfrage, aber nur mit
Dokumenten, die schon einmal geladen wurden. Wer den Einsatz auf der Karte
öffnet und dann ohne Netz auf die Atemschutz-Seite wechselt, sähe dort sonst
eine leere Liste. `useFirestoreWarmup` (in `AppProviders` neben
`useAppShellWarmup`) liest deshalb drei Sekunden nach dem Öffnen eines
Einsatzes einmal vom Server:

- **Einsatz:** das Einsatz-Dokument und die Untersammlungen `item` (Elemente,
  Einsatztagebuch, Fahrzeuge), `layer`, `crew` (Besatzung), `location`,
  `mapLayer`, `atemschutzTrupp`, `atemschutzAusgabe`. Der Verlauf (`history`)
  fehlt bewusst — groß und offline nicht gefragt.
- **Gruppe des Einsatzes:** Atemschutz-Gerätebestand, Fahrzeuge und Personen
  des Fahrtenbuchs, Stammdaten (`groupConfig/stammdaten`) und die eigene
  Flotte (`kostenersatzVehicles`, global), nach der die Besatzung die eigenen
  Fahrzeuge vorreiht.
- **Gruppen des Benutzers:** die Einsatzliste der letzten 28 Tage, mit
  denselben Bedingungen wie die Einsatzliste, damit derselbe Index trägt.
- **Umgebung:** Hydranten-Cluster im Umkreis von 3 km um den Einsatzort.

Ganze Sammlungen ohne Filter genügen: Offline wertet das SDK jede Abfrage
lokal gegen den Cache aus, die Abfragen der Seiten müssen also nicht wörtlich
vorweggenommen werden. Es sind einmalige `getDocs`/`getDoc`, keine Listener —
bestehende Listener bleiben unberührt. Jede Abfrage steht für sich: Eine
verweigerte (Fahrtenbuch-Sammlungen liest nur, wer dort Mitglied ist) bricht
die anderen nicht ab. `warmOnce` sorgt dafür, dass je Einsatz bzw. Gruppenstand
nur einmal im Seitenleben gelesen wird; scheitert alles, darf es beim nächsten
Anlass erneut laufen. Offline wird nicht vorgewärmt.

### Kartenkacheln vorladen (`OfflineMapPreparation`)

Der Knopf „Für offline vorbereiten" steht auf der Einsatz-Detailseite
(Abschnitt „Offline-Karte", Mittelpunkt ist der Einsatzort) und im Profil
(Mittelpunkt ist der Standort des Geräts). Er lädt die Kacheln eines Quadrats
um den Mittelpunkt (Umkreis 500 m bis 3 km, Zoom 13–18, höchstens 6000
Kacheln) in den eigenen Cache `offline-tiles`, mit Fortschritt, Abbrechen und
Größenangabe. Muster ist das Vorladen des Höhenmodells.

- **Nur basemap.at.** OpenStreetMap und OpenTopoMap untersagen das Vorladen;
  die Begründung je Dienst steht in [kartenlayer.md](kartenlayer.md#offline-vorladen).
- **Die Seite schreibt, der Service Worker liest.** So sind Fortschritt und
  Abbruch unmittelbar. `OfflineTilesFirst` in `src/worker/patterns.ts` fragt
  bei basemap.at zuerst `offline-tiles` und fällt sonst auf den kurzlebigen
  Cache `basemap` zurück — dort hält `oneDayCachePlugin` nur 64 Einträge,
  vorgeladene Kacheln wären darin nach Minuten verdrängt.
- **`ignoreVary`:** basemap.at antwortet mit `Vary: Origin`. Vorgeladen wird
  per CORS (mit `Origin`), Leaflet fragt per `<img>` (ohne) — ohne
  `ignoreVary` träfe der Cache nie.
- **Kontingent:** Läuft beim Vorladen das Kontingent voll, wird der
  Kachelvorrat geleert und gemeldet; im Service Worker übernimmt
  `registerOfflineTilePurge` dasselbe als `purgeOnQuotaError`. Der Vorrat ist
  das Erste, was geopfert wird — vor App-Shell, Firestore-Cache und
  Warteschlangen im selben Kontingent.
- Der Vorrat altert nicht von selbst; er wird mit „Löschen" geleert oder bei
  der nächsten Vorbereitung ergänzt (vorhandene Kacheln werden übersprungen).

### Leere Listen offline kennzeichnen (`OfflineListHint`)

Eine nie geladene Abfrage liefert offline eine leere Liste statt eines
Fehlers. `OfflineListHint` zeigt bei einer leeren Liste aus dem Cache
„Offline – keine Einträge auf diesem Gerät …", bei einer gefüllten einen
knappen Chip „Offline – evtl. unvollständig". Eingebaut in Einsatzliste,
Einsatztagebuch, Atemschutzsammelplatz und Atemschutzüberwachung.

Die Quelle ist `snapshot.metadata.fromCache`, durchgereicht über
`useFirestoreQuery` bzw. `useFirebaseCollectionState`. Diese Listen
abonnieren mit `includeMetadataChanges` — ohne meldet der Listener den
Wechsel vom Cache- zum Server-Stand nicht, wenn sich kein Dokument ändert,
und `fromCache` bliebe nach dem ersten Cache-Ergebnis stehen. Angezeigt wird
nur im Offline-Zustand des Verbindungsstatus: Online ist ein Cache-Ergebnis
der kurze Moment vor der Antwort des Servers.

## Atemschutzüberwachung offline

Offline kommt keine Atemschutzwarnung vom Server: Die Terminplanung
(`planeUeberwachungWarnung`) ist eine Server Action, und FCM erreicht das
Gerät nicht. Die offene Überwachungsseite warnt deshalb selbst — das tat sie
schon vorher im Sekundentakt (`useUeberwachungHinweise`), dazu kommen vier
Bausteine. Hintergrund in
[atemschutzueberwachung.md](atemschutzueberwachung.md#offline-warnt-das-gerät-selbst).

- **Wecker auf den nächsten Termin** (`localWarningSchedule.ts`): Ein einzelner
  `setTimeout` auf genau die nächste fällige Warnung, gerechnet mit
  `naechsteWarnung` wie am Server. Der Sekundentakt (`setInterval`) wird im
  Hintergrund auf einmal je Minute gedrosselt; der Wecker nicht.
- **Wake Lock** (`useWakeLock`): Solange ein Trupp im Einsatz ist, bleibt der
  Bildschirm an; nach jeder Rückkehr auf die Seite wird die Sperre neu
  angefordert, weil der Browser sie beim Verbergen freigibt.
- **Native Benachrichtigung in der App** (`src/lib/nativeLocalNotifications.ts`):
  je Trupp der nächste Termin beim Betriebssystem hinterlegt, damit er den
  gesperrten Bildschirm erreicht (`@capacitor/local-notifications`; eine
  ältere App ohne das Plugin übergeht das per Laufzeitprüfung). Pünktlich auf
  die Minute nur mit der Erlaubnis für exakte Alarme, siehe
  [atemschutzueberwachung.md](atemschutzueberwachung.md#offline-warnt-das-gerät-selbst).
- **Nachplanen beim Reconnect** (`useReplanWarningsOnReconnect`): für alle
  Trupps im Einsatz, über `planWarningOrQueue` und damit die Warteschlange —
  erst nachdem Firestore die offline geschriebenen Änderungen übertragen hat
  (`waitForFirestoreSync`, mit Zeitgrenze).

## Grenzen

- **Kein Abgleich zwischen Geräten ohne Internet.** Firestore synchronisiert
  über den Server. Zwei Geräte, die gleichzeitig offline sind, sehen die
  Einträge des anderen erst nach dem Reconnect. Das ist eine Frage der
  Ausrüstung (LTE-Router im Fahrzeug), nicht der Software. Für die
  Atemschutzüberwachung heißt das: Überwacht wird an dem Gerät, an dem die
  Druckabfragen erfasst werden.
- **Bei Konflikten gewinnt der letzte Schreibvorgang, Feld für Feld.** Listen
  deshalb mit `arrayUnion` ergänzen (wie die Druckabfragen und die Anhänge),
  nie das ganze Array überschreiben. Ein offenes Element-Formular, das nach
  einem nachgeholten Upload gespeichert wird, überschreibt das Anhangsfeld mit
  seinem alten Stand — der Fall ist bekannt und selten.
- **Ablehnung durch die Regeln erst beim Synchronisieren.** Die Fehlerliste
  ist deshalb Pflicht. Sie lebt im Arbeitsspeicher: Nach einem Neuladen sind
  abgelehnte Einträge weg, nur die Warteschlange der Server Actions und
  Uploads überdauert.
- **Ungeladenes fehlt.** Was nie online geladen wurde, ist offline nicht da;
  das Vorwärmen deckt den geöffneten Einsatz und seine Gruppe ab, nicht den
  Verlauf (`history`), das Füllprotokoll oder die Verrechnung. Leere Listen
  sind gekennzeichnet, nicht gefüllt.
- **Kartenkacheln** nur von basemap.at vorladbar; OpenStreetMap, OpenTopoMap,
  Burgenland-WMS und WISA gibt es offline nur, soweit sie zuvor angesehen
  wurden und noch im kurzlebigen Cache liegen.
- **Straßen-Routing und Höhenprofil** einer Leitung scheitern offline und
  werden nicht eingereiht. Die Leitung bleibt dann bei der Luftlinie; der
  Fehlschlag ist an der Signatur vermerkt, ein neuer Versuch kommt erst, wenn
  sich die Leitung ändert.
- **Einige Schreibvorgänge warten noch auf den Server:** Kostenersatz
  (`useKostenersatzMutations`, Mailvorlagen), die Token-Verwaltung und der
  Backup-Import. Das sind Arbeiten nach dem Einsatz oder am Schreibtisch.
- **Atemschutzwarnungen offline** kommen nur von dem Gerät, auf dem die
  Überwachungsseite offen ist (oder zuletzt offen war: In der Android-App
  bleiben die beim Betriebssystem hinterlegten Termine stehen). Ohne die
  Erlaubnis für exakte Alarme können sie sich dort um Minuten verspäten; die
  Screen Wake Lock API fehlt in der WebView vermutlich.
- **Android-Kaltstart ohne Netz** ist nur teilweise geprüft (siehe oben): Er
  hängt daran, ob die WebView ihren Firebase-Benutzer über einen Prozessstart
  behält. Dass der gemeldete Fehler der Hauptseite von der parallelen
  Netzanfrage beim Start des Service Workers kommt, ist eine Ableitung aus
  dem Verhalten, an keinem Gerät nachgestellt; der Non-Fatal in Crashlytics
  soll es belegen.
- **Seitenwechsel offline laden die Seite neu — außer zwischen den
  Einsatzseiten.** Karte und Abschnitte unter `/einsatz/<id>[/<abschnitt>]`
  wechseln per `history.pushState` ohne Server, auch zu einem anderen Einsatz (siehe
  [service-worker-pwa.md](service-worker-pwa.md#wechsel-zwischen-einsatzseiten-ohne-neuladen)).
  Für alle anderen Seiten scheitert der RSC-Abruf einer Client-Navigation
  (nach höchstens acht Sekunden, kurz nach einem Ausfall nach zwei), Next.js
  navigiert hart, und die App-Shell antwortet. Der Zustand der Seite (offene
  Dialoge, Eingaben) geht dabei verloren.
