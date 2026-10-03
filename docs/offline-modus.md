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
