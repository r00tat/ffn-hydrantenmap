# Design: Mehrere BlaulichtSMS-Alarme pro Einsatz + Personen-Autocomplete

**Datum:** 2026-07-20
**Branch:** `feat/multiple-blaulichtsms-alarms`

## Ziel

Aktuell kann einem Einsatz (Firecall) genau **ein** BlaulichtSMS-Alarm zugeordnet
werden. Das soll erweitert werden:

1. **Mehrere Alarme pro Einsatz** (z.B. bei Nachalarmierung). Bestehende Einsätze
   mit einem einzelnen Alarm müssen weiter funktionieren.
2. Die **zugesagten Personen** werden aus **allen** zugeordneten Alarmen
   kombiniert (Vereinigung aller `yes`-Zusagen).
3. Zusätzlich zu den Zusagen können **alle anderen Personen** (Status *abgelehnt*
   bzw. *nicht geantwortet* / *ausstehend*) über ein **zusätzliches Personen-Feld
   per Autocomplete** ausgewählt werden. Das **manuelle Ergänzen** beliebiger
   Personen per Freitext bleibt möglich.

## Verhaltensmodell der Besatzungsliste

Die Besatzungsliste ist die **Vereinigung aller Zusagen (`participation === 'yes'`)
über alle zugeordneten Alarme** (live), **plus** explizit ergänzte Personen, die
bleiben, bis sie manuell entfernt werden.

Daraus folgt: Jeder Crew-Eintrag braucht eine **Herkunft**:

- `source: 'alarm'` — automatisch aus einer Zusage synchronisiert. **Live**:
  sichtbar, solange die Person in der Vereinigung aller `yes` über alle
  zugeordneten Alarme ist. Zieht jemand die Zusage in allen Alarmen zurück,
  verschwindet der Eintrag wieder.
- `source: 'manual'` — explizit ergänzt (Autocomplete-Auswahl einer
  nicht-zusagenden Person **oder** freier Text). **Bleibt dauerhaft** und ist
  entfernbar.

Ändert eine explizit ergänzte Person später ihren Status auf `yes`, ist sie
ohnehin über die Alarm-Zusagen abgedeckt (Dedup per `recipientId`).

## 1. Datenmodell (`src/components/firebase/firestore.ts`)

`Firecall` — neues Feld, altes bleibt für Abwärtskompatibilität:

```ts
blaulichtSmsAlarmId?: string;    // bleibt (Legacy, = primärer Alarm)
blaulichtSmsAlarmIds?: string[]; // neu: Quelle der Wahrheit
```

Neuer Helper:

```ts
export function firecallAlarmIds(fc: Firecall): string[] {
  return fc.blaulichtSmsAlarmIds ?? (fc.blaulichtSmsAlarmId ? [fc.blaulichtSmsAlarmId] : []);
}
```

Beim Speichern wird **beides** geschrieben:
- `blaulichtSmsAlarmIds` = ganze Liste
- `blaulichtSmsAlarmId` = erstes Element (oder gelöscht, wenn Liste leer)

So lesen alte Clients und die bestehende `in`-Query den primären Alarm weiter.

`CrewAssignment` — neues Herkunftsfeld:

```ts
source?: 'alarm' | 'manual'; // undefined = 'alarm' (Legacy-Einträge)
```

## 2. Alarm-Auswahl im Einsatz-Dialog (`src/components/FirecallItems/EinsatzDialog.tsx`)

Das bestehende `Select` wird zu `multiple` mit Checkboxen; ausgewählte Alarme als
Chips (`renderValue`). State `selectedAlarmId: string` → `selectedAlarmIds: string[]`.

- **Neuer Einsatz:** Der oberste/zuletzt eingegangene Alarm ist vorausgewählt und
  befüllt Name/Ort/Datum/Beschreibung via `applyAlarm` (wie bisher). Weitere
  angehakte Alarme (Nachalarmierung) werden nur zugeordnet — keine
  Feldüberschreibung. Wird die Auswahl leer → `resetEinsatzToManual`.
- **Bestehender Einsatz:** Nur Zuordnung ändern, keine Einsatzfelder überschreiben.
- **„Feld-befüllender" Alarm** = erstes Element der Liste; nutzt die bestehende
  `applyAlarm`-Logik beim ersten Hinzufügen.
- **Speichern:** `blaulichtSmsAlarmIds = selectedAlarmIds`,
  `blaulichtSmsAlarmId = selectedAlarmIds[0]` (bzw. beide entfernt, wenn leer).

## 3. Crew-Sync-Logik (`src/hooks/useCrewAssignments.ts`)

`syncFromAlarm(recipients)` → **`syncFromAlarms(alarms: BlaulichtSmsAlarm[])`**:
- Vereinigt `recipients` aller Alarme, dedupliziert per `recipient.id`, filtert
  `participation === 'yes'`.
- Legt für neue bestätigte Recipients Crew-Einträge an mit `source: 'alarm'`.
- Duplikat-Cleanup (bestehende Logik gegen frühere Bugs) bleibt.

`addManualPerson(name)` → setzt `source: 'manual'`, `recipientId: 'manual-<ts>'`
(wie bisher).

Neu **`addPersonFromRecipient(recipient)`**: legt Eintrag mit **echter**
`recipientId` und `source: 'manual'` an (für Autocomplete-Auswahl
nicht-zusagender Personen). Dedup: existiert die `recipientId` bereits, no-op.

`assignVehicle`, `updateFunktion`, `removeAssignment` bleiben unverändert.

## 4. Sichtbarkeits-Filter + Autocomplete (`src/components/pages/CrewAssignmentBoard.tsx`)

Prop `alarm?: BlaulichtSmsAlarm | null` → **`alarms?: BlaulichtSmsAlarm[]`**.

- `confirmedIds` = Vereinigung aller `yes`-Recipient-IDs über **alle** Alarme.
- `validAssignments`: Eintrag anzeigen, wenn `source === 'manual'` **ODER**
  `recipientId ∈ confirmedIds`. (Legacy-Einträge ohne `source` gelten als
  `'alarm'`.) Dedup per `recipientId` (manueller Eintrag gewinnt).
- Entfernen-Button: für alle Einträge mit `source === 'manual'` (bisher nur
  `recipientId`-Präfix `manual-`).
- `syncedAlarmRef` (Guard gegen Doppel-Sync) verwendet künftig einen
  stabilen Schlüssel aus allen Alarm-IDs (z.B. sortiert + join), damit
  Änderungen an der Alarm-Menge einen erneuten Sync auslösen.

Das „Person hinzufügen"-Textfeld wird zu einer MUI **`Autocomplete freeSolo`**:
- **Optionen:** alle Recipients aller Alarme mit `participation !== 'yes'`,
  dedupliziert per `id`, ohne bereits hinzugefügte; Anzeige mit Name +
  Status-Hinweis (abgelehnt / nicht geantwortet / ausstehend).
- **Auswahl einer Option** → `addPersonFromRecipient`.
- **Freitext (freeSolo)** → `addManualPerson` (wie bisher).

## 5. Anzeige & Query (`src/components/pages/EinsatzDetails.tsx`, `src/app/blaulicht-sms/actions.ts`)

**`EinsatzDetails`:** lädt alle Alarme über `firecallAlarmIds(firecall)`, ruft
`getBlaulichtSmsAlarmById` je ID parallel (`Promise.all`), State
`alarm: BlaulichtSmsAlarm | null | undefined` → `alarms: BlaulichtSmsAlarm[]`
(plus Ladezustand). Rendert je geladenem Alarm eine `AlarmCard`. Übergibt `alarms`
an `CrewAssignmentBoard`. Nicht ladbare IDs werden übersprungen (Hinweis wie
bisher pro fehlender Alarm).

**`getFirecallsByAlarmIds` (actions.ts):** damit auch Nachalarme als „hat bereits
Einsatz" markiert werden, pro Chunk **zwei** Abfragen mergen:
- bestehende `where('blaulichtSmsAlarmId', 'in', chunk)` (Legacy)
- neu `where('blaulichtSmsAlarmIds', 'array-contains-any', chunk)`

Die Ergebnis-Map wird für **jede** passende Alarm-ID des Firecalls befüllt
(über `firecallAlarmIds(data)`), nicht nur für den primären. Autorisierungs-Check
(`isAuthorizedForFirecall`) bleibt unverändert.

`resetEinsatzToManual` (`src/components/FirecallItems/einsatzDefaults.ts`) muss
zusätzlich `blaulichtSmsAlarmIds` zurücksetzen.

## 6. i18n & Tests

**i18n** — neue Keys in `messages/de.json` **und** `messages/en.json`:
`crew.additionalPersons` (Label Autocomplete), `crew.statusDeclined`,
`crew.statusNoAnswer`, `crew.statusPending`. Bestehendes `firecall.alarmSelect`
bleibt (Label passt für Multi-Select).

**Tests (TDD — zuerst schreiben):**
- `firecallAlarmIds`-Helper: Array bevorzugt, Scalar-Fallback, leer → `[]`.
- `useCrewAssignments.test.ts`: `syncFromAlarms` vereinigt `yes` über mehrere
  Alarme + Dedup; `addPersonFromRecipient` setzt `source:'manual'` + echte ID +
  Dedup; `addManualPerson` setzt `source:'manual'`.
- `CrewAssignmentBoard.test.tsx`: manuell/explizit ergänzte Personen bleiben trotz
  nicht-`yes` sichtbar; `alarm`-Einträge verschwinden bei Rückzug der Zusage;
  Autocomplete-Optionen = nicht-`yes`-Recipients (ohne bereits hinzugefügte);
  Freitext-Add ruft `addManualPerson`.
- `einsatzDefaults.test.ts`: `resetEinsatzToManual` löscht auch
  `blaulichtSmsAlarmIds`.

## Abwärtskompatibilität — Zusammenfassung

- Alte Firecalls mit nur `blaulichtSmsAlarmId`: `firecallAlarmIds` liefert
  `[id]`; Anzeige, Crew-Sync und Query funktionieren unverändert.
- Alte Crew-Einträge ohne `source`: gelten als `'alarm'` → Live-Verhalten wie
  bisher.
- Neue Writes befüllen `blaulichtSmsAlarmId` (primär) weiter, damit andere
  Reader/Queries kompatibel bleiben.
