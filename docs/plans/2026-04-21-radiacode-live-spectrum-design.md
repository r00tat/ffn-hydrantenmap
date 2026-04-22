# Radiacode Live-Spektrum via BLE

**Datum:** 2026-04-21
**Scope:** Live-Aufnahme eines Radiacode-Energiespektrums direkt über Bluetooth LE, Darstellung während der Messung, automatische Nuklid-Identifikation, Speicherung des finalen Spektrums als `FirecallSpectrum`-Item im aktiven Einsatz.
**Aufsatz auf:** [2026-04-20-radiacode-ble-design.md](./2026-04-20-radiacode-ble-design.md), [2026-04-21-radiacode-protocol-findings.md](./2026-04-21-radiacode-protocol-findings.md).

## Motivation

Die BLE-Anbindung liefert aktuell Dosisleistung und CPS live aus `RD_VIRT_STRING DATA_BUF`. Die Spektrum-Funktion der offiziellen App (`RD_VIRT_STRING VS.SPECTRUM`) nutzt dasselbe Transport-Protokoll und dieselbe serielle Request-Semantik — es fehlt nur ein Decoder und ein zweiter Poll-Kanal. Das bestehende [EnergySpectrum](../../src/components/pages/EnergySpectrum.tsx) bietet bereits Chart, Kalibrierung und Nuklid-Identifikation für Datei-Importe; ein Live-Modus kann dieselben UI-Bausteine wiederverwenden.

## Entscheidungen (aus Brainstorming)

1. **Ort:** Bestehende EnergySpektrum-Seite unter `/einsatz/[firecallId]/schadstoff/energiespektrum`. Neuer Button "Aus Gerät aufnehmen" öffnet einen Modal-Dialog mit Live-Chart + Start/Stop.
2. **Reset:** Spektrumpuffer im Gerät wird beim Start der Aufnahme zurückgesetzt (VSFR `SPEC_RESET`). Gespeichertes Spektrum enthält nur den Zeitraum der Session.
3. **Poll-Rate:** Live-Spektrum alle 2 Sekunden; parallel läuft der bestehende DATA_BUF-Poll (Dosis/CPS) über eine gemeinsame serielle Queue unverändert weiter.
4. **Naming:** Auto-Name `Live-Messung {YYYY-MM-DD HH:mm}`; kein Prompt. Im Nachhinein editierbar über die bestehende Item-Liste.
5. **Identifikation:** Läuft einmalig synchron beim Speichern und wird persistiert (`matchedNuclide`, `matchedConfidence`). Zusätzlich Live-Anzeige während der Aufnahme (Abschnitt 9).
6. **Disconnect:** 3 Reconnect-Versuche à 2 s; bei Misserfolg wird der letzte erfolgreich empfangene Snapshot gespeichert (Teilergebnis statt Totalverlust).

## 1. Architektur-Überblick

```text
User (EnergySpectrum-Seite)
        │
        ▼ "Aus Gerät aufnehmen" → RadiacodeCaptureDialog
        │
RadiacodeProvider (bestehend, erweitert)
        │ useRadiacodeSpectrum()
        ▼
RadiacodeClient (erweitert: Queue, Spectrum-Polling, specReset)
        │ queued execute()
        ▼
BleAdapter (unverändert)
        │
        ▼
Radiacode RC-103 BLE
```

Kernidee: zweiter Poll-Kanal im Client für `VS.SPECTRUM`, beide Poller (DATA_BUF + SPECTRUM) durch eine FIFO-Queue serialisiert — das Gerät beantwortet strikt einen Request auf einmal, die Queue hält diese Invariante aus Sicht der Caller.

## 2. Protokoll-Erweiterung

In [src/hooks/radiacode/protocol.ts](../../src/hooks/radiacode/protocol.ts):

**a)** Neuer VSFR-Eintrag:

```ts
export const VSFR = {
  DEVICE_TIME: 0x0504,
  RAW_FILTER: 0x8006,
  SPEC_RESET: 0x0803,   // neu
} as const;
```

**b)** Decoder `decodeSpectrumResponse(data: Uint8Array): SpectrumSnapshot`.

Nach dem Standard-Response-Header `<cmd:u16><0:u8><seq:u8>` beginnt der Virtualstring-Payload mit `<retcode:u32><flen:u32>`, danach:

```text
<I duration_s> <f a0> <f a1> <f a2>            // 16 B Kopf
<I counts[0]> <I counts[1]> … <I counts[n-1]>  // 4 B je Kanal
```

Für RC-103 typisch 1024 Kanäle → 4112 B Gesamtpayload. Decoder liest:

```ts
export interface SpectrumSnapshot {
  durationSec: number;
  coefficients: [number, number, number];
  counts: number[];
  timestamp: number; // Date.now() bei Empfang
}
```

Fehlerpfad: zu kurze Payload ⇒ `Error` mit erwartetem/tatsächlichem `flen`.

**Fixture** für Tests: realer VS.SPECTRUM-Payload aus einer Trace-Session, abgelegt unter `src/hooks/radiacode/__fixtures__/spectrum_rsp.hex`. Extraktion erfolgt über eine Erweiterung von [captures/parse_radiacode_trace.py](../../captures/parse_radiacode_trace.py).

**Out of scope:** komprimierte Counts-Varianten (rcspg nutzt teils Varints) — die BLE-Antwort ist laut cdump/radiacode flat uint32.

## 3. RadiacodeClient: Queue + Spektrum-Polling

Problem heute: `execute()` in [client.ts](../../src/hooks/radiacode/client.ts) lehnt neue Requests ab, solange ein anderer in-flight ist. Mit zwei parallelen Pollern und optionalen User-Commands (`specReset`) müsste jeder Caller eigenes Retry-Verhalten bauen.

Umbau: `execute()` bekommt eine FIFO-Queue. Solange `inFlight !== null`, landen Requests als `{cmd, seq, args, resolve, reject}` im Queue-Array. Nach jedem `resolve`/`reject` wird der nächste Eintrag gestartet. Die Serialisierung zum Gerät bleibt erhalten; Caller sehen reine Promises.

Neue öffentliche Methoden:

```ts
async specReset(): Promise<void>
async readSpectrum(): Promise<SpectrumSnapshot>
startSpectrumPolling(
  onSnapshot: (s: SpectrumSnapshot) => void,
  intervalMs?: number,        // Default 2000
  onError?: (e: Error) => void
): void
stopSpectrumPolling(): void
```

Der bestehende `startPolling` (DATA_BUF) bleibt unverändert; beide Poller können gleichzeitig laufen.

## 4. Provider-Erweiterung

`RadiacodeProvider` ergänzt den Context um:

```ts
interface RadiacodeContext {
  // bestehend: status, device, measurement, history, connect, disconnect, error

  spectrum: SpectrumSnapshot | null;
  spectrumSession: {
    active: boolean;
    startedAt: number | null;
    snapshotCount: number;
  };
  startSpectrumRecording(): Promise<void>;
  stopSpectrumRecording(): Promise<SpectrumSnapshot | null>;
  cancelSpectrumRecording(): Promise<void>;
}
```

- `startSpectrumRecording`: prüft `status === 'connected'`; ruft `client.specReset()`, setzt Session-State und startet `client.startSpectrumPolling`, das den Snapshot in den Provider-State schreibt.
- `stopSpectrumRecording`: beendet Polling, gibt den letzten Snapshot zurück. Ruft selbst **nicht** Firestore — das erledigt der Dialog.
- `cancelSpectrumRecording`: beendet Polling, verwirft Snapshot; kein Firestore-Write.

Der Provider hält den aktuellen Snapshot in State, damit mehrere Konsumenten (Dialog, eventuell ein Badge in der Statusleiste) ihn ohne zusätzliches Polling rendern.

## 5. UI: RadiacodeCaptureDialog

Neuer Button auf [EnergySpectrum.tsx](../../src/components/pages/EnergySpectrum.tsx) neben "Datei importieren": **"Aus Gerät aufnehmen"** (`SensorsIcon`).

Dialog-Zustandsmaschine:

1. **disconnected** — Hinweistext + "Verbinden"-Button (nutzt bestehenden `connect()`-Flow).
2. **connected-idle** — Zeigt Dosisleistung/CPS aus `measurement`. Primärbutton: "Aufnahme starten".
3. **recording** —
   - Live-`LineChart` (`@mui/x-charts`, Log-Y-Toggle, dieselbe Darstellungslogik wie in [SpectrumChart.tsx](../../src/components/pages/SpectrumChart.tsx)).
   - Nuklid-Chip (siehe Abschnitt 9).
   - Statuszeile: `Dauer: mm:ss · N Snapshots · CPS: …`.
   - Buttons: "Stop & Speichern" (primär), "Abbrechen" (verwirft via `cancelSpectrumRecording`).
4. **saving** — Spinner während `identifyNuclides` + Firestore-Write.
5. **done** — Snackbar "Spektrum gespeichert"; Dialog schließt automatisch.

Reconnect-Anzeige siehe Abschnitt 7.

## 6. Firestore-Speicherung

Gespeichert wird ein `FirecallSpectrum`-Item (Type `'spectrum'`, Schema in [FirecallSpectrum.tsx](../../src/components/FirecallItems/elements/FirecallSpectrum.tsx)) in der `item`-Subcollection des aktiven Firecalls — exakt derselbe Pfad wie beim Datei-Import.

Mapping vom letzten `SpectrumSnapshot` + Session-Metadaten:

```ts
{
  type: 'spectrum',
  name: `Live-Messung ${formatLocalDate(startedAt)}`,
  sampleName: '',
  deviceName: `${device.name} ${device.serial}`,
  measurementTime: snapshot.durationSec,
  liveTime: snapshot.durationSec,
  startTime: new Date(startedAt).toISOString(),
  endTime: new Date(stoppedAt).toISOString(),
  coefficients: snapshot.coefficients,
  counts: snapshot.counts,
  matchedNuclide: identifyResult?.nuclide.name,
  matchedConfidence: identifyResult?.confidence,
}
```

Write via bestehenden `useFirecallItemAdd()`-Hook; das Item erscheint automatisch in der Spektrum-Liste derselben Seite über den vorhandenen Firestore-Listener.

Identifikation beim Speichern: `findPeaks(snapshot.counts, snapshot.coefficients)` → `identifyNuclides(peaks)` → bestes Match mit `confidence ≥ 0.3`, sonst `undefined`. Laufzeit < 10 ms für 1024 Bins — keine Worker nötig.

## 7. Reconnect-Logik

Neuer optionaler Callback im `BleAdapter`-Interface:

```ts
onDisconnect(deviceId: string, handler: () => void): Unsubscribe;
```

Beide Adapter (`bleAdapter.web.ts`, `bleAdapter.capacitor.ts`) feuern den Handler, wenn die BLE-Verbindung wegbricht (Web: `gattserverdisconnected`-Event; Capacitor: Plugin-Event).

Im `RadiacodeClient`: Bei aktivem Spektrum-Polling und Disconnect:

```text
attempt = 1
while attempt ≤ 3:
  wait 2 s
  try adapter.connect(deviceId) + rerun init (SET_EXCHANGE, SET_TIME)
  if ok: resume polling, emit 'reconnected' → return
  attempt++
fail: emit 'connection-lost', stop polling, return last snapshot via Promise
```

Der Provider reflektiert `reconnecting`-Zustand im Context (`status: 'reconnecting'`). Der Dialog zeigt dann ein Overlay "Verbinde erneut… ({attempt}/3)" über dem letzten Chart-Stand.

Schlägt der Reconnect endgültig fehl, liefert `stopSpectrumRecording` den letzten erfolgreich empfangenen Snapshot; Dialog speichert ihn und zeigt Snackbar "Verbindung verloren — Teilergebnis gespeichert".

## 8. Testing

Alle Tests unmittelbar neben der Quelle (`*.test.ts(x)`), Vitest + Testing Library. TDD-Reihenfolge: Protokoll → Client → Provider → UI.

- **`protocol.test.ts`** — `decodeSpectrumResponse` gegen Hex-Fixture (realer Snapshot). Edge-Case: Payload kürzer als Header ⇒ `Error`.
- **`client.test.ts`** — Queue serialisiert zwei gleichzeitig ausgelöste `execute`-Aufrufe; `specReset` sendet korrektes `WR_VIRT_SFR`-Frame; `startSpectrumPolling` ruft Callback mit dekodiertem Snapshot im gewünschten Intervall; `stopSpectrumPolling` bricht ohne Leak ab.
- **`RadiacodeProvider.test.tsx`** — `startSpectrumRecording` ruft `specReset` + `startSpectrumPolling`; aktualisiert `spectrum`-State auf neue Snapshots; `stopSpectrumRecording` liefert letzten Snapshot und stoppt Polling; Disconnect während Session setzt Status auf `reconnecting`; erfolgreicher Reconnect setzt zurück.
- **`RadiacodeCaptureDialog.test.tsx`** — Zustandswechsel disconnected → connected → recording → saving → done. Stop ruft `useFirecallItemAdd` mit erwartetem Schema + Auto-Name. "Abbrechen" im Recording-Zustand verwirft ohne Firestore-Write.
- **Fixture-Generator** — Erweiterung von [captures/parse_radiacode_trace.py](../../captures/parse_radiacode_trace.py), schreibt den rohen VS.SPECTRUM-Virtualstring-Payload (nach `retcode+flen`) als Hex-Datei.

## 9. Live-Nuklid-Anzeige

Pro Snapshot läuft im `RadiacodeCaptureDialog` ein `useMemo`:

```ts
const identification = useMemo(() => {
  if (!snapshot) return null;
  const total = snapshot.counts.reduce((a, b) => a + b, 0);
  if (total < 1000) return { state: 'insufficient', total };
  const peaks = findPeaks(snapshot.counts, snapshot.coefficients);
  const matches = identifyNuclides(peaks);
  const best = matches[0];
  if (!best || best.confidence < 0.3) return { state: 'none', total };
  return { state: 'match', match: best, total };
}, [snapshot]);
```

Anzeige als Chip oben im Dialog:

- `insufficient` — grauer Chip "Sammle Daten… {total} counts".
- `none` — grauer Chip "Kein Nuklid erkannt".
- `match` — farbiger Chip (`success` ≥ 0.7 Konfidenz, sonst `warning`): `Cs-137 · 87 %`.

**Hysterese gegen Flackern:** Anzeige-State (nicht memoized) wechselt nur, wenn der neu erkannte Kandidat in zwei aufeinanderfolgenden Snapshots derselbe ist. Implementiert als kleiner Reducer direkt im Dialog, < 20 Zeilen.

Identifikationsbaustein ist **dieselbe** Pipeline wie beim Speichern (Abschnitt 6) — Code-Duplikation vermieden durch Helper `runIdentification(counts, coefficients)` in [spectrumIdentification.ts](../../src/common/spectrumIdentification.ts).

## Non-Goals

- **Manuelle Energiekalibrierung** live überschreiben — Gerätewerte werden übernommen.
- **Mehrere parallele Sessions / Geräte** — ein Radiacode pro Zeitpunkt.
- **Hintergrund-Aufnahme bei gesperrtem Screen** — wie im Haupt-BLE-Design offen, nicht Teil dieser Ausbaustufe.
- **Kontinuierliche Snapshot-Speicherung** in Firestore — nur das finale Spektrum wird persistiert.

## Risiken & offene Annahmen

- **`SPEC_RESET` VSFR-ID** (0x0803 aus cdump) ist nicht durch unseren eigenen Trace verifiziert — muss am echten Gerät getestet werden. Fallback: wenn Reset nicht greift, einfach `durationSec` des ersten Snapshots als Offset nutzen.
- **VS.SPECTRUM-Response-Größe** > ATT-MTU (20 B) — Reassembler muss > 200 Chunks korrekt zusammenfügen. Heute in Tests nur an kleinen DATA_BUF-Responses validiert; neuer Fixture-Test deckt die große Variante ab.
- **Nuklid-Anzeige-Hysterese** kann bei schneller Aktivitätsänderung träge wirken — bewusster Tradeoff gegen Flackern. Bei Problemen: Schwelle im Setting exponieren.
