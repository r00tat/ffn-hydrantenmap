# Design: Automatische History-Snapshots

## Zusammenfassung

Automatische Erstellung von History-Snapshots wenn sich FirecallItems ändern. Das Intervall ist pro Einsatz konfigurierbar (Default: 5 Min). Bei mehreren offenen Clients erstellt nur einer den Snapshot — koordiniert über den Timestamp des letzten History-Eintrags in Firestore.

## Anforderungen

- Automatische History-Snapshots bei Item-Änderungen
- Konfigurierbares Intervall pro Einsatz (Default: 5 Minuten)
- Snapshot nur wenn tatsächlich Änderungen seit letztem Snapshot
- Multi-Client-Deduplizierung: nur ein Client erstellt den Snapshot
- Konfiguration am Firecall-Dokument, änderbar im History-Dialog UND EinsatzDialog

## Datenmodell

### Firecall-Interface erweitern

```typescript
export interface Firecall {
  // ... bestehende Felder
  autoSnapshotInterval?: number; // Minuten, 0 = deaktiviert, default 5
}
```

Kein `lastAutoSnapshot`-Feld am Firecall — stattdessen wird der neueste History-Eintrag (`history[0].createdAt`) als Referenz verwendet. Das vermeidet häufige Writes auf das Firecall-Dokument, die bei allen Clients Re-Renders auslösen (inkl. Map-Verhalten).

## Architektur

### Neuer Hook: `useAutoSnapshot`

Eingebunden im `MapEditorProvider`. Kernlogik:

1. **Änderungserkennung:** Lauscht auf FirecallItems via `useFirebaseCollection`. Bei jeder Änderung wird ein `changesDetectedRef` auf `true` gesetzt. Der initiale Load wird ignoriert (kein Flag setzen beim ersten Snapshot-Load).

2. **Timer:** `setInterval` basierend auf `firecall.autoSnapshotInterval` (Default: 5 Min). Timer wird bei Intervall-Änderung neu gestartet.

3. **Beim Timer-Ablauf:**
   - Prüfe `changesDetectedRef.current === true`
   - Lese `history[0].createdAt` (bereits im Client via `useFirecallHistory()`)
   - Prüfe ob dieser Timestamp älter als das konfigurierte Intervall ist
   - Wenn beides zutrifft → `saveHistory("Auto-Snapshot HH:MM")` aufrufen
   - Reset `changesDetectedRef.current = false`

4. **Multi-Client-Koordination:** Da alle Clients die History-Collection live beobachten, sieht jeder Client den neuen Snapshot sofort. Beim nächsten Timer-Check ist `history[0].createdAt` aktuell → andere Clients überspringen.

```
Client A Timer fires → history[0].createdAt = "vor 2 Min" < 5 Min → skip
Client B Timer fires → history[0].createdAt = "vor 6 Min" > 5 Min → save snapshot
  → neuer History-Eintrag erscheint bei allen Clients
Client A Timer fires → history[0].createdAt = "vor 1 Min" < 5 Min → skip
```

Worst-Case Race Condition: Zwei Clients feuern gleichzeitig → zwei Snapshots. Harmlos — doppelter Snapshot ist kein Problem.

### Änderungserkennung im Detail

```typescript
const changesDetectedRef = useRef(false);
const initialLoadRef = useRef(true);

// Lausche auf FirecallItems-Snapshot
useEffect(() => {
  if (initialLoadRef.current) {
    initialLoadRef.current = false;
    return;
  }
  changesDetectedRef.current = true;
}, [firecallItemsSnapshot]); // QuerySnapshot-Objekt als Dependency
```

### History-Mode Guard

Wenn `historyModeActive === true` (User schaut sich alten Stand an), wird der Auto-Snapshot **pausiert** — kein Timer aktiv, damit der History-Viewer nicht gestört wird.

## UI-Änderungen

### HistoryDialog

Neuer Abschnitt oberhalb des bestehenden Inhalts:

```
Auto-Snapshot: [Select: Aus / 1 Min / 5 Min / 10 Min / 15 Min / 30 Min]
```

Schreibt `autoSnapshotInterval` auf das Firecall-Dokument bei Änderung.

### EinsatzDialog

Neues Select-Feld nach "Abrücken":

```
Auto-Snapshot Intervall: [Select: Aus / 1 Min / 5 Min / 10 Min / 15 Min / 30 Min]
```

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/firebase/firestore.ts` | `Firecall`-Interface: `autoSnapshotInterval?: number` |
| `src/hooks/firecallHistory/useAutoSnapshot.ts` | **Neu** — Kern-Hook mit Timer, Änderungserkennung, Deduplizierung |
| `src/components/providers/MapEditorProvider.tsx` | `useAutoSnapshot()` einbinden |
| `src/components/site/HistoryDialog.tsx` | Select für Auto-Snapshot-Intervall |
| `src/components/FirecallItems/EinsatzDialog.tsx` | Select für Auto-Snapshot-Intervall |

## Intervall-Optionen

| Label | Wert (`autoSnapshotInterval`) |
|-------|-------------------------------|
| Aus | `0` |
| 1 Minute | `1` |
| 5 Minuten (Default) | `5` (oder `undefined`) |
| 10 Minuten | `10` |
| 15 Minuten | `15` |
| 30 Minuten | `30` |

Default-Verhalten: Wenn `autoSnapshotInterval` nicht gesetzt ist (`undefined`), gilt 5 Minuten.

## Nicht im Scope

- Server-seitige Snapshot-Erstellung (Cloud Functions)
- Automatisches Löschen alter Snapshots
- Diff-basierte Snapshots (nur geänderte Items speichern)
