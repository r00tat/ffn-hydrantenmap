# Einsatz-Fotos im Google Drive

Neben den Anhängen (Firebase Storage, `firecall.attachments`) gibt es auf der
Einsatz-Detailseite einen zweiten Ablageort: ein Google Shared Drive der
Feuerwehr, Struktur `<Basisordner>/YYYY/YYYY-MM-DD_Einsatzname`.

- **Die Bytes gehen nie über Cloud Run.** Der Server legt nur den Ordner an und
  eröffnet eine resumable Upload-Session
  ([driveFileActions.ts](../src/components/drive/driveFileActions.ts)); der Browser
  lädt direkt zu Google. Der `Origin`-Header beim Eröffnen ist das, woran die
  Session ihre CORS-Erlaubnis knüpft — ohne ihn scheitert jeder Upload im
  Browser. Der Dienst hat 1 GiB und hat sich beim Fahrtenbuch-Export schon
  einmal daran verschluckt; genau das soll hier nicht wieder passieren.
- **Viele Fotos auf einmal: Pakete, begrenzte Parallelität, Wiederholung.**
  Drive drosselt Schreibzugriffe je Konto (grob ab drei je Sekunde) mit 403
  `userRateLimitExceeded` oder 429, und jede Upload-Session legt eine Datei an.
  Früher gingen alle Sessions per `Promise.all` auf einmal hinaus, und ein
  einziger gedrosselter Aufruf ließ den ganzen Stapel scheitern — ab etwa zehn
  Fotos, je nach Lage. Jetzt fragt der Browser die Sessions in Paketen zu zehn
  an (`uploadFilesToDrive.ts`, die Grenze des Servers von 25 gilt je Aufruf),
  der Server eröffnet höchstens zwei gleichzeitig und wiederholt gedrosselte
  Antworten mit Backoff
  ([uploadSession.ts](../src/server/drive/uploadSession.ts)). Hochgeladen
  wird mit höchstens drei Dateien gleichzeitig. Bricht ein Upload ab oder wird
  gedrosselt, fragt der Browser den Stand der Session ab und schickt nur den
  Rest ([uploadToDriveSession.ts](../src/components/drive/uploadToDriveSession.ts)).
  Scheitert ein Paket, laufen die übrigen weiter; gemeldet wird die Zahl der
  nicht hochgeladenen Dateien.
- **Der Basisordner steht je Gruppe in `driveConfig`**, für Clients gesperrt,
  gepflegt unter `/admin/drive`. Keine Konfiguration heißt: die Funktion ist für
  die Gruppe aus. Es gibt bewusst kein zusätzliches `enabled`-Flag.
- **Der Service Account muss von Hand als Mitglied ins Shared Drive.** Terraform
  verwaltet keine Drive-Freigaben. Geschrieben wird mit
  [driveAuth.ts](../src/server/auth/driveAuth.ts) — bewusst **nicht** mit
  `createWorkspaceAuth`, das impersoniert `EINSATZMAPPE_IMPERSONATION_ACCOUNT`
  und bräuchte Domain-Wide Delegation.
- **Die `thumbnailLink` der Drive-API funktioniert im Browser unserer Nutzer
  nicht** — sie setzt Drive-Zugriff des angemeldeten Google-Nutzers voraus.
  Deshalb der Proxy unter
  `/api/einsatz/[firecallId]/drive/[fileId]/thumbnail`. Der prüft, dass die
  Datei im Ordner *dieses* Einsatzes liegt; ohne diese Prüfung wäre er ein
  Leseproxy auf das ganze Shared Drive.
- **`driveFolderId` am Einsatz ist die Wahrheit**, nicht der Ordnername. Wird
  der Einsatz umbenannt oder umdatiert, benennt der nächste Upload den Ordner um
  bzw. verschiebt ihn in den richtigen Jahresordner.
