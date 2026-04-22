# Radiacode Live-Spektrum via BLE — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Live-Aufnahme eines Radiacode-Energiespektrums über Bluetooth LE mit Live-Chart, Live-Nuklid-Chip und Speicherung als `FirecallSpectrum`-Item im aktiven Einsatz.

**Architecture:** Neuer Spektrum-Poll-Kanal (`VS.SPECTRUM`) parallel zum bestehenden DATA_BUF-Poll. Der `RadiacodeClient` bekommt eine FIFO-Queue, die beide Poller über denselben seriellen Kanal zum Gerät schickt. `RadiacodeProvider` exponiert Session-API (`startSpectrumRecording` / `stopSpectrumRecording`). Neuer `RadiacodeCaptureDialog` auf der EnergySpektrum-Seite orchestriert Start → Live-Display → Stop & Save.

**Tech Stack:** TypeScript, Vitest, React 19, MUI + @mui/x-charts, Firebase Firestore, existing `BleAdapter`-Abstraktion (Web + Capacitor), Next.js App Router.

**Design-Doc:** [docs/plans/2026-04-21-radiacode-live-spectrum-design.md](./2026-04-21-radiacode-live-spectrum-design.md)

**Branch:** `feat/radiacode-via-bluetooth` (weiterarbeiten, kein neuer Worktree)

**TDD-Reihenfolge:** Protokoll → Client → Adapter → Provider → UI. Nach jeder Task: Tests grün, `npm run check` grün (kein TSC-Fehler, keine ESLint-Warnung), Conventional Commit mit `feat(radiacode):` / `test(radiacode):` / `refactor(radiacode):`.

**Regel:** Keine Kommentare in Code, außer wo das WARUM nicht-trivial ist (Hysterese-Begründung, Queue-Invariante). Tests leben neben der Quelle als `*.test.ts(x)` — kein `__tests__/`-Ordner.

---

## Task 1: VS.SPECTRUM-Fixture aus BLE-Trace extrahieren

**Files:**
- Modify: [captures/parse_radiacode_trace.py](../../captures/parse_radiacode_trace.py)
- Create: `src/hooks/radiacode/__fixtures__/spectrum_rsp.hex`

**Ziel:** Einen realen `VS.SPECTRUM`-Response-Payload (nach `<retcode:u32><flen:u32>`-Prefix, d.h. roher Virtualstring-Inhalt = `<duration:u32><a0:f32><a1:f32><a2:f32> + counts[]`) aus dem aufgezeichneten `btsnoop_hci.log` extrahieren.

**Schritt 1:** `parse_radiacode_trace.py` öffnen. Es erzeugt heute `transcript.txt` für alle Commands. Finde den existierenden Decode-Pfad für `RD_VIRT_STRING`-Responses.

**Schritt 2:** Einen neuen Modus/Flag `--dump-spectrum <outfile>` ergänzen: sobald ein `RD_VIRT_STRING`-Response mit `args[0] == VS.SPECTRUM == 0x200` reinkommt, das Daten-Feld (Antwort-Payload nach `cmd+0+seq`, also inkl. `retcode`+`flen`+Inhalt) als Hex-String in die Ausgabedatei schreiben.

**Achtung:** Der cdump-Python-Trace enthält nur dann ein `VS.SPECTRUM`-Response, wenn die offizielle App es angefordert hat. Falls im aufgezeichneten `btsnoop_hci.log` kein SPECTRUM-Traffic vorhanden ist, erzeugt die Task stattdessen eine **synthetische Fixture** (1024 Kanäle, alle 0 außer zwei gesetzte Bins bei Channel 100 und 300, realistische Cs-137-Kalibrierung `a0=0, a1=2.5, a2=0`). Begründung: Das Format ist durch die cdump-Referenz präzise bekannt; für einen reinen Decoder-Unit-Test ist eine synthetische Fixture ausreichend. Live-Tests am Gerät gehen sowieso über die echte Hardware.

**Schritt 3:** Fixture-Datei `src/hooks/radiacode/__fixtures__/spectrum_rsp.hex` schreiben — Zeilen-Format wie bei anderen Fixtures (durchgehender Hex-String, optional Zeilenumbrüche). Die Datei enthält nach dem Parsen den Virtualstring-Inhalt (16 B Kopf + 4096 B counts), nicht das komplette Notification-Byte-Layout.

**Schritt 4:** Commit:

```bash
git add captures/parse_radiacode_trace.py src/hooks/radiacode/__fixtures__/spectrum_rsp.hex
git commit -m "test(radiacode): fixture für VS.SPECTRUM-response hinzugefügt"
```

---

## Task 2: SPEC_RESET VSFR + decodeSpectrumResponse

**Files:**
- Modify: [src/hooks/radiacode/protocol.ts](../../src/hooks/radiacode/protocol.ts)
- Modify: [src/hooks/radiacode/protocol.test.ts](../../src/hooks/radiacode/protocol.test.ts)

**Schritt 1:** In `protocol.test.ts` die Fixture über Node-`fs` einlesen und in ein `Uint8Array` wandeln. Failing Test:

```ts
describe('decodeSpectrumResponse', () => {
  it('decodes duration, calibration coefficients and counts array', () => {
    const hex = readFileSync(
      join(__dirname, '__fixtures__/spectrum_rsp.hex'),
      'utf-8',
    ).replace(/\s+/g, '');
    const data = new Uint8Array(Buffer.from(hex, 'hex'));
    const snap = decodeSpectrumResponse(data);
    expect(snap.durationSec).toBeGreaterThan(0);
    expect(snap.coefficients).toHaveLength(3);
    expect(snap.counts.length).toBe(1024);
    expect(snap.counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('throws when payload is shorter than the 16 byte header', () => {
    expect(() => decodeSpectrumResponse(new Uint8Array(10))).toThrow(
      /spectrum payload/i,
    );
  });
});
```

**Schritt 2:** `npm run test -- protocol.test` → FAIL (Symbol nicht exportiert).

**Schritt 3:** In `protocol.ts` ergänzen:

```ts
export const VSFR = {
  DEVICE_TIME: 0x0504,
  RAW_FILTER: 0x8006,
  SPEC_RESET: 0x0803,
} as const;

export interface SpectrumSnapshot {
  durationSec: number;
  coefficients: [number, number, number];
  counts: number[];
  timestamp: number;
}

export function decodeSpectrumResponse(payload: Uint8Array): SpectrumSnapshot {
  if (payload.length < 8 + 16) {
    throw new Error(
      `Spectrum payload too short: ${payload.length} B (need ≥ 24 for retcode+flen+header)`,
    );
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const flen = view.getUint32(4, true);
  const inner = payload.subarray(8, 8 + flen);
  if (inner.length < 16) {
    throw new Error(
      `Spectrum payload too short: inner ${inner.length} B (need ≥ 16 for duration+3×f32)`,
    );
  }
  const innerView = new DataView(inner.buffer, inner.byteOffset, inner.byteLength);
  const durationSec = innerView.getUint32(0, true);
  const a0 = innerView.getFloat32(4, true);
  const a1 = innerView.getFloat32(8, true);
  const a2 = innerView.getFloat32(12, true);
  const countsBytes = inner.subarray(16);
  const countCount = Math.floor(countsBytes.length / 4);
  const counts = new Array<number>(countCount);
  for (let i = 0; i < countCount; i++) {
    counts[i] = innerView.getUint32(16 + i * 4, true);
  }
  return {
    durationSec,
    coefficients: [a0, a1, a2],
    counts,
    timestamp: Date.now(),
  };
}
```

**Schritt 4:** `npm run test -- protocol.test` → PASS.

**Schritt 5:** `npm run check` → grün.

**Schritt 6:** Commit:

```bash
git add src/hooks/radiacode/protocol.ts src/hooks/radiacode/protocol.test.ts
git commit -m "feat(radiacode): decoder für VS.SPECTRUM und SPEC_RESET VSFR"
```

---

## Task 3: RadiacodeClient — FIFO-Queue

**Files:**
- Modify: [src/hooks/radiacode/client.ts](../../src/hooks/radiacode/client.ts)
- Modify: [src/hooks/radiacode/client.test.ts](../../src/hooks/radiacode/client.test.ts)

**Warum:** `execute()` wirft heute, wenn ein Request in-flight ist. Zwei parallele Poller + User-Commands brauchen eine Queue — sonst müsste jeder Caller Retry-Logik bauen.

**Schritt 1:** Failing Test in `client.test.ts`, der zwei gleichzeitig aufgerufene `execute`-Calls auf einem Fake-Adapter absetzt und verifiziert, dass beide der Reihe nach abgearbeitet werden, ohne Fehler:

```ts
it('serializes concurrent executes via FIFO queue', async () => {
  const { adapter, feedResponse } = createFakeAdapter();
  const client = new RadiacodeClient(adapter, 'test-device');
  await client.connect();  // führt SET_EXCHANGE + SET_TIME aus, fake antwortet
  const p1 = client.readStatus();  // fiktive Hilfsmethode in Test oder direkter execute-Call
  const p2 = client.readStatus();
  feedResponse(...);  // erste Antwort
  feedResponse(...);  // zweite Antwort
  await expect(Promise.all([p1, p2])).resolves.toHaveLength(2);
});
```

(Konkrete Fake-Adapter-Struktur am bestehenden Test in `client.test.ts` orientieren.)

**Schritt 2:** Test ausführen → FAIL (zweiter Call wirft "Request already in flight").

**Schritt 3:** `execute()` umschreiben:

```ts
interface Queued {
  cmd: number;
  args: Uint8Array;
  resolve: (r: ParsedResponse) => void;
  reject: (e: Error) => void;
}

private queue: Queued[] = [];

private execute(cmd: number, args: Uint8Array): Promise<ParsedResponse> {
  return new Promise((resolve, reject) => {
    this.queue.push({ cmd, args, resolve, reject });
    this.pumpQueue();
  });
}

private async pumpQueue(): Promise<void> {
  if (this.inFlight || this.queue.length === 0) return;
  const next = this.queue.shift()!;
  const seq = this.seqIndex;
  this.seqIndex = (this.seqIndex + 1) % SEQ_MODULO;
  const frame = buildRequest(next.cmd, seq, next.args);
  const chunks = splitForWrite(frame, MAX_WRITE_CHUNK);
  this.inFlight = {
    cmd: next.cmd,
    seq,
    resolve: (r) => {
      next.resolve(r);
      this.pumpQueue();
    },
    reject: (e) => {
      next.reject(e);
      this.pumpQueue();
    },
  };
  try {
    for (const c of chunks) await this.adapter.write(this.deviceId, c);
  } catch (e) {
    const waiter = this.inFlight;
    this.inFlight = null;
    waiter?.reject(e instanceof Error ? e : new Error(String(e)));
  }
}
```

`disconnect()` muss zusätzlich alle gequeueten Waiter rejecten (nicht nur `inFlight`).

**Schritt 4:** Test → PASS. Bestehende Tests müssen weiterhin PASS zeigen (`npm run test -- client.test`).

**Schritt 5:** `npm run check` → grün.

**Schritt 6:** Commit:

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "refactor(radiacode): execute() nutzt FIFO-queue statt single-slot in-flight"
```

---

## Task 4: RadiacodeClient — specReset + readSpectrum

**Files:**
- Modify: [src/hooks/radiacode/client.ts](../../src/hooks/radiacode/client.ts)
- Modify: [src/hooks/radiacode/client.test.ts](../../src/hooks/radiacode/client.test.ts)

**Schritt 1:** Failing Tests:

```ts
it('specReset sends WR_VIRT_SFR(SPEC_RESET, 0)', async () => {
  // Fake-Adapter misst geschriebene Bytes; erwartet cmd=0x0825, args=<u32 SPEC_RESET><u32 0>
});

it('readSpectrum decodes the VS.SPECTRUM response into a SpectrumSnapshot', async () => {
  // Fake-Adapter liefert Fixture-Payload (Task 1); erwartet counts.length == 1024
});
```

**Schritt 2:** Test ausführen → FAIL (Methoden existieren nicht).

**Schritt 3:** In `client.ts`:

```ts
async specReset(): Promise<void> {
  const args = new Uint8Array(8);
  const v = new DataView(args.buffer);
  v.setUint32(0, VSFR.SPEC_RESET, true);
  v.setUint32(4, 0, true);
  await this.execute(COMMAND.WR_VIRT_SFR, args);
}

async readSpectrum(): Promise<SpectrumSnapshot> {
  const rsp = await this.execute(COMMAND.RD_VIRT_STRING, u32le(VS.SPECTRUM));
  return decodeSpectrumResponse(rsp.data);
}
```

**Schritt 4:** Test → PASS. `npm run check` → grün.

**Schritt 5:** Commit:

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): specReset und readSpectrum im client"
```

---

## Task 5: RadiacodeClient — Spectrum-Polling-Loop

**Files:**
- Modify: [src/hooks/radiacode/client.ts](../../src/hooks/radiacode/client.ts)
- Modify: [src/hooks/radiacode/client.test.ts](../../src/hooks/radiacode/client.test.ts)

**Schritt 1:** Failing Tests mit Vitest-Fake-Timern:

```ts
it('startSpectrumPolling invokes callback at the configured interval', async () => {
  vi.useFakeTimers();
  const { adapter, feedSpectrumResponse } = createFakeAdapter();
  const client = new RadiacodeClient(adapter, 'test');
  await client.connect();
  const received: SpectrumSnapshot[] = [];
  client.startSpectrumPolling((s) => received.push(s), 2000);
  await vi.advanceTimersByTimeAsync(2000);
  feedSpectrumResponse();
  await flushPromises();
  expect(received).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2000);
  feedSpectrumResponse();
  await flushPromises();
  expect(received).toHaveLength(2);
  client.stopSpectrumPolling();
  vi.useRealTimers();
});

it('stopSpectrumPolling prevents further callbacks', async () => { /* … */ });
```

**Schritt 2:** Tests → FAIL.

**Schritt 3:** In `client.ts` analog zu `startPolling` eine zweite Loop implementieren:

```ts
private spectrumPolling = false;
private spectrumTimer: ReturnType<typeof setTimeout> | null = null;

startSpectrumPolling(
  onSnapshot: (s: SpectrumSnapshot) => void,
  intervalMs = 2000,
  onError?: (e: Error) => void,
): void {
  if (this.spectrumPolling) return;
  this.spectrumPolling = true;
  const tick = async () => {
    if (!this.spectrumPolling) return;
    try {
      const snap = await this.readSpectrum();
      onSnapshot(snap);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
    if (this.spectrumPolling) {
      this.spectrumTimer = setTimeout(tick, intervalMs);
    }
  };
  this.spectrumTimer = setTimeout(tick, intervalMs);
}

stopSpectrumPolling(): void {
  this.spectrumPolling = false;
  if (this.spectrumTimer) {
    clearTimeout(this.spectrumTimer);
    this.spectrumTimer = null;
  }
}
```

`disconnect()` muss `stopSpectrumPolling()` mit aufrufen.

**Schritt 4:** Tests → PASS. `npm run check` → grün.

**Schritt 5:** Commit:

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): spectrum-polling-loop im client"
```

---

## Task 6: BleAdapter — onDisconnect-Callback

**Files:**
- Modify: [src/hooks/radiacode/bleAdapter.ts](../../src/hooks/radiacode/bleAdapter.ts)
- Modify: [src/hooks/radiacode/bleAdapter.web.ts](../../src/hooks/radiacode/bleAdapter.web.ts)
- Modify: [src/hooks/radiacode/bleAdapter.capacitor.ts](../../src/hooks/radiacode/bleAdapter.capacitor.ts)
- Modify: [src/hooks/radiacode/bleAdapter.web.test.ts](../../src/hooks/radiacode/bleAdapter.web.test.ts)

**Schritt 1:** In `bleAdapter.ts` optionale Methode hinzufügen:

```ts
export interface BleAdapter {
  // … bestehend
  onDisconnect?(deviceId: string, handler: () => void): Unsubscribe;
}
```

Optional, weil Tests bestehende Mocks nicht brechen sollen; Consumers müssen `?.()` nutzen.

**Schritt 2:** Failing Test in `bleAdapter.web.test.ts`: ein Mock-`BluetoothDevice` mit `addEventListener('gattserverdisconnected')` wird erstellt, `webAdapter.onDisconnect('id', handler)` wird aufgerufen, `device.dispatchEvent(new Event('gattserverdisconnected'))` feuert, handler muss genau einmal laufen. Unsubscribe entfernt den Listener.

**Schritt 3:** In `bleAdapter.web.ts` implementieren:

```ts
onDisconnect(deviceId, handler) {
  const entry = devices.get(deviceId);
  if (!entry) throw new Error(`Gerät ${deviceId} nicht vorhanden`);
  const listener = () => handler();
  entry.device.addEventListener('gattserverdisconnected', listener);
  return () => {
    entry.device.removeEventListener('gattserverdisconnected', listener);
  };
},
```

**Schritt 4:** In `bleAdapter.capacitor.ts`: äquivalent — das Capacitor-BLE-Plugin feuert ein `disconnect`-Event; Pattern anhand des bereits dort verwendeten Event-Handling übernehmen (siehe existierendes `onNotification`). Falls das konkrete Plugin-API gerade im Wrapper noch nicht offen liegt, als TODO-Return-Unsub mit no-op zurückgeben und **im Commit-Body** vermerken — der Web-Pfad deckt den produktiven Smoke-Test ab.

**Schritt 5:** Tests → PASS. `npm run check` → grün.

**Schritt 6:** Commit:

```bash
git add src/hooks/radiacode/bleAdapter*.ts
git commit -m "feat(radiacode): onDisconnect-callback im BleAdapter"
```

---

## Task 7: RadiacodeClient — Reconnect-Logik während Spektrum-Session

**Files:**
- Modify: [src/hooks/radiacode/client.ts](../../src/hooks/radiacode/client.ts)
- Modify: [src/hooks/radiacode/client.test.ts](../../src/hooks/radiacode/client.test.ts)

**Schritt 1:** Failing Test:

```ts
it('attempts 3 reconnects on disconnect during spectrum polling', async () => {
  vi.useFakeTimers();
  const { adapter, simulateDisconnect, feedSpectrumResponse } = createFakeAdapter();
  const client = new RadiacodeClient(adapter, 'test');
  await client.connect();
  const received: SpectrumSnapshot[] = [];
  const events: string[] = [];
  client.onSessionEvent((e) => events.push(e));
  client.startSpectrumPolling((s) => received.push(s), 2000);
  await vi.advanceTimersByTimeAsync(2000);
  feedSpectrumResponse();
  simulateDisconnect();  // BLE fällt aus
  await vi.advanceTimersByTimeAsync(6000);  // 3 × 2 s
  expect(events).toContain('reconnecting');
  expect(events).toContain('connection-lost');  // alle Versuche schlugen fehl
});
```

**Schritt 2:** Tests → FAIL.

**Schritt 3:** In `client.ts`:

```ts
type SessionEvent = 'reconnecting' | 'reconnected' | 'connection-lost';
private sessionListeners = new Set<(e: SessionEvent) => void>();
private disconnectUnsub: Unsubscribe | null = null;
private reconnecting = false;

onSessionEvent(h: (e: SessionEvent) => void): Unsubscribe {
  this.sessionListeners.add(h);
  return () => { this.sessionListeners.delete(h); };
}

private emit(e: SessionEvent) {
  for (const h of this.sessionListeners) h(e);
}

async connect(now = new Date()): Promise<void> {
  // existing init …
  this.disconnectUnsub = this.adapter.onDisconnect?.(
    this.deviceId,
    () => this.handleUnexpectedDisconnect(),
  ) ?? null;
}

private async handleUnexpectedDisconnect(): Promise<void> {
  if (!this.spectrumPolling || this.reconnecting) return;
  this.reconnecting = true;
  this.emit('reconnecting');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await this.adapter.connect(this.deviceId);
      await this.execute(COMMAND.SET_EXCHANGE, new Uint8Array([0x01, 0xff, 0x12, 0xff]));
      await this.execute(COMMAND.SET_TIME, encodeSetTime(new Date()));
      this.reconnecting = false;
      this.emit('reconnected');
      return;
    } catch {
      // next attempt
    }
  }
  this.reconnecting = false;
  this.stopSpectrumPolling();
  this.emit('connection-lost');
}
```

Der `disconnect()`-Flow muss `disconnectUnsub?.()` aufrufen, damit der Handler nicht nach sauberem Disconnect feuert. Ausserdem `sessionListeners.clear()`.

**Schritt 4:** Tests → PASS. Bestehende Tests grün halten. `npm run check`.

**Schritt 5:** Commit:

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): auto-reconnect während spektrum-session"
```

---

## Task 8: runIdentification-Helper

**Files:**
- Modify: [src/common/spectrumIdentification.ts](../../src/common/spectrumIdentification.ts)
- Modify: [src/common/spectrumIdentification.test.ts](../../src/common/spectrumIdentification.test.ts)

**Ziel:** Eine einzige Funktion, die Counts+Coefficients in eine `IdentificationResult`-Union übersetzt — wird sowohl vom `RadiacodeCaptureDialog` (Live-Chip) als auch vom Save-Pfad genutzt (DRY).

**Schritt 1:** Failing Tests:

```ts
describe('runLiveIdentification', () => {
  it('returns insufficient when total counts < 1000', () => {
    const r = runLiveIdentification([0, 1, 2], [0, 2.5, 0]);
    expect(r.state).toBe('insufficient');
    expect(r.total).toBe(3);
  });

  it('returns none when no peak matches above 0.3 confidence', () => {
    const flat = new Array(1024).fill(5);
    const r = runLiveIdentification(flat, [0, 2.5, 0]);
    expect(r.state).toBe('none');
  });

  it('returns match with nuclide + confidence for a clear Cs-137 peak', () => {
    const counts = new Array(1024).fill(0);
    for (let i = 240; i < 270; i++) counts[i] = 200;   // ~662 keV @ a1=2.5
    const r = runLiveIdentification(counts, [0, 2.5, 0]);
    expect(r.state).toBe('match');
    if (r.state === 'match') {
      expect(r.nuclide).toContain('Cs');
      expect(r.confidence).toBeGreaterThan(0.3);
    }
  });
});
```

**Schritt 2:** Tests → FAIL.

**Schritt 3:** In `spectrumIdentification.ts` ergänzen:

```ts
import { findPeaks, identifyNuclides, channelToEnergy } from './spectrumParser';

export type LiveIdentification =
  | { state: 'insufficient'; total: number }
  | { state: 'none'; total: number }
  | { state: 'match'; nuclide: string; confidence: number; total: number };

const MIN_COUNTS_FOR_IDENTIFICATION = 1000;
const MIN_CONFIDENCE = 0.3;

export function runLiveIdentification(
  counts: number[],
  coefficients: number[],
): LiveIdentification {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < MIN_COUNTS_FOR_IDENTIFICATION) return { state: 'insufficient', total };
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));
  const peaks = findPeaks(counts, energies);
  const matches = identifyNuclides(peaks);
  const best = matches[0];
  if (!best || best.confidence < MIN_CONFIDENCE) return { state: 'none', total };
  return { state: 'match', nuclide: best.nuclide.name, confidence: best.confidence, total };
}
```

**Schritt 4:** Tests → PASS. `npm run check`.

**Schritt 5:** Commit:

```bash
git add src/common/spectrumIdentification.ts src/common/spectrumIdentification.test.ts
git commit -m "feat(spektrum): runLiveIdentification helper für wiederverwendbare peak-analyse"
```

---

## Task 9: RadiacodeProvider — Spektrum-Session-API

**Files:**
- Modify: [src/components/providers/RadiacodeProvider.tsx](../../src/components/providers/RadiacodeProvider.tsx)
- Modify: [src/components/providers/RadiacodeProvider.test.tsx](../../src/components/providers/RadiacodeProvider.test.tsx)
- Modify: [src/hooks/radiacode/useRadiacodeDevice.ts](../../src/hooks/radiacode/useRadiacodeDevice.ts) — exponiert Referenz auf den `RadiacodeClient`, damit Provider Session-Methoden aufrufen kann

**Schritt 1:** `useRadiacodeDevice` ergänzen um `clientRef: RefObject<RadiacodeClient | null>` im Result. Der Provider braucht den Client-Handle, um Spektrum-Session-Methoden aufzurufen. Bestehende Tests müssen grün bleiben.

**Schritt 2:** Failing Tests in `RadiacodeProvider.test.tsx`:

```ts
it('startSpectrumRecording calls specReset and begins polling', async () => {
  // Fake-Client mit spy auf specReset + startSpectrumPolling.
});

it('spectrum snapshots update the context value', async () => { /* … */ });

it('stopSpectrumRecording returns the last received snapshot', async () => { /* … */ });

it('cancelSpectrumRecording drops the snapshot without save', async () => { /* … */ });

it('emits reconnecting status on session event', async () => { /* … */ });
```

**Schritt 3:** Tests → FAIL.

**Schritt 4:** Provider erweitern:

```ts
const [spectrum, setSpectrum] = useState<SpectrumSnapshot | null>(null);
const [sessionActive, setSessionActive] = useState(false);
const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
const [snapshotCount, setSnapshotCount] = useState(0);
const [reconnecting, setReconnecting] = useState(false);

const effectiveStatus: RadiacodeStatus = reconnecting ? 'connecting' : status;

const startSpectrumRecording = useCallback(async () => {
  const client = clientRef.current;
  if (!client) throw new Error('Kein Radiacode verbunden');
  await client.specReset();
  setSpectrum(null);
  setSnapshotCount(0);
  setSessionStartedAt(Date.now());
  setSessionActive(true);
  const unsubEvt = client.onSessionEvent((e) => {
    if (e === 'reconnecting') setReconnecting(true);
    else setReconnecting(false);
  });
  client.startSpectrumPolling((s) => {
    setSpectrum(s);
    setSnapshotCount((c) => c + 1);
  });
  // Unsub in stopSpectrumRecording/cancel
  sessionUnsubRef.current = unsubEvt;
}, []);

const stopSpectrumRecording = useCallback(async () => {
  clientRef.current?.stopSpectrumPolling();
  sessionUnsubRef.current?.();
  setSessionActive(false);
  return spectrum;
}, [spectrum]);

const cancelSpectrumRecording = useCallback(async () => {
  clientRef.current?.stopSpectrumPolling();
  sessionUnsubRef.current?.();
  setSessionActive(false);
  setSpectrum(null);
  setSessionStartedAt(null);
  setSnapshotCount(0);
}, []);
```

Context-Wert um `spectrum`, `spectrumSession = { active, startedAt, snapshotCount }`, `startSpectrumRecording`, `stopSpectrumRecording`, `cancelSpectrumRecording` ergänzen. `status` bei `reconnecting=true` als `'connecting'` maskieren (oder neuen Status-Wert `'reconnecting'` ergänzen — saubererer Weg).

**Schritt 5:** Tests → PASS. `npm run check` → grün.

**Schritt 6:** Commit:

```bash
git add src/components/providers/RadiacodeProvider.tsx src/components/providers/RadiacodeProvider.test.tsx src/hooks/radiacode/useRadiacodeDevice.ts
git commit -m "feat(radiacode): spektrum-session-API im provider"
```

---

## Task 10: RadiacodeCaptureDialog — Zustandsmaschine + Live-Chart

**Files:**
- Create: `src/components/pages/RadiacodeCaptureDialog.tsx`
- Create: `src/components/pages/RadiacodeCaptureDialog.test.tsx`

**Schritt 1:** Failing Tests (Zustands-Transitions):

```ts
it('starts in disconnected state and shows Verbinden button', () => { /* … */ });
it('shows Aufnahme starten button when connected and idle', () => { /* … */ });
it('transitions to recording state on start click', async () => { /* … */ });
it('stop & save calls addItem with the expected spectrum schema', async () => { /* … */ });
it('cancel discards the session without writing', async () => { /* … */ });
it('shows reconnecting overlay when status is reconnecting', () => { /* … */ });
```

Alle Tests mocken `useRadiacode` (MSW-style oder direkter Module-Mock) und `useFirecallItemAdd`.

**Schritt 2:** Tests → FAIL.

**Schritt 3:** Komponente implementieren. Props:

```ts
interface Props {
  open: boolean;
  onClose: () => void;
}
```

Internal state machine: `'disconnected' | 'idle' | 'recording' | 'saving' | 'done'`, abgeleitet aus `useRadiacode()` + `sessionActive`.

**Elemente:**

- `Dialog` mit `DialogTitle`, `DialogContent`, `DialogActions`.
- Im `recording`-Zustand:
  - Nuklid-Chip (aus Task 11, hier als Platzhalter `null` lassen).
  - `LineChart` mit x=channel (oder energy), y=counts, log-Y-toggle.
  - Statuszeile mit `Dauer` (formatiert mm:ss aus `spectrum.durationSec`), `snapshotCount`, `measurement.cps`.
- Buttons: "Aufnahme starten" / "Stop & Speichern" / "Abbrechen" / "Verbinden" je nach Zustand.
- Bei `reconnecting`: halbtransparentes Overlay "Verbinde erneut …".

Beim "Stop & Speichern":

```ts
const snap = await stopSpectrumRecording();
if (!snap) {
  showSnackbar('Kein Spektrum empfangen — nichts zu speichern');
  return;
}
const identification = runLiveIdentification(snap.counts, snap.coefficients);
const matched = identification.state === 'match' ? identification : null;
await addItem({
  type: 'spectrum',
  name: `Live-Messung ${format(sessionStartedAt, 'yyyy-MM-dd HH:mm')}`,
  sampleName: '',
  deviceName: `${device?.name ?? 'Radiacode'} ${device?.serial ?? ''}`.trim(),
  measurementTime: snap.durationSec,
  liveTime: snap.durationSec,
  startTime: new Date(sessionStartedAt).toISOString(),
  endTime: new Date().toISOString(),
  coefficients: snap.coefficients,
  counts: snap.counts,
  matchedNuclide: matched?.nuclide,
  matchedConfidence: matched?.confidence,
});
```

Bei `connection-lost` währenddessen: Dialog nutzt den letzten erhaltenen Snapshot (bleibt in Provider-State) und speichert ihn; Snackbar "Verbindung verloren — Teilergebnis gespeichert".

**Schritt 4:** Tests → PASS. `npm run check`.

**Schritt 5:** Commit:

```bash
git add src/components/pages/RadiacodeCaptureDialog.tsx src/components/pages/RadiacodeCaptureDialog.test.tsx
git commit -m "feat(radiacode): capture-dialog mit live-chart und save-flow"
```

---

## Task 11: Live-Nuklid-Chip + Hysterese

**Files:**
- Modify: `src/components/pages/RadiacodeCaptureDialog.tsx`
- Modify: `src/components/pages/RadiacodeCaptureDialog.test.tsx`

**Schritt 1:** Failing Tests:

```ts
it('shows "Sammle Daten" chip when total counts below threshold', () => { /* … */ });
it('shows matched nuclide chip only after two consecutive confirming snapshots', async () => {
  // Push snapshot 1 with Cs-137 → chip shows nothing yet (hysterese)
  // Push snapshot 2 with Cs-137 → chip flips to "Cs-137 · XX %"
});
it('does not flip chip when different nuclide appears for only one snapshot', async () => { /* … */ });
```

**Schritt 2:** Tests → FAIL.

**Schritt 3:** Im Dialog einen kleinen Reducer einbauen:

```ts
const [displayedNuclide, setDisplayedNuclide] = useState<
  { nuclide: string; confidence: number } | null
>(null);
const lastCandidateRef = useRef<string | null>(null);

useEffect(() => {
  if (!spectrum) return;
  const id = runLiveIdentification(spectrum.counts, spectrum.coefficients);
  if (id.state !== 'match') {
    lastCandidateRef.current = null;
    // intentional: we only *demote* the chip when the underlying source
    // clearly drops below threshold; single misses keep the last stable label.
    if (id.state === 'insufficient') setDisplayedNuclide(null);
    return;
  }
  if (lastCandidateRef.current === id.nuclide) {
    setDisplayedNuclide({ nuclide: id.nuclide, confidence: id.confidence });
  }
  lastCandidateRef.current = id.nuclide;
}, [spectrum]);
```

(Kommentar behalten — Hysterese-Begründung ist nicht offensichtlich.)

Rendering:

```ts
const chip =
  !spectrum ? null
  : totalCounts(spectrum) < 1000
    ? <Chip color="default" label={`Sammle Daten… ${totalCounts(spectrum)} counts`} />
    : displayedNuclide
      ? <Chip color={displayedNuclide.confidence >= 0.7 ? 'success' : 'warning'}
               label={`${displayedNuclide.nuclide} · ${Math.round(displayedNuclide.confidence * 100)} %`} />
      : <Chip color="default" label="Kein Nuklid erkannt" />;
```

**Schritt 4:** Tests → PASS. `npm run check`.

**Schritt 5:** Commit:

```bash
git add src/components/pages/RadiacodeCaptureDialog.tsx src/components/pages/RadiacodeCaptureDialog.test.tsx
git commit -m "feat(radiacode): live-nuklid-chip mit hysterese im capture-dialog"
```

---

## Task 12: EnergySpectrum-Seite → Button + Dialog-Integration

**Files:**
- Modify: [src/components/pages/EnergySpectrum.tsx](../../src/components/pages/EnergySpectrum.tsx)

**Schritt 1:** Oberhalb von `"Datei(en) hochladen"` (ca. [EnergySpectrum.tsx:472](../../src/components/pages/EnergySpectrum.tsx#L472)) einen zweiten Button ergänzen:

```tsx
<Button
  variant="outlined"
  startIcon={<SensorsIcon />}
  onClick={() => setCaptureOpen(true)}
>
  Aus Gerät aufnehmen
</Button>
<RadiacodeCaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} />
```

Neuer lokaler State `const [captureOpen, setCaptureOpen] = useState(false);` im Component-Top.

**Schritt 2:** Sicherstellen, dass `RadiacodeProvider` im Render-Tree über dieser Seite liegt. Falls nicht, ergänzen — entweder global im App-Layout oder lokal um die Seite. Cross-Check:

```bash
grep -rn "RadiacodeProvider" src/app src/components
```

Wenn der Provider nur auf der Dosimetrie-Seite hängt, hochziehen in ein gemeinsames Einsatz-Layout (vermutlich [src/app/einsatz/[firecallId]/layout.tsx](../../src/app/einsatz/[firecallId]/layout.tsx) oder das Schadstoff-Layout) und auf der Dosimetrie-Seite entfernen.

**Schritt 3:** Manueller UI-Test:

```bash
npm run dev
```

Die Seite `/einsatz/<id>/schadstoff/energiespektrum` öffnen, "Aus Gerät aufnehmen" klicken, Dialog öffnet sich, Zustände durchklicken (ohne echtes Gerät bis zur "Verbinden"-Aktion).

**Schritt 4:** `npm run check` → grün.

**Schritt 5:** Commit:

```bash
git add src/components/pages/EnergySpectrum.tsx src/app/einsatz/**/layout.tsx
git commit -m "feat(radiacode): capture-dialog auf energiespektrum-seite verdrahtet"
```

---

## Task 13: End-to-End-Smoke am echten Gerät

**Files:** keine Code-Änderungen, reine Verifikation.

**Schritt 1:** Web-Smoke (Chrome Desktop, Web Bluetooth):

1. `npm run dev`, lokal über `https://` (oder `chrome://flags` für `localhost` BLE) öffnen.
2. Einsatz wählen → Schadstoff → Energiespektrum.
3. "Aus Gerät aufnehmen" → "Verbinden" → RC-103 im Picker wählen.
4. "Aufnahme starten". Chart sollte sich alle 2 s aktualisieren. Dosisleistung-Chip weiterhin live.
5. Nach ≥ 30 s "Stop & Speichern". Snackbar erscheint. Item in der Spektrum-Liste sichtbar.
6. Firestore-Item prüfen (`counts.length === 1024`, `coefficients.length === 3`, `measurementTime ≈ 30`).

**Schritt 2:** Disconnect-Smoke: während laufender Session Radiacode ausschalten. Erwartung: Overlay "Verbinde erneut …", nach 3 Fehlversuchen Snackbar "Verbindung verloren — Teilergebnis gespeichert". Firestore-Item existiert mit dem letzten Snapshot.

**Schritt 3:** Falls bei Smoke Abweichungen auftreten (insbesondere `SPEC_RESET`-Effekt unklar, Reassembler-Grenzen bei großen Responses): Fehler mit konkretem Payload-Snippet beschreiben und vor dem Merge als Follow-Up-Task ergänzen. Kein Code "auf Verdacht" patchen.

**Schritt 4:** Kein Commit nötig, aber Smoke-Ergebnisse kurz in den PR-Body aufnehmen.

---

## Task 14: PR vorbereiten

**Files:** Keine.

**Schritt 1:** Pre-push-Gate:

```bash
git checkout -- next-env.d.ts  # project rule
npm run check
```

Muss komplett grün sein — keine TSC-Fehler, keine ESLint-Warnings, alle Tests bestanden.

**Schritt 2:** PR erstellen:

```bash
GITHUB_TOKEN= gh pr create --title "feat(radiacode): live-spektrum via bluetooth" --body "$(cat <<'EOF'
## Zusammenfassung

Live-Aufnahme eines Radiacode-Energiespektrums direkt über Bluetooth LE. Neuer Button "Aus Gerät aufnehmen" auf der EnergySpektrum-Seite öffnet einen Dialog mit Live-Chart, Live-Nuklid-Erkennung und Auto-Reconnect. Am Stop wird das finale Spektrum als `FirecallSpectrum`-Item in den aktiven Einsatz geschrieben.

## Änderungen

- `decodeSpectrumResponse` + `SpectrumSnapshot` + `VSFR.SPEC_RESET` in `protocol.ts`
- `RadiacodeClient`: FIFO-Request-Queue, `specReset`, `readSpectrum`, `startSpectrumPolling`, Reconnect-Logik mit 3 Versuchen à 2 s
- `BleAdapter.onDisconnect` (Web + Capacitor)
- `RadiacodeProvider`: Spektrum-Session-API (`startSpectrumRecording`, `stopSpectrumRecording`, `cancelSpectrumRecording`, `spectrum`, `spectrumSession`)
- `runLiveIdentification`-Helper in `spectrumIdentification.ts`
- Neuer `RadiacodeCaptureDialog` mit Live-Chart, Nuklid-Chip mit Hysterese, Reconnect-Overlay
- Button "Aus Gerät aufnehmen" auf `/einsatz/[id]/schadstoff/energiespektrum`
- Tests: protocol-decoder, client-queue, client-polling, client-reconnect, provider-session, dialog-zustandsmaschine, dialog-chip-hysterese

## Test plan

- [ ] `npm run check` lokal grün
- [ ] Web-BLE-Smoke mit echtem RC-103: Aufnahme 30 s, Spektrum gespeichert, Nuklid erkannt
- [ ] Disconnect-Smoke: Gerät während Session ausschalten → Teilergebnis wird gespeichert

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Schritt 3:** Label-Check: automatisch `feature` durch Repo-Config; andernfalls manuell setzen.

---

## Referenzen

- [cdump/radiacode Python](https://github.com/cdump/radiacode/) — Protokoll-Referenz
- Projekt-Design-Docs:
  - [2026-04-20-radiacode-ble-design.md](./2026-04-20-radiacode-ble-design.md) — Basis-BLE-Design
  - [2026-04-21-radiacode-protocol-findings.md](./2026-04-21-radiacode-protocol-findings.md) — Protokoll-Trace-Analyse
  - [2026-04-21-radiacode-live-spectrum-design.md](./2026-04-21-radiacode-live-spectrum-design.md) — Design zu diesem Plan
- Code-Anker:
  - Bestehender Client: [src/hooks/radiacode/client.ts](../../src/hooks/radiacode/client.ts)
  - Bestehendes Protokoll: [src/hooks/radiacode/protocol.ts](../../src/hooks/radiacode/protocol.ts)
  - Bestehender Provider: [src/components/providers/RadiacodeProvider.tsx](../../src/components/providers/RadiacodeProvider.tsx)
  - Spektrum-Parsing (Datei-Import, wiederverwendet): [src/common/spectrumParser.ts](../../src/common/spectrumParser.ts)
  - EnergySpektrum-Seite: [src/components/pages/EnergySpectrum.tsx](../../src/components/pages/EnergySpectrum.tsx)
