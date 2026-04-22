# Dosimetrie-Seite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Neue Seite `/schadstoff/dosimetrie` mit Live-Anzeige von Dosisleistung, Gesamtdosis (Gerät), CPS und rollierendem 5-min-Live-Chart. Verbindung wird global in einem `RadiacodeProvider` gehalten, der auch das bestehende Karten-Recording versorgt.

**Architecture:** Single-Connection-Refactor: `useRadiacodeDevice` wird hinter `RadiacodeProvider` (React Context) gekapselt, der einmalig im App-Layout gemountet wird. Bestehende Konsumenten (`RecordButton`, `useRadiacodePointRecorder`, `RadiacodeLiveWidget`) werden auf `useRadiacode()` umgestellt. Die Seite selbst ist rein präsentational und konsumiert den Context.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Vitest / MUI + MUI X Charts — setzt auf bestehenden Radiacode-BLE-Stack (`src/hooks/radiacode/*`) auf.

**Design-Referenz:** [docs/plans/2026-04-21-dosimetrie-page-design.md](./2026-04-21-dosimetrie-page-design.md)

**Branch:** `feat/radiacode-dosimetrie` (Worktree: `.worktrees/feat-radiacode-dosimetrie/`)

**Verification nach jeder Phase:** `NO_COLOR=1 npm run test` grün. Phase-Abschluss: `NO_COLOR=1 npm run check` grün.

---

## Phase 1 — Protokoll-Erweiterung: Dosis aus RareRecord

### Task 1: Typ-Erweiterung RadiacodeMeasurement

**Files:**

- Modify: `src/hooks/radiacode/types.ts`

**Step 1: Felder hinzufügen**

Ergänze `RadiacodeMeasurement`:

```ts
export interface RadiacodeMeasurement {
  dosisleistung: number;  // µSv/h
  cps: number;
  timestamp: number;
  dose?: number;          // µSv, Geräte-Akkumulator (optional)
  temperatureC?: number;  // °C (optional, aus RareRecord)
  chargePct?: number;     // 0..100 (optional, aus RareRecord)
}
```

**Step 2: tsc prüfen**

Run: `npx tsc --noEmit`
Expected: PASS (optionale Felder brechen keine Consumer).

**Step 3: Commit**

```bash
git add src/hooks/radiacode/types.ts
git commit -m "feat(radiacode): optional dose/temperature/charge in RadiacodeMeasurement"
```

---

### Task 2: TDD — `extractLatestMeasurement` liest RareRecord

**Files:**

- Modify: `src/hooks/radiacode/client.ts`
- Modify: `src/hooks/radiacode/client.test.ts`

**Step 1: Bestehende Fixture `databuf_rsp_small` prüfen**

Run: `Grep -n "records" src/hooks/radiacode/__fixtures__/databuf_records_small.hex 2>/dev/null; cat src/hooks/radiacode/__fixtures__/databuf_records_small.hex | head -5`

Falls die vorhandenen Fixtures **keinen** RareRecord (eid=0, gid=3) enthalten, synthetisieren wir im Test einen Byte-Stream inline (DRY: via kleiner Helper-Funktion im Test).

**Step 2: Failing test schreiben**

Ergänze `src/hooks/radiacode/client.test.ts` um einen Fall `polls DATA_BUF and emits a measurement with dose from rare records`:

```ts
function buildRareRecordBody(
  realtime: { cps: number; doseRateSv: number },
  rare: { doseSv: number; temperatureC: number; chargePct: number },
): Uint8Array {
  // retcode(4) + flen(4) + records
  const records: number[] = [];
  // Realtime record: seq(1)=0, eid(1)=0, gid(1)=0, tsOffset(4)=0, then 15B payload
  // countRate f32, doseRate f32, countRateErrPct u16, doseRateErrPct u16, flags u16, realTimeFlags u8
  const realtimeBuf = new ArrayBuffer(7 + 15);
  const rv = new DataView(realtimeBuf);
  rv.setUint8(0, 0);     // seq
  rv.setUint8(1, 0);     // eid
  rv.setUint8(2, 0);     // gid
  rv.setInt32(3, 0, true);  // tsOffset
  rv.setFloat32(7, realtime.cps, true);
  rv.setFloat32(11, realtime.doseRateSv, true);
  rv.setUint16(15, 0, true);
  rv.setUint16(17, 0, true);
  rv.setUint16(19, 0, true);
  rv.setUint8(21, 0);
  records.push(...new Uint8Array(realtimeBuf));

  // Rare record: seq=1, eid=0, gid=3, tsOffset=0, then 14B payload
  // duration u32, dose f32 (Sv), temperature u16 ((t*100)+2000), charge u16 (pct*100), flags u16
  const rareBuf = new ArrayBuffer(7 + 14);
  const rr = new DataView(rareBuf);
  rr.setUint8(0, 1);     // seq
  rr.setUint8(1, 0);     // eid
  rr.setUint8(2, 3);     // gid
  rr.setInt32(3, 0, true);
  rr.setUint32(7, 100, true);   // duration
  rr.setFloat32(11, rare.doseSv, true);
  rr.setUint16(15, Math.round(rare.temperatureC * 100) + 2000, true);
  rr.setUint16(17, Math.round(rare.chargePct * 100), true);
  rr.setUint16(19, 0, true);
  records.push(...new Uint8Array(rareBuf));

  const bodyLen = 8 + records.length;
  const body = new Uint8Array(bodyLen);
  const bv = new DataView(body.buffer);
  bv.setUint32(0, 0, true);          // retcode = 0
  bv.setUint32(4, records.length, true);
  body.set(records, 8);
  return body;
}

it('emits dose, temperature and charge when rare record is present', async () => {
  const adapter = makeAdapter();
  let seqCounter = 0;
  const body = buildRareRecordBody(
    { cps: 3.5, doseRateSv: 2e-7 },
    { doseSv: 1.23e-4, temperatureC: 23.5, chargePct: 87.3 },
  );

  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR)
      return buildResponseChunks(cmd, seq, new Uint8Array([0x01, 0, 0, 0]));
    if (cmd === COMMAND.RD_VIRT_STRING)
      return buildResponseChunks(COMMAND.RD_VIRT_STRING, seq, body);
    return null;
  });

  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  const onMeasurement = vi.fn();
  client.startPolling(onMeasurement, 500);
  await vi.advanceTimersByTimeAsync(600);

  expect(onMeasurement).toHaveBeenCalledTimes(1);
  const m = onMeasurement.mock.calls[0][0];
  expect(m.cps).toBeCloseTo(3.5, 2);
  expect(m.dosisleistung).toBeCloseTo(2e-7 * 10000, 5);  // 0.002 µSv/h
  expect(m.dose).toBeCloseTo(1.23e-4 * 1e6, 1);          // 123 µSv
  expect(m.temperatureC).toBeCloseTo(23.5, 1);
  expect(m.chargePct).toBeCloseTo(87.3, 1);

  await client.disconnect();
});
```

**Step 3: Test laufen lassen, FAIL erwartet**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: FAIL — `m.dose` ist `undefined`.

**Step 4: `extractLatestMeasurement` erweitern**

In `src/hooks/radiacode/client.ts` (am Ende der Datei), die bestehende Funktion ersetzen durch:

```ts
const DOSE_SV_TO_USV = 1e6;

function extractLatestMeasurement(rsp: ParsedResponse): RadiacodeMeasurement | null {
  if (rsp.data.length < 8) return null;
  const payload = rsp.data.subarray(8);
  const records = decodeDataBufRecords(payload);
  const rt = records.filter((r) => r.type === 'realtime').at(-1);
  if (!rt || rt.type !== 'realtime') return null;

  const rare = records.filter((r) => r.type === 'rare').at(-1);
  const rareValid = rare && rare.type === 'rare' ? rare : null;

  return {
    cps: rt.countRate,
    dosisleistung: rt.doseRate * DOSE_RATE_TO_USVH,
    timestamp: Date.now(),
    ...(rareValid && {
      dose: rareValid.dose * DOSE_SV_TO_USV,
      temperatureC: rareValid.temperatureC,
      chargePct: rareValid.chargePct,
    }),
  };
}
```

**Step 5: Test laufen lassen, PASS erwartet**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: 4 tests pass (3 bestehende + 1 neu).

**Step 6: Commit**

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): dose/temperature/charge aus RareRecord extrahieren"
```

---

## Phase 2 — Pure Helpers

### Task 3: TDD — `pushAndPrune` Ringbuffer

**Files:**

- Create: `src/hooks/radiacode/history.ts`
- Create: `src/hooks/radiacode/history.test.ts`

**Step 1: Failing test schreiben**

```ts
// src/hooks/radiacode/history.test.ts
import { describe, it, expect } from 'vitest';
import { pushAndPrune, RadiacodeSample } from './history';

const s = (t: number, rate = 0.1): RadiacodeSample => ({
  t,
  dosisleistung: rate,
  cps: 1,
});

describe('pushAndPrune', () => {
  it('adds a sample to an empty buffer', () => {
    const out = pushAndPrune([], s(1000), 1000);
    expect(out).toEqual([s(1000)]);
  });

  it('appends while within window', () => {
    const out = pushAndPrune([s(1000)], s(2000), 2000);
    expect(out).toEqual([s(1000), s(2000)]);
  });

  it('drops samples older than windowMs', () => {
    const windowMs = 1000;
    const buf = [s(100), s(500), s(900)];
    const out = pushAndPrune(buf, s(2000), 2000, windowMs);
    expect(out).toEqual([s(2000)]);
  });

  it('keeps samples exactly at window boundary', () => {
    const out = pushAndPrune([s(1000)], s(2000), 2000, 1000);
    expect(out.map((x) => x.t)).toEqual([1000, 2000]);
  });

  it('keeps future-dated samples (clock skew tolerance)', () => {
    const out = pushAndPrune([], s(10_000), 1000, 5000);
    expect(out).toEqual([s(10_000)]);
  });
});
```

**Step 2: Run, FAIL erwartet**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/history.test.ts`
Expected: FAIL — module not found.

**Step 3: Implementation**

```ts
// src/hooks/radiacode/history.ts
export interface RadiacodeSample {
  t: number;
  dosisleistung: number;
  cps: number;
}

const DEFAULT_WINDOW_MS = 5 * 60_000;

export function pushAndPrune(
  samples: RadiacodeSample[],
  next: RadiacodeSample,
  now: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): RadiacodeSample[] {
  const cutoff = now - windowMs;
  const kept = samples.filter((s) => s.t >= cutoff);
  kept.push(next);
  return kept;
}
```

**Step 4: Run, PASS**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/history.test.ts`
Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/history.ts src/hooks/radiacode/history.test.ts
git commit -m "feat(radiacode): pushAndPrune helper für rolling 5-min history"
```

---

### Task 4: TDD — `doseFormat` Utilities

**Files:**

- Create: `src/common/doseFormat.ts`
- Create: `src/common/doseFormat.test.ts`

**Step 1: Failing tests**

```ts
// src/common/doseFormat.test.ts
import { describe, it, expect } from 'vitest';
import {
  doseRateLevel,
  formatDose,
  formatDoseRate,
} from './doseFormat';

describe('formatDoseRate', () => {
  it('uses µSv/h below 1000', () => {
    expect(formatDoseRate(0.12)).toEqual({ value: '0.12', unit: 'µSv/h' });
    expect(formatDoseRate(999.9)).toEqual({ value: '999.90', unit: 'µSv/h' });
  });
  it('switches to mSv/h at 1000 µSv/h', () => {
    expect(formatDoseRate(1000)).toEqual({ value: '1.00', unit: 'mSv/h' });
    expect(formatDoseRate(1500.5)).toEqual({ value: '1.50', unit: 'mSv/h' });
  });
  it('renders zero as 0.00 µSv/h', () => {
    expect(formatDoseRate(0)).toEqual({ value: '0.00', unit: 'µSv/h' });
  });
});

describe('formatDose', () => {
  it('uses µSv below 1000', () => {
    expect(formatDose(12.34)).toEqual({ value: '12.34', unit: 'µSv' });
  });
  it('switches to mSv at 1000 µSv', () => {
    expect(formatDose(1000)).toEqual({ value: '1.00', unit: 'mSv' });
    expect(formatDose(25_000)).toEqual({ value: '25.00', unit: 'mSv' });
  });
});

describe('doseRateLevel', () => {
  it.each([
    [0.1, 'normal'],
    [0.99, 'normal'],
    [1, 'elevated'],
    [9.9, 'elevated'],
    [10, 'high'],
    [99, 'high'],
    [100, 'critical'],
    [5000, 'critical'],
  ] as const)('classifies %s µSv/h as %s', (input, expected) => {
    expect(doseRateLevel(input)).toBe(expected);
  });
});
```

**Step 2: Run, FAIL**

Run: `NO_COLOR=1 npx vitest run src/common/doseFormat.test.ts`

**Step 3: Implementation**

```ts
// src/common/doseFormat.ts
export type DoseRateLevel = 'normal' | 'elevated' | 'high' | 'critical';

export interface FormattedValue {
  value: string;
  unit: string;
}

export function formatDoseRate(microSvPerHour: number): FormattedValue {
  if (microSvPerHour >= 1000) {
    return { value: (microSvPerHour / 1000).toFixed(2), unit: 'mSv/h' };
  }
  return { value: microSvPerHour.toFixed(2), unit: 'µSv/h' };
}

export function formatDose(microSv: number): FormattedValue {
  if (microSv >= 1000) {
    return { value: (microSv / 1000).toFixed(2), unit: 'mSv' };
  }
  return { value: microSv.toFixed(2), unit: 'µSv' };
}

export function doseRateLevel(microSvPerHour: number): DoseRateLevel {
  if (microSvPerHour < 1) return 'normal';
  if (microSvPerHour < 10) return 'elevated';
  if (microSvPerHour < 100) return 'high';
  return 'critical';
}
```

**Step 4: Run, PASS**

Run: `NO_COLOR=1 npx vitest run src/common/doseFormat.test.ts`

**Step 5: Commit**

```bash
git add src/common/doseFormat.ts src/common/doseFormat.test.ts
git commit -m "feat(dosimetrie): doseFormat utilities für auto-scale und level"
```

---

## Phase 3 — RadiacodeProvider

### Task 5: Skizze + TDD — RadiacodeProvider-Context

**Files:**

- Create: `src/components/providers/RadiacodeProvider.tsx`
- Create: `src/components/providers/RadiacodeProvider.test.tsx`

**Step 1: Failing test schreiben**

```tsx
// src/components/providers/RadiacodeProvider.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BleAdapter } from '../../hooks/radiacode/bleAdapter';
import { RadiacodeMeasurement } from '../../hooks/radiacode/types';
import {
  RadiacodeProvider,
  useRadiacode,
} from './RadiacodeProvider';

function nullAdapter(): BleAdapter {
  return {
    isSupported: () => true,
    requestDevice: vi.fn(async () => ({ id: 'dev', name: 'RC-103', serial: 'SN' })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    onNotification: vi.fn(async () => () => {}),
    write: vi.fn(async () => {}),
  };
}

function Probe({ onValue }: { onValue: (v: ReturnType<typeof useRadiacode>) => void }) {
  const ctx = useRadiacode();
  onValue(ctx);
  return <div data-testid="count">{ctx.history.length}</div>;
}

describe('RadiacodeProvider', () => {
  it('exposes status, device, history and connect/disconnect', () => {
    const values: ReturnType<typeof useRadiacode>[] = [];
    render(
      <RadiacodeProvider adapter={nullAdapter()}>
        <Probe onValue={(v) => values.push(v)} />
      </RadiacodeProvider>,
    );
    const ctx = values.at(-1)!;
    expect(ctx.status).toBe('idle');
    expect(ctx.device).toBeNull();
    expect(ctx.measurement).toBeNull();
    expect(ctx.history).toEqual([]);
    expect(typeof ctx.connect).toBe('function');
    expect(typeof ctx.disconnect).toBe('function');
  });

  it('appends to history when measurement changes', async () => {
    // Use factory injection: Provider accepts a measurement$ feeder for tests.
    const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
    const adapter = nullAdapter();
    render(
      <RadiacodeProvider adapter={adapter} feedMeasurement={(fn) => feeds.push(fn)}>
        <Probe onValue={() => {}} />
      </RadiacodeProvider>,
    );

    act(() => {
      feeds[0]({ cps: 1, dosisleistung: 0.1, timestamp: 1000 });
    });
    act(() => {
      feeds[0]({ cps: 1, dosisleistung: 0.2, timestamp: 2000 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });

  it('throws when useRadiacode is used outside the provider', () => {
    const Consumer = () => {
      useRadiacode();
      return null;
    };
    // Suppress React error logging noise
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/RadiacodeProvider/);
    err.mockRestore();
  });
});
```

**Step 2: Run, FAIL**

Run: `NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx`

**Step 3: Provider-Implementation**

```tsx
// src/components/providers/RadiacodeProvider.tsx
'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BleAdapter, getBleAdapter } from '../../hooks/radiacode/bleAdapter';
import {
  loadDefaultDevice,
  saveDefaultDevice,
} from '../../hooks/radiacode/devicePreference';
import { pushAndPrune, RadiacodeSample } from '../../hooks/radiacode/history';
import {
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
} from '../../hooks/radiacode/types';
import {
  RadiacodeStatus,
  useRadiacodeDevice,
} from '../../hooks/radiacode/useRadiacodeDevice';

export interface RadiacodeContextValue {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  history: RadiacodeSample[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const RadiacodeContext = createContext<RadiacodeContextValue | null>(null);

export function useRadiacode(): RadiacodeContextValue {
  const ctx = useContext(RadiacodeContext);
  if (!ctx) {
    throw new Error('useRadiacode must be used within a RadiacodeProvider');
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  adapter?: BleAdapter;
  /** Testing hook: receives a callback that pushes a measurement into the buffer. */
  feedMeasurement?: (push: (m: RadiacodeMeasurement) => void) => void;
}

const NULL_ADAPTER: BleAdapter = {
  isSupported: () => false,
  requestDevice: async () => {
    throw new Error('BLE adapter not initialized');
  },
  connect: async () => {
    throw new Error('BLE adapter not initialized');
  },
  disconnect: async () => {},
  onNotification: async () => () => {},
  write: async () => {},
};

export function RadiacodeProvider({
  children,
  adapter: providedAdapter,
  feedMeasurement,
}: ProviderProps) {
  const [adapter, setAdapter] = useState<BleAdapter>(
    providedAdapter ?? NULL_ADAPTER,
  );
  useEffect(() => {
    if (providedAdapter) return;
    getBleAdapter().then(setAdapter);
  }, [providedAdapter]);

  const {
    status,
    device,
    measurement,
    error,
    scan,
    connect: connectRaw,
    disconnect,
  } = useRadiacodeDevice(adapter);

  const [history, setHistory] = useState<RadiacodeSample[]>([]);

  // Append live measurements.
  useEffect(() => {
    if (!measurement) return;
    setHistory((prev) =>
      pushAndPrune(
        prev,
        {
          t: measurement.timestamp,
          dosisleistung: measurement.dosisleistung,
          cps: measurement.cps,
        },
        measurement.timestamp,
      ),
    );
  }, [measurement]);

  // Testing feeder
  const feederRef = useRef(feedMeasurement);
  useEffect(() => {
    feederRef.current?.((m) => {
      setHistory((prev) =>
        pushAndPrune(
          prev,
          { t: m.timestamp, dosisleistung: m.dosisleistung, cps: m.cps },
          m.timestamp,
        ),
      );
    });
  }, []);

  // scan + connect combined
  const connect = useCallback(async () => {
    const scanned = await scan();
    if (!scanned) return;
    await saveDefaultDevice(scanned);
    await connectRaw(scanned);
  }, [scan, connectRaw]);

  // Load default device on mount (non-autoconnect, user must press Connect)
  useEffect(() => {
    loadDefaultDevice().catch(() => null);
  }, []);

  const value = useMemo<RadiacodeContextValue>(
    () => ({
      status,
      device,
      measurement,
      history,
      error,
      connect,
      disconnect,
    }),
    [status, device, measurement, history, error, connect, disconnect],
  );

  return (
    <RadiacodeContext.Provider value={value}>
      {children}
    </RadiacodeContext.Provider>
  );
}
```

**Step 4: Run, PASS**

Run: `NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx`

Falls Tests noch rot: check `feedMeasurement`-Kontrakt. Die Provider-Logik oben ruft den feeder einmalig nach Mount und übergibt ihm eine `push`-Funktion, die das Test verwendet.

**Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/providers/RadiacodeProvider.tsx src/components/providers/RadiacodeProvider.test.tsx
git commit -m "feat(radiacode): RadiacodeProvider mit global shared connection und 5-min history"
```

---

### Task 6: Provider ins App-Layout einhängen

**Files:**

- Modify: `src/components/providers/AppProviders.tsx`

**Step 1: Einhängen**

In `LogedinApp`: `RadiacodeProvider` innerhalb von `FirecallProvider`, damit der Provider erst nach Auth gemountet wird (keine BLE-Permission-Prompts für Non-User).

```tsx
// In LogedinApp, zwischen FirecallProvider und DebugLoggingProvider:
<FirecallProvider>
  <RadiacodeProvider>
    <DebugLoggingProvider>
      {/* ... bestehend ... */}
    </DebugLoggingProvider>
  </RadiacodeProvider>
</FirecallProvider>
```

Import am Dateianfang:

```tsx
import RadiacodeProvider from './RadiacodeProvider';
```

Hinweis: `RadiacodeProvider` wird als **named export** definiert. Passe den Import an (`import { RadiacodeProvider } from './RadiacodeProvider'`).

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npm run test`
Expected: alle bisherigen Tests bleiben grün (der Provider hat keinen Seiteneffekt ohne `connect()`-Aufruf).

**Step 3: Commit**

```bash
git add src/components/providers/AppProviders.tsx
git commit -m "feat(radiacode): RadiacodeProvider im App-Layout mounten"
```

---

## Phase 4 — Bestehende Map-Konsumenten auf Provider umstellen

### Task 7: `RadiacodeLiveWidget` → Context

**Files:**

- Modify: `src/components/Map/RadiacodeLiveWidget.tsx`
- Modify: `src/components/Map/RadiacodeLiveWidget.test.tsx`

**Step 1: Widget liest aus Context**

Ersetze den Prop-basierten `measurement`-Input durch `useRadiacode()`. Die Widget-Props werden auf `{ visible?: boolean }` o.ä. reduziert (je nach bisheriger API). Prüfe vorher den aktuellen Stand:

Run: `Read /.../src/components/Map/RadiacodeLiveWidget.tsx`

Wenn die Widget-Props bereits so gebaut sind, dass das Widget das `measurement` als Prop bekommt, ändere:

```tsx
// vorher:
export default function RadiacodeLiveWidget({ measurement, ... }: Props) { ... }

// nachher:
import { useRadiacode } from '../providers/RadiacodeProvider';
export default function RadiacodeLiveWidget({ visible = true }: { visible?: boolean }) {
  const { measurement } = useRadiacode();
  if (!visible || !measurement) return null;
  ...
}
```

**Step 2: Widget-Test anpassen**

Im Test: `render(<RadiacodeProvider adapter={mockAdapter} feedMeasurement={...}><Widget /></RadiacodeProvider>)` statt Prop-Injection.

Erhalte die Verhaltenstests (Schwellen, Darstellung) — nur die Injection-Strategie ändert sich.

**Step 3: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/Map/RadiacodeLiveWidget.test.tsx`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/Map/RadiacodeLiveWidget.tsx src/components/Map/RadiacodeLiveWidget.test.tsx
git commit -m "refactor(map): RadiacodeLiveWidget nutzt RadiacodeProvider"
```

---

### Task 8: `RecordButton` → Context

**Files:**

- Modify: `src/components/Map/RecordButton.tsx`

**Step 1: Lokalen `useRadiacodeDevice` entfernen**

- Zeilen ~54–66: entferne lokalen `adapter`-State, `getBleAdapter()`-Effect und `useRadiacodeDevice(adapter)`.
- Ersetze durch `const { measurement, device, connect: ctxConnect, disconnect: ctxDisconnect, status } = useRadiacode();`
- `scan()` im Dialog-Handler ersetzen durch `ctxConnect()` (Provider macht scan+connect zusammen). Falls der RecordButton getrennten Scan-Flow braucht, `useRadiacode()` um `scan`-Action erweitern und im Provider re-exportieren.
- Import-Cleanup: `BleAdapter`, `getBleAdapter`, `NULL_ADAPTER`, `useRadiacodeDevice` entfernen.

**Step 2: Foreground-Service-Hooks behalten**

Die Adapter-Methoden `startForegroundService` / `stopForegroundService` sind an den Adapter gebunden. Damit der RecordButton sie weiterhin triggern kann, erweitere `RadiacodeContextValue` um:

```ts
startForegroundService?: (opts: { title: string; body: string }) => Promise<void>;
stopForegroundService?: () => Promise<void>;
```

Implementiere sie im Provider durch Forwarding zum Adapter:

```ts
startForegroundService: adapter.startForegroundService
  ? (opts) => adapter.startForegroundService!(opts)
  : undefined,
```

**Step 3: tsc + tests**

Run: `npx tsc --noEmit && NO_COLOR=1 npm run test`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/Map/RecordButton.tsx src/components/providers/RadiacodeProvider.tsx src/components/providers/RadiacodeProvider.test.tsx
git commit -m "refactor(map): RecordButton nutzt RadiacodeProvider"
```

---

### Task 9: `useRadiacodePointRecorder` — Measurement-Quelle prüfen

**Files:**

- Read: `src/hooks/recording/useRadiacodePointRecorder.ts`

**Step 1:** Der Hook bekommt `measurement` und `device` per Parameter (siehe RecordButton.tsx:68–77). Das bleibt so — kein Refactor nötig, weil der RecordButton in Task 8 bereits auf die Context-Werte umgestellt wurde.

Verifiziere: `grep -n measurement src/hooks/recording/useRadiacodePointRecorder.ts` — Interface akzeptiert `measurement` als Input.

Wenn ja: kein Commit, kein Code-Change.

---

## Phase 5 — Dosimetrie-Seite UI

### Task 10: Route + Page-Stub

**Files:**

- Create: `src/app/schadstoff/dosimetrie/page.tsx`
- Create: `src/components/pages/Dosimetrie.tsx` (Minimal-Stub)

**Step 1: Route-Wrapper**

```tsx
// src/app/schadstoff/dosimetrie/page.tsx
'use client';

import dynamic from 'next/dynamic';

const Dosimetrie = dynamic(
  () => import('../../../components/pages/Dosimetrie'),
  { ssr: false, loading: () => null },
);

export default function DosimetriePage() {
  return <Dosimetrie />;
}
```

**Step 2: Stub**

```tsx
// src/components/pages/Dosimetrie.tsx
'use client';

import Typography from '@mui/material/Typography';

export default function Dosimetrie() {
  return <Typography variant="h5">Dosimetrie</Typography>;
}
```

**Step 3: Dev-Server kurz anwerfen und Route öffnen (manuell) — nicht committen, bis die Page echte Inhalte zeigt. Alternativ: gleich weiter zu Task 11.**

**Step 4: Commit**

```bash
git add src/app/schadstoff/dosimetrie/page.tsx src/components/pages/Dosimetrie.tsx
git commit -m "feat(dosimetrie): route /schadstoff/dosimetrie + stub"
```

---

### Task 11: TDD — Dosimetrie-Page Render ohne Verbindung

**Files:**

- Create: `src/components/pages/Dosimetrie.test.tsx`
- Modify: `src/components/pages/Dosimetrie.tsx`

**Step 1: Failing test**

```tsx
// src/components/pages/Dosimetrie.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadiacodeContextValue } from '../providers/RadiacodeProvider';
import Dosimetrie from './Dosimetrie';

vi.mock('../providers/RadiacodeProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../providers/RadiacodeProvider')>(
      '../providers/RadiacodeProvider',
    );
  return {
    ...actual,
    useRadiacode: vi.fn(),
  };
});

// Mock MUI X LineChart to avoid canvas rendering in JSDOM.
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ yAxis }: { yAxis?: { scaleType?: string }[] }) => (
    <div data-testid="linechart" data-scale={yAxis?.[0]?.scaleType ?? 'linear'} />
  ),
}));

import { useRadiacode } from '../providers/RadiacodeProvider';
const mockedUseRadiacode = vi.mocked(useRadiacode);

function fixture(partial: Partial<RadiacodeContextValue> = {}): RadiacodeContextValue {
  return {
    status: 'idle',
    device: null,
    measurement: null,
    history: [],
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    ...partial,
  };
}

describe('Dosimetrie', () => {
  it('renders connect button and placeholders when disconnected', () => {
    mockedUseRadiacode.mockReturnValue(fixture());
    render(<Dosimetrie />);
    expect(screen.getByRole('button', { name: /verbinden/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /trennen/i })).toBeDisabled();
    expect(screen.getByText(/keine messdaten/i)).toBeInTheDocument();
  });

  it('renders live values and enabled disconnect when connected', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'id', name: 'RC-103', serial: 'SN123' },
        measurement: {
          dosisleistung: 0.25,
          cps: 7,
          timestamp: 1000,
          dose: 456,
        },
        history: [
          { t: 0, dosisleistung: 0.2, cps: 5 },
          { t: 1000, dosisleistung: 0.25, cps: 7 },
        ],
      }),
    );
    render(<Dosimetrie />);
    expect(screen.getByText(/RC-103/)).toBeInTheDocument();
    expect(screen.getByText(/0\.25/)).toBeInTheDocument();  // dose rate
    expect(screen.getByText(/µSv\/h/)).toBeInTheDocument();
    expect(screen.getByText(/456\.00/)).toBeInTheDocument(); // dose µSv
    expect(screen.getByText(/^7$/)).toBeInTheDocument();     // cps
    expect(screen.getByRole('button', { name: /trennen/i })).toBeEnabled();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });

  it('toggles chart y-axis between log and linear', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'id', name: 'RC-103', serial: 'SN' },
        measurement: { dosisleistung: 1, cps: 1, timestamp: 1 },
        history: [{ t: 1, dosisleistung: 1, cps: 1 }],
      }),
    );
    render(<Dosimetrie />);
    const chart = screen.getByTestId('linechart');
    expect(chart.getAttribute('data-scale')).toBe('log');
    await user.click(screen.getByRole('checkbox', { name: /log/i }));
    expect(screen.getByTestId('linechart').getAttribute('data-scale')).toBe('linear');
  });

  it('shows error alert on error state', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({ status: 'error', error: 'BLE denied' }),
    );
    render(<Dosimetrie />);
    expect(screen.getByText(/BLE denied/)).toBeInTheDocument();
  });
});
```

**Step 2: Run, FAIL**

Run: `NO_COLOR=1 npx vitest run src/components/pages/Dosimetrie.test.tsx`

**Step 3: Dosimetrie-Komponente implementieren**

```tsx
// src/components/pages/Dosimetrie.tsx
'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { useMemo, useState } from 'react';
import {
  doseRateLevel,
  formatDose,
  formatDoseRate,
} from '../../common/doseFormat';
import { useRadiacode } from '../providers/RadiacodeProvider';

const LEVEL_COLOR: Record<ReturnType<typeof doseRateLevel>, string> = {
  normal: '#4caf50',
  elevated: '#ffeb3b',
  high: '#ff9800',
  critical: '#f44336',
};

function MetricTile({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        minWidth: 160,
        flex: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h3"
        sx={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
        {unit && (
          <Typography component="span" variant="h6" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Typography>
    </Box>
  );
}

export default function Dosimetrie() {
  const { status, device, measurement, history, error, connect, disconnect } =
    useRadiacode();
  const [logScale, setLogScale] = useState(true);

  const rateLevel = measurement ? doseRateLevel(measurement.dosisleistung) : 'normal';
  const rateColor = LEVEL_COLOR[rateLevel];

  const rateFmt = measurement
    ? formatDoseRate(measurement.dosisleistung)
    : { value: '—', unit: '' };
  const doseFmt =
    measurement && measurement.dose !== undefined
      ? formatDose(measurement.dose)
      : { value: '—', unit: '' };

  const chartData = useMemo(() => {
    const now = history.length ? history[history.length - 1].t : Date.now();
    return history.map((s) => ({
      x: (s.t - now) / 1000, // seconds relative to latest
      y: logScale ? Math.max(s.dosisleistung, 0.01) : s.dosisleistung,
    }));
  }, [history, logScale]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Dosimetrie</Typography>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip
          label={
            status === 'connected'
              ? `Verbunden — ${device?.name} (${device?.serial})`
              : status === 'connecting'
              ? 'Verbindet …'
              : status === 'scanning'
              ? 'Scannen …'
              : status === 'error'
              ? 'Fehler'
              : 'Getrennt'
          }
          color={status === 'connected' ? 'success' : 'default'}
        />
        <Button
          variant="contained"
          onClick={() => connect()}
          disabled={status === 'connecting' || status === 'scanning'}
        >
          Verbinden
        </Button>
        <Button
          variant="outlined"
          onClick={() => disconnect()}
          disabled={status !== 'connected'}
        >
          Trennen
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <MetricTile
          label="Dosisleistung"
          value={rateFmt.value}
          unit={rateFmt.unit}
          color={rateColor}
        />
        <MetricTile
          label="Gesamtdosis"
          value={doseFmt.value}
          unit={doseFmt.unit}
        />
        <MetricTile
          label="Zählrate"
          value={measurement ? String(Math.round(measurement.cps)) : '—'}
          unit={measurement ? 'cps' : undefined}
        />
      </Stack>

      <Box sx={{ position: 'relative', minHeight: 280 }}>
        <FormControlLabel
          sx={{ position: 'absolute', right: 8, top: 0, zIndex: 1 }}
          control={
            <Switch
              checked={logScale}
              onChange={(_, v) => setLogScale(v)}
              inputProps={{ 'aria-label': 'Log' }}
            />
          }
          label="Log"
        />
        {chartData.length === 0 ? (
          <Typography sx={{ mt: 4 }} color="text.secondary">
            Keine Messdaten — Gerät verbinden
          </Typography>
        ) : (
          <LineChart
            height={280}
            series={[
              {
                data: chartData.map((d) => d.y),
                color: rateColor,
                showMark: false,
              },
            ]}
            xAxis={[
              {
                data: chartData.map((d) => d.x),
                label: 'Sekunden',
                scaleType: 'linear',
              },
            ]}
            yAxis={[
              {
                scaleType: logScale ? 'log' : 'linear',
                label: 'µSv/h',
              },
            ]}
          />
        )}
      </Box>
    </Stack>
  );
}
```

**Step 4: Run, PASS**

Run: `NO_COLOR=1 npx vitest run src/components/pages/Dosimetrie.test.tsx`
Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/components/pages/Dosimetrie.tsx src/components/pages/Dosimetrie.test.tsx
git commit -m "feat(dosimetrie): live-anzeige mit messwert-kacheln und 5-min chart"
```

---

## Phase 6 — Navigation & Final Check

### Task 12: AppDrawer-Menü

**Files:**

- Modify: `src/components/site/AppDrawer.tsx`

**Step 1:** Im `Schadstoff.children`-Array neuen Eintrag hinzufügen (z.B. nach `Strahlenschutz`):

```tsx
{
  text: 'Dosimetrie',
  icon: <Icon path={mdiRadiationIcon} size={1} />,  // oder ein passendes MUI-Icon wie <SpeedIcon />
  href: '/schadstoff/dosimetrie',
  einsatzSection: 'schadstoff/dosimetrie',
},
```

Falls kein Radiation-Icon bequem verfügbar ist: nimm `import SpeedIcon from '@mui/icons-material/Speed';` oder `import SensorsIcon from '@mui/icons-material/Sensors';`.

**Step 2: Navigation manuell prüfen**

Run: `npm run dev`
Öffne `http://localhost:3000` → Drawer → Schadstoff → Dosimetrie. Seite lädt, Connect-Button sichtbar.

**Step 3: Commit**

```bash
git add src/components/site/AppDrawer.tsx
git commit -m "feat(dosimetrie): menüeintrag unter Schadstoff"
```

---

### Task 13: Full Check

**Step 1:** Lint, tsc, tests, build

Run: `git checkout -- next-env.d.ts && NO_COLOR=1 npm run check`

Expected: alles grün. Falls neue Lint-Warnings im touched code auftauchen, beheben (kein Commit mit Warnings).

**Step 2:** Sollte es scheitern:
- tsc-Fehler → beheben, nicht ignorieren.
- Lint-Fehler → beheben.
- Test-Fehler → zurück zur verursachenden Task.

**Step 3:** Commit ggf. fixes:

```bash
git add -u
git commit -m "chore(dosimetrie): lint/tsc fixes"
```

---

### Task 14: Manual Smoke Test

**Step 1:** `npm run dev`, Login, Navigation zur Dosimetrie-Seite.

- Ohne Radiacode: Connect-Button aktiv, Trennen-Button disabled. Chart-Platzhalter sichtbar.
- Mit Radiacode (oder Browser-Bluetooth-Mock): Verbinden → Picker → Gerät wählen → Werte laufen live. Log/Linear-Toggle ändert sichtbar die Y-Achse.
- Trennen → Werte werden `—`. Chart behält die letzten 5 min (Buffer bleibt).
- Seite verlassen, zurückkommen: Buffer und ggf. Verbindung bleiben bestehen (Provider global).

**Step 2:** Kurze Notiz im PR-Testplan: Welche Geräte/Browser getestet (z.B. Chrome Desktop + Capacitor Android).

---

### Task 15: PR erstellen

**Step 1:** Branch pushen, PR öffnen.

```bash
git push -u origin feat/radiacode-dosimetrie
GITHUB_TOKEN= gh pr create --base feat/radiacode-via-bluetooth --title "feat(dosimetrie): live-dosimetrie-seite mit 5-min verlauf" --body "$(cat <<'EOF'
## Zusammenfassung

Neue Seite unter **Schadstoff › Dosimetrie** (`/schadstoff/dosimetrie`) für die Live-Anzeige der Radiacode-Messwerte außerhalb einer Einsatzaufzeichnung. Verwendet einen globalen `RadiacodeProvider`, der auch das bestehende Karten-Recording versorgt — damit gibt es nur eine BLE-Verbindung, egal von wo aus sie gestartet wurde.

## Änderungen

- Neuer `RadiacodeProvider` (Context) mit Verbindung, Measurement-Stream und rollierendem 5-min-Verlauf.
- Protokoll-Client extrahiert zusätzlich `dose` (µSv, aus RareRecord), `temperatureC`, `chargePct`.
- Neue Utilities: `pushAndPrune` (history), `formatDoseRate` / `formatDose` / `doseRateLevel`.
- Neue Seite `Dosimetrie.tsx` mit Verbindungsleiste, Messwert-Kacheln (Dosisleistung, Gesamtdosis, CPS) und MUI-X-LineChart mit Log/Linear-Toggle.
- Bestehende Map-Konsumenten (`RecordButton`, `RadiacodeLiveWidget`) nutzen den Provider.
- Navigationseintrag unter Schadstoff.

## Test plan

- [ ] `npm run check` grün.
- [ ] Manuell: Desktop-Chrome → Verbindung aufbauen, Werte sichtbar, Log/Linear-Toggle funktioniert.
- [ ] Manuell: Capacitor-Android-APK → BLE-Verbindung, Werte laufen, Trennen/Wiederverbinden funktioniert.
- [ ] Karten-Recording weiterhin funktionsfähig (nutzt jetzt Provider).
EOF
)"
```

**Step 2:** URL zurückgeben.

---

## Offene Risiken beim Ausführen

- **RareRecord im Fixture**: Wenn der Fixture-Poll des Geräts noch **keinen** RareRecord mitliefert, greift Task 2 nur durch den synthetischen Record im Test. Das ist OK — `extractLatestMeasurement` ist rückwärtskompatibel (dose/temperature/charge sind optional).
- **Bluetooth-Berechtigung**: Der Provider ruft keinen `scan()` automatisch. Nutzer:in muss "Verbinden" klicken — das ist bewusst, um keine ungewollten Browser-Permissions-Prompts auszulösen.
- **Refactor-Breite**: Wenn Task 8/9 in einem PR-Review kritisch gesehen werden, kann Task 7/8 in einen Folge-PR verschoben werden. Dann hätte die Dosimetrie-Seite vorübergehend eine eigene Verbindung. Da BLE exklusiv ist, würde in dem Fall das Karten-Recording parallele Radiacode-Verbindungen verhindern; das ist aber akzeptabel als Zwischenschritt.
- **`useRadiacode()` Throw außerhalb Provider**: Tests, die den `RadiacodeLiveWidget` ohne Provider rendern, brechen. Diese Tests werden in Task 7 auf den Provider umgestellt.
