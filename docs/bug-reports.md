# Bug Reports und Feedback

In-App-Bug-Reports und Feature-Requests werden über den Bug-Report-Dialog
([src/components/bugReport/](../src/components/bugReport/)) in die Firestore-Collection
`bugReport` geschrieben. Der TypeScript-Typ liegt in [src/common/bugReport.ts](../src/common/bugReport.ts)
(`BugReport`: u.a. `kind` `'bug' | 'feature'`, `title`, `description`,
`status` `'open' | 'in_progress' | 'closed' | 'wontfix'`, `createdAt`, `createdBy`,
`context` mit `url`/`buildId`/`database`/`platform`/`firecallId`, `logs`, `screenshots`,
dazu die Bearbeitungsfelder `resolution`, `githubIssue`, `assignee`, `internalNote`).

**Wichtig:** Produktive Bug-Reports liegen in der **Default-Datenbank `(default)`** des
Prod-Projekts — NICHT in `ffndev`. Das Feld `context.database` zeigt, aus welcher
Umgebung der Report stammt (`""` = prod, `ffndev` = dev).

**Reports abrufen (Firebase MCP, neueste zuerst):**

```jsonc
// Tool: firestore_query_collection
{
  "collection_path": "bugReport",
  "database": "(default)",            // prod; für Dev: "ffndev"
  "filters": [],                       // optional, z.B. status == "open"
  "order": { "orderBy": "createdAt", "orderByDirection": "DESCENDING" },
  "limit": 15
}
```

Nur offene Reports: `filters: [{ field: "status", op: "EQUAL", compare_value: { string_value: "open" } }]`.

Alternativ im Admin-Panel unter `/admin/bug-reports`
([src/app/admin/bug-reports/](../src/app/admin/bug-reports/)), wo sich auch Status und
Empfänger-E-Mails (`appConfig/bugReport`) pflegen lassen.

Der **Direkt-Link** der Benachrichtigungsmail zeigt auf `/admin/bug-reports/<id>`
([[id]/page.tsx](../src/app/admin/bug-reports/[id]/page.tsx)): dieselbe Liste, der Report
im Detaildialog schon geöffnet. Beim Schließen geht die Adresse zurück auf die Liste,
sonst öffnete ein Neuladen den Report wieder. Die Route gab es anfangs nicht; die Mails
verlinkten trotzdem dorthin und landeten auf einer 404-Seite.

### Bearbeitung: Felder, Verlauf, Kommentare

Neben dem Status sind `resolution`, `githubIssue`, `assignee` und `internalNote` am
Report pflegbar.
Dazu kommt der Verlauf in der Subcollection **`bugReport/{id}/comments`**.

- **Ein Eintrag ist entweder ein Kommentar oder eine Feldänderung**
  (`entryType`, [bugReport.ts](../src/common/bugReport.ts)). Beides landet in derselben
  Subcollection, weil beides dieselbe Frage beantwortet: was ist mit dem Report passiert.
  Ein Array im Dokument wäre die Alternative gewesen — dann schreibt jeder Kommentar das
  ganze Dokument neu, samt Logs und Screenshot-Pfaden.
- **Jede Feldänderung erzeugt ihren Verlaufseintrag im selben Aufruf**
  (`updateBugReport` im Dienst, siehe unten). Wer ein weiteres Feld pflegbar macht, trägt es in
  `BUG_REPORT_TRACKED_FIELDS` ein — sonst ändert es sich lautlos.
- **Eine Änderung ohne Unterschied schreibt nichts.** `computeBugReportChanges` vergleicht
  gegen den gespeicherten Stand; ohne das erzeugte jedes Speichern im Dialog einen leeren
  Eintrag. Ein geleertes Feld fliegt per `FieldValue.delete()` aus dem Dokument.
- **Ein Kommentar ist `internal` oder `reporter`.** Im Dialog wählt der Admin beim
  Schreiben „intern" oder „für Melder sichtbar"; der Verlauf zeigt die Sichtbarkeit als
  Chip. Ein Eintrag ohne das Feld gilt als intern — im Zweifel bleibt ein Kommentar
  intern. Das Feld stand von Anfang an am Eintrag, obwohl es erst später gebraucht wurde:
  Ob ein bereits geschriebener Kommentar für fremde Augen gedacht war, lässt sich
  nachträglich nicht feststellen.
- **Verlaufseinträge einer Feldänderung bleiben `internal`.** Ein Eintrag kann mehrere
  Felder umfassen — Status und Zuständigkeit in einem Speichern. Was der Melder davon
  sieht, entscheidet deshalb nicht die Sichtbarkeit des Eintrags, sondern beim Lesen die
  Liste `BUG_REPORT_REPORTER_VISIBLE_FIELDS` (`status`, `resolution`): Ob und wann
  sein Report erledigt wurde, ist genau, was er wissen will, und nichts davon ist intern.
  Zuständigkeit, GitHub-Issue und interne Notiz fallen aus dem Eintrag heraus. Das gilt
  auch für Einträge aus der Zeit vor der Melder-Ansicht.
- **`resolution` ist die Rückmeldung an den Melder**, `internalNote` die Einordnung für
  das Team. Zwei Felder statt eines Schalters an der Notiz: Ein Text, der für den Melder
  geschrieben ist, liest sich anders als einer für Kollegen, und ein versehentlich
  umgelegter Schalter veröffentlichte eine interne Notiz. Die Lösung steht im Verlauf
  wie jedes andere Feld.
- **`githubIssue` wird beim Speichern zur URL normalisiert**
  ([bugReportTracking.ts](../src/common/bugReportTracking.ts)), eingegeben werden darf auch
  `#704`. Angezeigt wird wieder die Kurzform. Das Anlegen des Issues läuft über einen
  vorbefüllten `issues/new`-Link, nicht über die GitHub-API — dafür bräuchte der Dienst
  ein Token, und angelegt wird das Issue ohnehin von Hand.
- **Die Subcollection ist für Clients gesperrt** (`allow read, write: if false` in beiden
  `firestore.rules`). Ohne die explizite Regel wäre sie es auch — Regeln kaskadieren
  nicht —, aber interne Notizen sollen nicht daran hängen, dass niemand `{doc=**}`
  daraus macht. Auch die Melder-Ansicht liest über eine Server Action und das Admin SDK;
  die Filterung nach Sichtbarkeit ließe sich in Regeln nicht feldgenau ausdrücken.
- **Die Firestore-Logik liegt in
  [bugReportService.ts](../src/server/bugReport/bugReportService.ts)**, nicht in den
  Server Actions. Admin-Bereich, „Meine Meldungen" und MCP-Tools rufen denselben Code;
  der Dienst bekommt den Bearbeiter (`actor`) ausdrücklich übergeben, weil ein
  MCP-Aufruf keine NextAuth-Sitzung hat, und prüft selbst **keine** Berechtigung — das
  tun die Aufrufer.

### Meine Meldungen (Ansicht des Melders)

Unter `/meine-meldungen` ([src/app/meine-meldungen/](../src/app/meine-meldungen/)) sieht
jeder angemeldete Benutzer seine eigenen Reports: Art, Titel, Status, Datum, Lösung, die
für ihn sichtbaren Kommentare und Status-/Lösungsänderungen sowie seine Screenshots.

- **Die Projektion ist eine Positivliste** (`toReporterView` in
  [bugReportReporterView.ts](../src/common/bugReportReporterView.ts)). Was dort nicht
  steht, verlässt den Server nicht: `internalNote`, `assignee`, `githubIssue`, `logs`,
  `context`, `notificationError`, interne Kommentare und die E-Mail-Adressen der
  Bearbeiter (der Melder sieht nur den Anzeigenamen). Ein neues internes Feld am Report
  landet damit nicht aus Versehen beim Melder.
- **Abgefragt wird `createdBy.uid` aus der Sitzung**, sortiert im Speicher — `where` plus
  `orderBy` auf einem anderen Feld verlangte einen zusammengesetzten Index.
- **Screenshot-Pfade werden geprüft, bevor sie signiert werden**
  (`isBugReportStoragePath`): Die Pfade schickt der Browser beim Melden selbst mit. Ohne
  die Prüfung könnte ein Melder einen beliebigen Storage-Pfad eintragen und sich über
  seine eigene Meldung eine signierte URL dafür holen. Signiert wird erst beim
  Aufklappen eines Reports, nicht für die ganze Liste.
- Ein fremder Report antwortet wie ein fehlender — die Meldung verrät nicht, dass es
  die ID gibt.

### Benachrichtigung des Melders

Wer einen Report bearbeitet, kann den Melder per Mail benachrichtigen (Häkchen im
Dialog, `notifyReporter` am MCP-Tool). Die Mail
([reporterNotificationEmail.ts](../src/server/bugReport/reporterNotificationEmail.ts))
nennt Status, Lösung und gegebenenfalls den neuen Kommentar und verlinkt auf
`/meine-meldungen`. Verschickt wird über denselben Weg wie die Meldungsmail
(`sendRawMail`, Gmail-API mit Domain-Delegation).

- **Nur auf Wunsch und nur mit Anlass:** Abschluss (`closed`/`wontfix`), eine neue
  Lösung oder ein Kommentar für den Melder. Ein Wechsel auf „In Bearbeitung" oder eine
  neue Zuständigkeit ist kein Anlass — der Melder sähe in der Mail nichts Neues.
- **Best effort:** Die Änderung ist schon gespeichert, wenn die Mail hinausgeht. Ob sie
  zugestellt, übersprungen oder gescheitert ist, bekommt der Bearbeiter zurück
  (Snackbar bzw. `notification` in der Tool-Antwort); am Report wird nichts vermerkt.
- Die Adresse ist `createdBy.email` und wird vor dem `To:`-Header gegen eingeschleuste
  Zeilenumbrüche geprüft.

### Zugriff über MCP

Bug-Reports sind über den MCP-Server der Einsatzkarte erreichbar
([docs/mcp-server.md](mcp-server.md), Scopes `bugreport:read` und `bugreport:write`):

- `list_bug_reports`, `get_bug_report` (mit `bugreport:read`): Admins sehen alle Reports
  samt Logs, Kontext und Verlauf, alle anderen nur die eigenen in der Melder-Ansicht.
  `includeScreenshots` liefert bis zu vier Screenshots (je höchstens 1,5 MB) als Bilder.
- `update_bug_report`, `add_bug_report_comment` (mit `bugreport:write`, nur Admins):
  dieselben Felder wie im Dialog. Verlaufseinträge und Kommentare tragen `source: 'mcp'`,
  `mcpClientId` und `mcpClientName`; der Verlauf im Dialog zeigt „über" und den Namen der Anwendung.

Für den Zugriff ohne die Einsatzkarte bleibt der Firebase MCP (oben).

### Screenshot-Aufnahme

Der Dialog wird für die Aufnahme nur **ausgeblendet** (`display: none`), nicht
geschlossen — sonst wären Eingaben und der eingefrorene Kontext weg. Solange er
weg ist, liegt der
[ScreenshotCaptureOverlay](../src/components/bugReport/ScreenshotCaptureOverlay.tsx)
darüber: Ohne ihn hielten Nutzer den Dialog für geschlossen, navigierten weg und
verloren ihren Report (#662). Er blockiert die Bedienung für die Dauer der
Aufnahme und bietet immer einen Weg zurück.

Vier Dinge hängen daran zusammen:

- **Das Overlay trägt `data-skip-screenshot="true"`** und wird damit vom Filter
  in [captureScreenshot.ts](../src/components/bugReport/captureScreenshot.ts) aus
  dem Bild geworfen. Alles, was während einer Aufnahme sichtbar sein soll, aber
  nicht ins Bild gehört, braucht dieses Attribut.
- **Das Overlay ist ein MUI-`Modal`** (ohne Backdrop und ohne Scroll-Lock), kein
  bloßes `fixed`-Element. Per Tastenkürzel ausgelöst liegt oft ein *anderer*
  Dialog darunter, dessen Focus-Trap wir nicht abschalten können; MUIs
  ModalManager lässt aber nur das oberste Modal den Fokus festhalten. Der
  Scroll-Lock bleibt aus, weil sein Scrollbar-Polster die Seite verschöbe, die
  gerade aufgenommen wird.
- **`disableEnforceFocus` am Bug-Report-Dialog**, solange aufgenommen oder ein
  Bereich ausgewählt wird. Er ist weiter `open`, sein Focus-Trap zöge den Fokus
  sonst aus dem Overlay heraus und der Abbrechen-Button wäre per Tastatur nicht
  erreichbar.
- **`captureRunRef`** (im Provider `runRef`) zählt jeden Lauf hoch. Eine
  Aufnahme, die nach dem Abbrechen doch noch fertig wird, darf weder das Overlay
  zurückholen noch einen Screenshot anhängen oder den Dialog öffnen.

`captureScreenshot()` hat ein eigenes Timeout (`SCREENSHOT_TIMEOUT_MS`, 15s):
`modern-screenshot` bringt keines mit, und in mobilen WebViews lädt das
`foreignObject`-Bild unter Speicherdruck gelegentlich nie fertig — ohne Timeout
bliebe der Dialog dauerhaft ausgeblendet. Vor dem Snapshot wird über zwei
`requestAnimationFrame` auf einen Paint gewartet, sonst steht der eben erst
ausgeblendete Dialog noch im Bild.

Die normale Aufnahme ist auf 1280 px an der längsten Seite begrenzt (`MAX_DIM`),
damit die Zwischen-Data-URL auch in schwachen WebViews lädt. Für die
Bereichsauswahl gibt es `captureScreenshot({ highResolution: true })`: bis
2560 px und mit `devicePixelRatio` (höchstens 2). Ein Ausschnitt aus einem
1280-px-Bild ist oft nur ein paar hundert Pixel breit und kleine Schrift darin
unlesbar.

### Tastenkürzel und Bereichsauswahl

Ein Dialog lässt sich mit dem Menüeintrag „Bug melden" nicht melden: Der Klick
ins Menü schließt ihn, genau der Zustand, um den es geht, ist weg. Und meist
interessiert nur ein Ausschnitt, nicht der ganze Bildschirm. Dafür gibt es zwei
Kürzel (Katalog in [hotkeys.ts](../src/common/hotkeys.ts), beide
`whileDialogOpen` und `allowInInputs`), angemeldet im
[BugReportProvider](../src/components/bugReport/BugReportProvider.tsx):

| Kürzel | Vorbelegung | Ablauf |
| --- | --- | --- |
| `bugReport.open` | Alt+B (⌥B) | Bildschirm aufnehmen → Bug-Report mit diesem Screenshot öffnen |
| `bugReport.region` | Alt+Shift+B (⌥⇧B) | aufnehmen → Bereich auswählen → Bug-Report mit Ausschnitt öffnen |

Im Dialog selbst gibt es dasselbe als Knopf „Bereich auswählen" neben
„Bildschirmaufnahme machen", und jeder angehängte Screenshot lässt sich über das
Zuschneiden-Symbol nachträglich auf einen Bereich verkleinern. Der Dialog zeigt
die eingestellte Belegung als Hinweis (auf Apple-Geräten mit ⌥⇧⌘), außer die
Kürzel sind abgeschaltet oder das Gerät kann nur Touch
(`(hover: none) and (pointer: coarse)`).

- **Erst aufnehmen, dann öffnen.** Das Kürzel nimmt den Bildschirm auf, *bevor*
  der Bug-Report aufgeht — sonst stünde der Bug-Report-Dialog selbst im Bild und
  verdeckte, was gemeldet werden soll. Der fremde Dialog bleibt offen und kommt
  mit ins Bild (`captureScreenshot()` nimmt `document.body` samt der MUI-Portale
  auf); der Bug-Report legt sich danach darüber. Schlägt die Aufnahme fehl, geht
  der Bug-Report trotzdem auf — der Report ist wichtiger als der Anhang.
- **Ist der Bug-Report schon offen**, meldet er sich für beide Kürzel selbst an
  und hat damit Vorrang (der zuletzt angemeldete Handler gewinnt):
  `bugReport.region` hängt den Ausschnitt an diesen Report an, `bugReport.open`
  tut nichts. Ein zweiter Tastendruck während einer laufenden Aufnahme oder
  Auswahl wird ignoriert.
- **Ausgewählt wird auf einem eingefrorenen Bild, nicht über der lebenden
  Seite.** So bleibt genau der Zustand stehen, der gemeldet wird — ein Tooltip
  oder ein Ladezustand verschwindet nicht, während man den Rahmen zieht —, und
  das Ziehen mit dem Finger löst darunter nichts aus (Karte verschieben, Dialog
  per Backdrop-Klick schließen). Danach wird nur noch zugeschnitten, keine
  zweite DOM-Aufnahme.
- **Der [RegionSelector](../src/components/bugReport/RegionSelector.tsx) ist ein
  MUI-`Modal`** über allen Dialogen (`zIndex.modal + 20`), aus demselben Grund
  wie das Aufnahme-Overlay: Nur das oberste Modal erzwingt den Fokus, sonst
  risse der Focus-Trap des Dialogs darunter Enter, Escape und die Knöpfe an
  sich. Er trägt `data-skip-screenshot="true"` (nie selbst im Bild) und
  `data-hotkeys-block="true"` (andere Kürzel ruhen, solange er offen ist).
- **Bedienung:** Rahmen mit Maus, Stift oder Finger aufziehen (Pointer Events,
  `touch-action: none`, damit der Browser dabei nicht scrollt oder zoomt); neu
  ziehen ersetzt die Auswahl, Antippen verwirft sie. „Bereich übernehmen"
  (Enter) gibt es erst mit einer Auswahl, „Ganzer Bildschirm" übernimmt das
  ganze Bild, „Abbrechen" (Escape) verwirft alles.
- **Umrechnung und Zuschnitt** liegen getrennt in
  [cropImage.ts](../src/components/bugReport/cropImage.ts):
  `mapSelectionToImage` rechnet die Auswahl in angezeigten CSS-Pixeln auf Pixel
  des Originalbilds um — mit den Rändern von `object-fit: contain`, in jede
  Richtung gezogen, auf das Bild begrenzt, unter 8 angezeigten Pixeln verworfen
  — und ist rein und getestet. `cropImageBlob` zeichnet den Bereich nur noch auf
  ein Canvas und liefert ein PNG.
