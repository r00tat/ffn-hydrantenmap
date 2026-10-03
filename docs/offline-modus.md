# Offline-Modus

Die App soll ohne Internetverbindung einsatzfähig bleiben (Issue #839). Dieses
Dokument wächst mit den Phasen des Issues; hier steht bisher, wie geschrieben
wird und wie abgelehnte Schreibvorgänge sichtbar werden.

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
| Nachholen | `planeUeberwachungWarnung`, Anhänge am Einsatz und an Elementen | Warteschlange, beim Reconnect abgearbeitet |
| Firestore lesen | Atemschutz-Gerätebestand (`useAtemschutzGeraete`) | liest ohnehin aus dem Cache |
| Nur online | KI-Assistent, Verrechnung (`runTransaction`), Blaulicht-SMS-Import und Duplikatsprüfung, Mail-Versand, PDF über den Server, Fahrtenbuch, Mängel, Drive-Fotos, Verwaltung | erkennbar deaktiviert, mit Hinweis |

Der Gerätebestand wurde schon vorher clientseitig gelesen; `atemschutzStammdaten.ts`
ist `server-only` und dient nur Server Actions (Import, Mangel, Verrechnung), die
ohnehin nur online laufen. Die Firestore-Regeln erlauben Gruppenmitgliedern das
Lesen von `atemschutzGeraet` (`fahrtenbuchMember()`).

### Warteschlange (`src/lib/offlineQueue.ts`)

- **IndexedDB**, native API, eine Datenbank `ffnd-offline-queue`. Sie übersteht
  Neuladen und Neustart; ohne IndexedDB fällt sie auf den Arbeitsspeicher zurück.
- **Handler statt Funktionen:** Ein Eintrag trägt `type` und `payload`; der Code
  registriert zum Typ einen Handler. Die Handler registriert
  `offlineQueueHandlers.ts` app-weit (über `useOfflineQueue` im
  `ConnectivityProvider`), damit auch abgearbeitet wird, wenn die Seite, die
  eingereiht hat, längst zu ist.
- **Abarbeiten** beim Start der App (Einträge eines früheren Laufs) und bei
  jedem Wechsel auf erreichbar (`onReconnect`), der Reihe nach.
- **Idempotent:** Ein Eintrag mit demselben Schlüssel ersetzt den vorigen. Die
  Warnungsplanung hat den Schlüssel `planeUeberwachungWarnung:<Einsatz>:<Trupp>` —
  fünf Druckabfragen offline ergeben eine Planung, und die liest den Trupp am
  Server frisch.
- **Fehler:** Scheitert ein Handler am fehlenden Netz, bleibt der Eintrag liegen
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
Upload".

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
   die nach der Anmeldung vorgewärmt wird (Kernseiten und die Abschnitte des
   aktuellen Einsatzes), und baut die Seiten eines offline angelegten Einsatzes
   aus denen eines anderen. Für alles andere gibt es die Rückfallseite
   `/offline`. Details: [service-worker-pwa.md](service-worker-pwa.md).
2. **Der Firebase-Benutzer.** Firebase Auth lädt ihn aus IndexedDB, auch mit
   abgelaufenem ID-Token; ein Netzfehler beim Neuladen des Profils behält ihn.
   Firestore liest damit aus dem Cache dieses Benutzers und reiht
   Schreibvorgänge ein.
3. **Die Rechte der Oberfläche.** Die kommen sonst vom Server. Der
   Zwischenspeicher der letzten Anmeldung (`offlineAuthCache.ts`, 72 h, an die
   UID gebunden) springt ein, wenn die Anmeldung am Server scheitert, nach acht
   Sekunden nicht antwortet oder die App schon weiß, dass sie offline ist.
   `getMyGroupsFromServer` hat dieselbe Zeitgrenze. Beim Reconnect wird die
   Anmeldung am Server nachgeholt. Der Status-Chip nennt im Tooltip, dass die
   Rechte aus dem Zwischenspeicher stammen. Sicherheitsüberlegung:
   [berechtigungen.md](berechtigungen.md).

### Android-App

Die Capacitor-App lädt ihre Seiten **vom Server** (`server.url` in
`capacitor/capacitor.config.ts`, `webDir: 'empty'`), nicht aus dem APK. Die
WebView registriert denselben Service Worker; die App-Shell wirkt dort also
genauso. Offen ist die Anmeldung: Laut `useFirebaseSessionRecovery` kommt die
WebView nach einem Prozessstart **ohne** Firebase-Benutzer hoch, und die
Wiederherstellung tauscht das native ID-Token über eine Server Action
(`exchangeNativeIdTokenForFirebaseToken`). Ohne Netz bleibt die WebView damit
ohne Benutzer: Der Zwischenspeicher greift nicht (er verlangt einen
Firebase-Benutzer mit derselben UID), und der Firestore-Cache des Benutzers ist
nicht erreichbar. Der Kaltstart ohne Netz funktioniert unter Android deshalb
erst, wenn die WebView ihre Firebase-Anmeldung selbst hält.

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
  des Fahrtenbuchs, Stammdaten (`groupConfig/stammdaten`).
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
  gesperrten Bildschirm erreicht — nur, wenn `@capacitor/local-notifications`
  installiert ist (Laufzeitprüfung, bis dahin ein No-op).
- **Nachplanen beim Reconnect** (`useReplanWarningsOnReconnect`): für alle
  Trupps im Einsatz, über `planWarningOrQueue` und damit die Warteschlange.
