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
