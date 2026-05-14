# Bug Report / Feature Request — Design

In-App-Meldungen (Bug oder Feature Request) mit Titel, Beschreibung, automatisch
erfasstem Kontext, Debug-Logs und optionalen Screenshots / Bild-Anhängen.
Speicherung in Firestore, Bilder in Cloud Storage, Notification per E-Mail an
eine zentral gepflegte Admin-Adresse.

## Berechtigungen

- **Submit**: jeder `authorizedUser()`.
- **Read / Status-Verwaltung**: nur `adminUser()`.
- **Mail-Empfänger**: nur server-side aus `/appConfig/bugReport` lesbar; Client darf nichts aus `appConfig` lesen.

## Datenmodell

### Firestore

```
/bugReport/{reportId}
  kind: 'bug' | 'feature'
  title: string
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'wontfix'
  createdAt: Timestamp                # serverTimestamp
  createdBy: { uid, email, displayName? }  # serverseitig aus Token gesetzt
  context: {
    url: string
    pathname: string
    buildId: string                   # NEXT_PUBLIC_BUILD_ID
    database: string                  # NEXT_PUBLIC_FIRESTORE_DB
    userAgent: string
    platform: string                  # Capacitor.getPlatform() oder 'web'
    isNative: boolean
    firecallId?: string
    firecallName?: string
    viewport: { width, height }
    locale: string
  }
  logs: DebugMessage[]                # snapshot, max. 200 letzte Einträge
  screenshots: string[]               # Storage fullPaths
  attachments: string[]               # Storage fullPaths
  notificationError?: string          # gesetzt, falls Mail nicht versendet wurde
  updatedAt?: Timestamp
  updatedBy?: { uid, email }
```

### Firestore — `/appConfig/bugReport`

```
/appConfig/bugReport
  recipientEmails: string[]
  enabled: boolean
  updatedAt: Timestamp
  updatedBy: { uid, email }
```

`/appConfig/{doc=**}` ist client-seitig sperrt (`allow read, write: if false`). Zugriff
ausschließlich über Server Actions mit `actionAdminRequired()`.

### Storage

```
/bugReports/{reportId}/{uuid}-{filename}
```

## Firestore Rules (Ergänzung)

```
match /bugReport/{doc} {
  allow create: if authorizedUser()
    && request.resource.data.createdBy.uid == request.auth.uid
    && request.resource.data.createdBy.email == request.auth.token.email
    && request.resource.data.kind in ['bug', 'feature']
    && request.resource.data.status == 'open';
  allow read, update, delete: if adminUser();
}

match /appConfig/{doc=**} {
  allow read, write: if false;
}
```

Der bestehende Fall-Through `match /{document=**}` bleibt — Admin-Zugriff für
`bugReport` ist redundant, aber der explizite Block macht die Regel lesbar.

## Storage Rules (Ergänzung)

```
match /bugReports/{reportId}/{fileName} {
  allow create: if authorizedUser();
  allow read: if adminUser();
}
```

User darf eigene Uploads erzeugen, aber nicht zurücklesen — schützt fremde
Reports und vermeidet Misuse der Liste. Die User sehen Anhänge nur direkt im
Dialog (lokale Preview), nicht über Storage.

## Submit-Flow

1. User klickt Drawer-Eintrag **"Feedback / Bug melden"** → öffnet globalen
   `<BugReportDialog />` (gemounted im `BugReportProvider` in `layout.tsx`).
   Kein Routenwechsel — aktuelle Seite bleibt im Hintergrund aktiv für Screenshot.
2. Dialog:
   - `ToggleButtonGroup` **Bug / Feature Request** (Default: Bug).
   - Hinweis-Block mit Switch **"Debug-Logging aktivieren"** (nur bei Bug, nur wenn `displayMessages === false`).
     Wirkt auf `setDisplayMessages(true)` aus `useDebugLogging()`.
   - Pflichtfelder: `Titel`, `Beschreibung`.
   - Kollabierbare Box **"Erfasste Kontextdaten"** zeigt User-Agent / Build / Logs-Anzahl etc.
   - Button **"Bildschirmaufnahme"** (nur sichtbar wenn `navigator.mediaDevices?.getDisplayMedia` existiert).
   - Button **"Bilder hinzufügen"** (`<input type=file accept=image/* multiple capture>`).
   - Thumbnail-Liste der angehängten Dateien mit Remove.
3. **Screenshot-Capture** (kein zusätzliches NPM-Paket):

   ```ts
   setMinimized(true);                          // Dialog aus dem Bild
   const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
   const video = Object.assign(document.createElement('video'), { srcObject: stream });
   await video.play();
   await new Promise(r => requestAnimationFrame(r));
   const canvas = document.createElement('canvas');
   canvas.width = video.videoWidth; canvas.height = video.videoHeight;
   canvas.getContext('2d')!.drawImage(video, 0, 0);
   const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/png'));
   stream.getTracks().forEach(t => t.stop());
   setMinimized(false);
   ```

   In Capacitor-WebView fehlt die API → Button bleibt unsichtbar.
4. **Log-Snapshot** wird einmalig beim Öffnen erstellt (`messages.slice(-200)`),
   damit nachfolgende Logs den Report nicht verschmutzen.
5. **Submit**:
   - Client erzeugt `reportId = uuid()`.
   - Lädt alle Bilder parallel via `uploadBytesResumable` zu
     `/bugReports/{reportId}/{uuid}-{filename}`, sammelt `fullPath[]`.
   - Ruft Server Action `submitBugReportAction({ reportId, kind, title, description, context, logs, screenshots, attachments })` auf.
6. **Server Action**:
   - `actionUserRequired()`.
   - `createdBy` wird **ausschließlich** aus dem Auth-Token gesetzt (Client-Input
     verworfen). `createdAt = serverTimestamp()`. `status = 'open'`.
   - Schreibt Firestore-Doc.
   - Ruft `notifyBugReport(reportDoc)` (best-effort, s. unten).
   - Liefert `{ reportId }` zurück.
7. Client: Snackbar `Danke! Dein Report wurde gesendet.`, Dialog schließt.
   Bei Fehler: Snackbar mit Retry-Button (Eingaben bleiben erhalten).

## E-Mail Notification

In `submitBugReportAction()` nach erfolgreichem Firestore-Write, best-effort
(Fehler werden nicht propagiert, sondern als `notificationError` ins Doc geschrieben).

Ablauf:

1. Server liest `/appConfig/bugReport` per Admin SDK.
2. Wenn `enabled === false` oder `recipientEmails` leer → kein Versand.
3. Versand via `createWorkspaceAuth(['gmail.send'])` + `gmail.users.messages.send`
   (wiederverwendet aus `kostenersatzEmailAction.ts`). Lokale Helper-Funktion
   `buildEmailMessage()` ohne Attachment-Part (Plain Text).
4. **Subject**:
   - `kind === 'bug'`: `[Bug] {title} — {createdBy.email}`
   - `kind === 'feature'`: `[Feature] {title} — {createdBy.email}`
5. **Body**:

   ```
   Neuer Report ({kind}):

   Titel:     {title}
   User:      {createdBy.displayName ?? createdBy.email} <{email}>
   Datum:     {createdAt}
   URL:       {context.url}
   Build:     {context.buildId} ({context.database || 'prod'})
   Plattform: {context.platform}
   Firecall:  {firecallName ?? '-'}

   Beschreibung:
   {description}

   Direkt-Link: {NEXTAUTH_URL}/admin/bug-reports/{reportId}
   ```

   Keine Anhänge — Admin öffnet den Direkt-Link im UI.

## Admin-UI

### Liste — `/admin/bug-reports` (neuer Drawer-Eintrag unter `Admin`, `admin: true`)

Server-Komponente lädt initial via `getBugReportsAction()`; danach
client-seitige Filter / Suche.

Spalten: `Datum | Typ | Titel | User | Status | # Anhänge | Build`.
Filter: `Typ (alle / bug / feature)`, `Status`, Volltext (Titel / Beschreibung).
Klick → Detail-Dialog (modal, kein Routenwechsel — gleiche Logik wie Bug-Dialog).

### Detail-Dialog

- Komplette Kontext-Box (URL, UA, Plattform, Firecall, Build).
- Beschreibung.
- Log-Buffer als kollabierbare Liste (`message + level + properties` je Eintrag).
- Bilder-Galerie über `getDownloadURL` (`getStorage()` Admin-side oder Client-side mit Admin-Auth).
- Status-Dropdown → `updateBugReportStatusAction(reportId, status)` (setzt `updatedAt` / `updatedBy`).

### Config-Sektion (oben auf der Liste)

- Chips-Input für `recipientEmails`.
- Switch `Notifications enabled`.
- Speichern → `updateBugReportConfigAction(config)`.
- Initial-Load via `getBugReportConfigAction()`.

## Datei-Layout

Neu:

```
src/common/
  bugReport.ts                                  # Types, Konstanten, Status-Enum

src/components/bugReport/
  BugReportProvider.tsx                         # globaler Dialog + open()-Context
  BugReportProvider.test.tsx
  BugReportDialog.tsx                           # UI
  BugReportDialog.test.tsx
  captureScreenshot.ts                          # getDisplayMedia → Blob
  captureScreenshot.test.ts
  collectContext.ts                             # build/firecall/platform/viewport
  collectContext.test.ts
  uploadBugReportFile.ts                        # Storage-Upload-Helper
  submitBugReportAction.ts                      # 'use server' + Notification
  submitBugReportAction.test.ts
  buildBugReportEmail.ts                        # 'server-only' Subject/Body
  buildBugReportEmail.test.ts

src/app/admin/bug-reports/
  page.tsx                                      # Server-Komponente
  BugReportListClient.tsx
  BugReportDetailDialog.tsx
  BugReportConfigSection.tsx
  bugReportAdminActions.ts                      # 'use server' (get/update/config)
  bugReportAdminActions.test.ts
```

Edits:

```
src/app/layout.tsx                              # <BugReportProvider> wraps children
src/components/site/AppDrawer.tsx               # neuer Eintrag "Feedback / Bug melden"
firebase/prod/firestore.rules                   # /bugReport, /appConfig
firebase/dev/firestore.rules                    # dito
storage.rules                                   # /bugReports/{reportId}/{file}
```

## Test-Strategie (TDD)

Vitest + Testing Library, Tests direkt neben Sourcefiles.

- `captureScreenshot.test.ts`: gemocktes `getDisplayMedia`, prüft Blob-Rückgabe und Track-Cleanup.
- `BugReportDialog.test.tsx`: Pflichtfelder / Submit-Disabled-State, Debug-Switch wirkt auf `setDisplayMessages`, Screenshot-Button nur bei verfügbarer API, Submit-Payload korrekt.
- `submitBugReportAction.test.ts`: Auth-Guard aufgerufen, `createdBy` aus Token nicht aus Client-Payload, Mail nur bei `enabled && recipientEmails.length > 0`, Mail-Fehler schreibt `notificationError` aber wirft nicht.
- `buildBugReportEmail.test.ts`: Subject-Prefix `[Bug]` / `[Feature]`, RFC-2822-Format, UTF-8-Encoding.
- `bugReportAdminActions.test.ts`: `actionAdminRequired()` in allen vier Actions, korrekte Firestore-Schreibargumente.

Abschluss: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build --webpack`
in dieser Reihenfolge, **erst nach Abschluss aller Steps** (kein Zwischen-Check).

## Out-of-Scope (MVP)

- Console-Log-Interceptor / Network-Request-Capture.
- Auto-Screenshot via html2canvas (nur native Browser-API).
- Push-Notification an Admins (nur E-Mail).
- "Bug melden"-Button auf `global-error.tsx`.
- Admin-Kommentare auf Reports (nur Status).
- Bulk-Aktionen, CSV-Export.
