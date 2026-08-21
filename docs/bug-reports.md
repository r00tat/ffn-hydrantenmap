# Bug Reports und Feedback

In-App-Bug-Reports und Feature-Requests werden über den Bug-Report-Dialog
([src/components/bugReport/](../src/components/bugReport/)) in die Firestore-Collection
`bugReport` geschrieben. Der TypeScript-Typ liegt in [src/common/bugReport.ts](../src/common/bugReport.ts)
(`BugReport`: u.a. `kind` `'bug' | 'feature'`, `title`, `description`,
`status` `'open' | 'in_progress' | 'closed' | 'wontfix'`, `createdAt`, `createdBy`,
`context` mit `url`/`buildId`/`database`/`platform`/`firecallId`, `logs`, `screenshots`).

**Wichtig:** Produktive Bug-Reports liegen in der **Default-Datenbank `(default)`** des
Projekts `ffn-utils` — NICHT in `ffndev`. Das Feld `context.database` zeigt, aus welcher
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

### Bearbeitung: Felder, Verlauf, Kommentare

Neben dem Status sind `githubIssue`, `assignee` und `internalNote` am Report pflegbar.
Dazu kommt der Verlauf in der Subcollection **`bugReport/{id}/comments`**.

- **Ein Eintrag ist entweder ein Kommentar oder eine Feldänderung**
  (`entryType`, [bugReport.ts](../src/common/bugReport.ts)). Beides landet in derselben
  Subcollection, weil beides dieselbe Frage beantwortet: was ist mit dem Report passiert.
  Ein Array im Dokument wäre die Alternative gewesen — dann schreibt jeder Kommentar das
  ganze Dokument neu, samt Logs und Screenshot-Pfaden.
- **Jede Feldänderung erzeugt ihren Verlaufseintrag in derselben Action**
  (`updateBugReportAction`). Wer ein weiteres Feld pflegbar macht, trägt es in
  `BUG_REPORT_TRACKED_FIELDS` ein — sonst ändert es sich lautlos.
- **Eine Änderung ohne Unterschied schreibt nichts.** `computeBugReportChanges` vergleicht
  gegen den gespeicherten Stand; ohne das erzeugte jedes Speichern im Dialog einen leeren
  Eintrag. Ein geleertes Feld fliegt per `FieldValue.delete()` aus dem Dokument.
- **`visibility` ist für den Melder vorgesehen, wird aber nur als `internal` geschrieben.**
  Eine Ansicht für den Melder gibt es (noch) nicht. Das Feld steht trotzdem von Anfang an
  am Eintrag: Ob ein bereits geschriebener Kommentar für fremde Augen gedacht war, lässt
  sich nachträglich nicht mehr feststellen.
- **`githubIssue` wird beim Speichern zur URL normalisiert**
  ([bugReportTracking.ts](../src/common/bugReportTracking.ts)), eingegeben werden darf auch
  `#704`. Angezeigt wird wieder die Kurzform. Das Anlegen des Issues läuft über einen
  vorbefüllten `issues/new`-Link, nicht über die GitHub-API — dafür bräuchte der Dienst
  ein Token, und angelegt wird das Issue ohnehin von Hand.
- **Die Subcollection ist für Clients gesperrt** (`allow read, write: if false` in beiden
  `firestore.rules`). Ohne die explizite Regel wäre sie es auch — Regeln kaskadieren
  nicht —, aber interne Notizen sollen nicht daran hängen, dass niemand `{doc=**}`
  daraus macht.

### Screenshot-Aufnahme

Der Dialog wird für die Aufnahme nur **ausgeblendet** (`display: none`), nicht
geschlossen — sonst wären Eingaben und der eingefrorene Kontext weg. Solange er
weg ist, liegt der
[ScreenshotCaptureOverlay](../src/components/bugReport/ScreenshotCaptureOverlay.tsx)
darüber: Ohne ihn hielten Nutzer den Dialog für geschlossen, navigierten weg und
verloren ihren Report (#662). Er blockiert die Bedienung für die Dauer der
Aufnahme und bietet immer einen Weg zurück.

Drei Dinge hängen daran zusammen:

- **Das Overlay trägt `data-skip-screenshot="true"`** und wird damit vom Filter
  in [captureScreenshot.ts](../src/components/bugReport/captureScreenshot.ts) aus
  dem Bild geworfen. Alles, was während einer Aufnahme sichtbar sein soll, aber
  nicht ins Bild gehört, braucht dieses Attribut.
- **`disableEnforceFocus` am Dialog**, solange aufgenommen wird. Der Dialog ist
  weiter `open`, sein Focus-Trap zöge den Fokus sonst aus dem Overlay heraus und
  der Abbrechen-Button wäre per Tastatur nicht erreichbar.
- **`captureRunRef`** zählt jeden Lauf hoch. Eine Aufnahme, die nach dem
  Abbrechen doch noch fertig wird, darf weder das Overlay zurückholen noch einen
  Screenshot anhängen.

`captureScreenshot()` hat ein eigenes Timeout (`SCREENSHOT_TIMEOUT_MS`, 15s):
`modern-screenshot` bringt keines mit, und in mobilen WebViews lädt das
`foreignObject`-Bild unter Speicherdruck gelegentlich nie fertig — ohne Timeout
bliebe der Dialog dauerhaft ausgeblendet. Vor dem Snapshot wird über zwei
`requestAnimationFrame` auf einen Paint gewartet, sonst steht der eben erst
ausgeblendete Dialog noch im Bild.
