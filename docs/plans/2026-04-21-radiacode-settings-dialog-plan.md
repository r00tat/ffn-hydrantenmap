# Radiacode Settings-Dialog — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auf der Dosimetrie-Seite einen Settings-Button ergänzen, der einen Dialog zum Lesen und Schreiben einsatzrelevanter Radiacode-Geräte-Einstellungen über BLE öffnet.

**Architecture:** Protokoll-Layer um VSFR-Read/Write-Helper erweitern → Client-Methoden für `readSettings`/`writeSettings`/`playSignal`/`doseReset` → React-Dialog mit lokalem Form-State, „Speichern" schreibt nur Diff. Action-Buttons (Signalton, Dosis-Reset) sind One-Shot-Commands ausserhalb des Save-Flows.

**Tech Stack:** TypeScript, React 19, MUI, Vitest + @testing-library/react, bestehende BLE-Adapter/Client-Infrastruktur in `src/hooks/radiacode/`.

**Referenz:** [docs/plans/2026-04-21-radiacode-settings-dialog-design.md](./2026-04-21-radiacode-settings-dialog-design.md), [docs/radiacode-bluetooth-protocol.md](../radiacode-bluetooth-protocol.md).

---

## Annahmen zur Wire-Protokoll-Kodierung

- **RD_VIRT_SFR Request-Args:** `<u32 LE vsfr_id>` (wie `u32le(VS.DATA_BUF)` in [client.ts:169-170](../../src/hooks/radiacode/client.ts#L169-L170)).
- **RD_VIRT_SFR Response-Body** (nach 4-Byte-Frame-Header): `<u32 LE retcode=1><value bytes>`. Der Wert folgt direkt hinter dem retcode. Länge je nach VSFR-Typ (u32=4, u8=1, bool=1). Diese Struktur leite ich aus dem WR_VIRT_SFR-Body (`<u32 retcode>`, siehe [client.test.ts:211-213](../../src/hooks/radiacode/client.test.ts#L211-L213)) ab und ergänze sie um den Value. Falls das Gerät real anders antwortet, wird Task 3 im echten Trace korrigiert; bis dahin deckt der Unit-Test das Contract ab.
- **WR_VIRT_SFR Request-Args:** `<u32 LE vsfr_id><value bytes>`, Value in der zum Typ passenden Breite.
- **WR_VIRT_SFR Response-Body:** `<u32 LE retcode=1>` — wird nicht weiter ausgewertet (Erfolg = Response-Empfang).

---

## Task 1: Settings-Typ + VSFR-Konstanten ergänzen

**Files:**
- Modify: `src/hooks/radiacode/types.ts` (ergänzt das `RadiacodeSettings`-Interface)
- Modify: `src/hooks/radiacode/protocol.ts:103-107` (erweitert `VSFR`-Objekt)

**Step 1: Einfügen des `RadiacodeSettings`-Interfaces in `types.ts`**

Am Ende der Datei:

```ts
export interface RadiacodeSettings {
  doseRateAlarm1uRh: number;
  doseRateAlarm2uRh: number;
  doseAlarm1uR: number;
  doseAlarm2uR: number;
  soundOn: boolean;
  soundVolume: number;
  vibroOn: boolean;
  ledsOn: boolean;
  doseUnitsSv: boolean;
  countRateCpm: boolean;
  doseRateNSvh: boolean;
}
```

**Step 2: Erweitern von `VSFR` in `protocol.ts`**

```ts
export const VSFR = {
  DEVICE_TIME: 0x0504,
  RAW_FILTER: 0x8006,
  SPEC_RESET: 0x0803,
  // Signalisierung
  SOUND_VOL: 0x0521,
  SOUND_ON: 0x0522,
  VIBRO_ON: 0x0531,
  LEDS_ON: 0x0545,
  PLAY_SIGNAL: 0x05e1,
  // Alarm-Schwellen + Einheiten
  DR_LEV1_uR_h: 0x8000,
  DR_LEV2_uR_h: 0x8001,
  DS_UNITS: 0x8004,
  DOSE_RESET: 0x8007,
  USE_nSv_h: 0x800c,
  CR_UNITS: 0x8013,
  DS_LEV1_uR: 0x8014,
  DS_LEV2_uR: 0x8015,
} as const;
```

**Step 3: Compile-Check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/hooks/radiacode/types.ts src/hooks/radiacode/protocol.ts
git commit -m "feat(radiacode): Settings-Typ und VSFR-Konstanten fuer Konfig"
```

---

## Task 2: VSFR Encoder-Helper (test-first)

**Files:**
- Modify: `src/hooks/radiacode/protocol.test.ts` (neuer `describe`-Block am Ende)
- Modify: `src/hooks/radiacode/protocol.ts` (Exports)

**Step 1: Failing-Test hinzufügen**

Am Ende der Test-Datei:

```ts
describe('VSFR encoders', () => {
  it('encodeVsfrRead packs the id as u32 LE', () => {
    const bytes = encodeVsfrRead(0x8000);
    expect(Array.from(bytes)).toEqual([0x00, 0x80, 0x00, 0x00]);
  });

  it('encodeVsfrWriteU32 packs id + value as two u32 LE', () => {
    const bytes = encodeVsfrWriteU32(VSFR.DR_LEV1_uR_h, 0x12345678);
    expect(Array.from(bytes)).toEqual([
      0x00, 0x80, 0x00, 0x00,
      0x78, 0x56, 0x34, 0x12,
    ]);
  });

  it('encodeVsfrWriteU8 packs id (u32) + value (u8)', () => {
    const bytes = encodeVsfrWriteU8(VSFR.SOUND_VOL, 7);
    expect(Array.from(bytes)).toEqual([0x21, 0x05, 0x00, 0x00, 0x07]);
  });

  it('encodeVsfrWriteBool packs id (u32) + 0/1 (u8)', () => {
    const on = encodeVsfrWriteBool(VSFR.SOUND_ON, true);
    const off = encodeVsfrWriteBool(VSFR.SOUND_ON, false);
    expect(Array.from(on)).toEqual([0x22, 0x05, 0x00, 0x00, 0x01]);
    expect(Array.from(off)).toEqual([0x22, 0x05, 0x00, 0x00, 0x00]);
  });
});
```

Import ergänzen (oben): `encodeVsfrRead`, `encodeVsfrWriteU32`, `encodeVsfrWriteU8`, `encodeVsfrWriteBool`, `VSFR` — noch nicht exportiert.

**Step 2: Test laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/protocol.test.ts`
Expected: FAIL (`encodeVsfrRead is not a function`).

**Step 3: Implementierung**

In `protocol.ts`:

```ts
export function encodeVsfrRead(id: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, id, true);
  return buf;
}

export function encodeVsfrWriteU32(id: number, value: number): Uint8Array {
  const buf = new Uint8Array(8);
  const v = new DataView(buf.buffer);
  v.setUint32(0, id, true);
  v.setUint32(4, value, true);
  return buf;
}

export function encodeVsfrWriteU8(id: number, value: number): Uint8Array {
  const buf = new Uint8Array(5);
  const v = new DataView(buf.buffer);
  v.setUint32(0, id, true);
  buf[4] = value & 0xff;
  return buf;
}

export function encodeVsfrWriteBool(id: number, value: boolean): Uint8Array {
  return encodeVsfrWriteU8(id, value ? 1 : 0);
}
```

Die ebenfalls `VSFR` wird aus dem Objekt-Export bereits erreichbar (Re-Check `export const VSFR`), der Import im Test ist dadurch gültig.

**Step 4: Tests erneut laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/protocol.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/protocol.ts src/hooks/radiacode/protocol.test.ts
git commit -m "feat(radiacode): VSFR Read/Write Encoder mit Tests"
```

---

## Task 3: VSFR Decoder-Helper (test-first)

**Files:**
- Modify: `src/hooks/radiacode/protocol.test.ts`
- Modify: `src/hooks/radiacode/protocol.ts`

**Step 1: Failing-Tests hinzufügen**

Am Ende der Test-Datei:

```ts
describe('VSFR decoders', () => {
  it('decodeVsfrU32 returns the value after the retcode', () => {
    const payload = new Uint8Array(8);
    const v = new DataView(payload.buffer);
    v.setUint32(0, 1, true); // retcode
    v.setUint32(4, 4200, true); // value
    expect(decodeVsfrU32(payload)).toBe(4200);
  });

  it('decodeVsfrU8 reads 1 byte after retcode', () => {
    const payload = new Uint8Array(5);
    const v = new DataView(payload.buffer);
    v.setUint32(0, 1, true);
    payload[4] = 7;
    expect(decodeVsfrU8(payload)).toBe(7);
  });

  it('decodeVsfrBool returns true for non-zero, false for zero', () => {
    const on = new Uint8Array([1, 0, 0, 0, 1]);
    const off = new Uint8Array([1, 0, 0, 0, 0]);
    expect(decodeVsfrBool(on)).toBe(true);
    expect(decodeVsfrBool(off)).toBe(false);
  });

  it('throws when retcode is not 1', () => {
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setUint32(0, 5, true);
    expect(() => decodeVsfrU32(payload)).toThrow(/retcode/i);
  });

  it('throws when payload is too short for the expected value type', () => {
    expect(() => decodeVsfrU32(new Uint8Array(6))).toThrow(/too short/i);
    expect(() => decodeVsfrU8(new Uint8Array(4))).toThrow(/too short/i);
  });
});
```

Imports ergänzen: `decodeVsfrU32`, `decodeVsfrU8`, `decodeVsfrBool`.

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/protocol.test.ts`
Expected: FAIL (undefined functions).

**Step 3: Implementierung**

In `protocol.ts`:

```ts
function checkVsfrRetcode(payload: Uint8Array): DataView {
  if (payload.length < 4) {
    throw new Error('VSFR response too short: missing retcode');
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const retcode = view.getUint32(0, true);
  if (retcode !== 1) {
    throw new Error(`VSFR retcode ${retcode} (expected 1)`);
  }
  return view;
}

export function decodeVsfrU32(payload: Uint8Array): number {
  if (payload.length < 8) {
    throw new Error(`VSFR U32 response too short: ${payload.length} B (need 8)`);
  }
  const view = checkVsfrRetcode(payload);
  return view.getUint32(4, true);
}

export function decodeVsfrU8(payload: Uint8Array): number {
  if (payload.length < 5) {
    throw new Error(`VSFR U8 response too short: ${payload.length} B (need 5)`);
  }
  checkVsfrRetcode(payload);
  return payload[4];
}

export function decodeVsfrBool(payload: Uint8Array): boolean {
  return decodeVsfrU8(payload) !== 0;
}
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/protocol.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/protocol.ts src/hooks/radiacode/protocol.test.ts
git commit -m "feat(radiacode): VSFR Response-Decoder mit Tests"
```

---

## Task 4: Client `readSfr*`/`writeSfr*` Low-Level-Methoden (test-first)

**Files:**
- Modify: `src/hooks/radiacode/client.test.ts`
- Modify: `src/hooks/radiacode/client.ts`

**Step 1: Failing-Tests hinzufügen**

Am Ende der `describe('RadiacodeClient')`-Block:

```ts
it('readSfrU32 sends RD_VIRT_SFR(id) and decodes the u32 value', async () => {
  vi.useRealTimers();
  const adapter = makeAdapter();
  let seqCounter = 0;
  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR)
      return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
    if (cmd === COMMAND.RD_VIRT_SFR) {
      const payload = new Uint8Array(8);
      const v = new DataView(payload.buffer);
      v.setUint32(0, 1, true); // retcode
      v.setUint32(4, 1337, true); // value
      return buildResponseChunks(cmd, seq, payload);
    }
    return null;
  });
  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  const value = await client.readSfrU32(VSFR.DR_LEV1_uR_h);
  expect(value).toBe(1337);
  // Verify args of the last RD_VIRT_SFR were <u32 id LE>
  const lastWrite = adapter.writes[adapter.writes.length - 1];
  // frame layout: <len(4)><cmd(2)><pad(1)><seq(1)><args...>
  const args = lastWrite.slice(8);
  expect(Array.from(args)).toEqual([0x00, 0x80, 0x00, 0x00]);
  await client.disconnect();
});

it('writeSfrBool sends WR_VIRT_SFR(id, 0/1)', async () => {
  vi.useRealTimers();
  const adapter = makeAdapter();
  let seqCounter = 0;
  const wrFrames: Uint8Array[] = [];
  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR) {
      wrFrames.push(frame);
      return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
    }
    return null;
  });
  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  const framesBefore = wrFrames.length;
  await client.writeSfrBool(VSFR.SOUND_ON, true);
  expect(wrFrames.length).toBe(framesBefore + 1);
  const args = wrFrames[wrFrames.length - 1].slice(8);
  expect(Array.from(args)).toEqual([0x22, 0x05, 0x00, 0x00, 0x01]);
  await client.disconnect();
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: FAIL.

**Step 3: Implementierung in `client.ts`**

Imports oben ergänzen:

```ts
import {
  ...
  decodeVsfrBool,
  decodeVsfrU32,
  decodeVsfrU8,
  encodeVsfrRead,
  encodeVsfrWriteBool,
  encodeVsfrWriteU32,
  encodeVsfrWriteU8,
  ...
} from './protocol';
```

Neue Methoden (nach `specReset`):

```ts
async readSfrU32(id: number): Promise<number> {
  const rsp = await this.execute(COMMAND.RD_VIRT_SFR, encodeVsfrRead(id));
  return decodeVsfrU32(rsp.data);
}

async readSfrU8(id: number): Promise<number> {
  const rsp = await this.execute(COMMAND.RD_VIRT_SFR, encodeVsfrRead(id));
  return decodeVsfrU8(rsp.data);
}

async readSfrBool(id: number): Promise<boolean> {
  const rsp = await this.execute(COMMAND.RD_VIRT_SFR, encodeVsfrRead(id));
  return decodeVsfrBool(rsp.data);
}

async writeSfrU32(id: number, value: number): Promise<void> {
  await this.execute(COMMAND.WR_VIRT_SFR, encodeVsfrWriteU32(id, value));
}

async writeSfrU8(id: number, value: number): Promise<void> {
  await this.execute(COMMAND.WR_VIRT_SFR, encodeVsfrWriteU8(id, value));
}

async writeSfrBool(id: number, value: boolean): Promise<void> {
  await this.execute(COMMAND.WR_VIRT_SFR, encodeVsfrWriteBool(id, value));
}
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): Low-Level VSFR Read/Write am Client"
```

---

## Task 5: `readSettings` (test-first)

**Files:**
- Modify: `src/hooks/radiacode/client.test.ts`
- Modify: `src/hooks/radiacode/client.ts`

**Step 1: Failing-Test hinzufügen**

Im selben `describe('RadiacodeClient')`-Block:

```ts
it('readSettings reads all 11 VSFRs and returns a RadiacodeSettings object', async () => {
  vi.useRealTimers();
  const adapter = makeAdapter();
  let seqCounter = 0;

  // Map of VSFR id → mock response body (u32/u8/bool as used).
  const u32 = (value: number) => {
    const p = new Uint8Array(8);
    const v = new DataView(p.buffer);
    v.setUint32(0, 1, true);
    v.setUint32(4, value, true);
    return p;
  };
  const u8 = (value: number) => {
    const p = new Uint8Array(5);
    new DataView(p.buffer).setUint32(0, 1, true);
    p[4] = value;
    return p;
  };
  const responses: Record<number, Uint8Array> = {
    [VSFR.DR_LEV1_uR_h]: u32(100_000),
    [VSFR.DR_LEV2_uR_h]: u32(200_000),
    [VSFR.DS_LEV1_uR]: u32(10_000_000),
    [VSFR.DS_LEV2_uR]: u32(20_000_000),
    [VSFR.SOUND_ON]: u8(1),
    [VSFR.SOUND_VOL]: u8(5),
    [VSFR.VIBRO_ON]: u8(0),
    [VSFR.LEDS_ON]: u8(1),
    [VSFR.DS_UNITS]: u8(1),
    [VSFR.CR_UNITS]: u8(0),
    [VSFR.USE_nSv_h]: u8(0),
  };
  const requestedIds: number[] = [];

  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR)
      return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
    if (cmd === COMMAND.RD_VIRT_SFR) {
      const id = view.getUint32(8, true);
      requestedIds.push(id);
      const body = responses[id];
      if (!body) throw new Error(`Unexpected VSFR read: 0x${id.toString(16)}`);
      return buildResponseChunks(cmd, seq, body);
    }
    return null;
  });

  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  const settings = await client.readSettings();
  expect(settings).toEqual({
    doseRateAlarm1uRh: 100_000,
    doseRateAlarm2uRh: 200_000,
    doseAlarm1uR: 10_000_000,
    doseAlarm2uR: 20_000_000,
    soundOn: true,
    soundVolume: 5,
    vibroOn: false,
    ledsOn: true,
    doseUnitsSv: true,
    countRateCpm: false,
    doseRateNSvh: false,
  });
  // All 11 VSFRs were read
  expect(requestedIds).toHaveLength(11);
  await client.disconnect();
});
```

Import ergänzen (oben in `client.test.ts`): `VSFR` (ist bereits da, check), `RadiacodeSettings` aus `./types` (nur falls im Assertion-Helper nötig; mit `toEqual` gegen Object-Literal nicht zwingend).

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts -t readSettings`
Expected: FAIL (`readSettings is not a function`).

**Step 3: Implementierung in `client.ts`**

Import ergänzen: `import { RadiacodeDeviceInfo, RadiacodeMeasurement, RadiacodeSettings } from './types';`

Neue Methode:

```ts
async readSettings(): Promise<RadiacodeSettings> {
  return {
    doseRateAlarm1uRh: await this.readSfrU32(VSFR.DR_LEV1_uR_h),
    doseRateAlarm2uRh: await this.readSfrU32(VSFR.DR_LEV2_uR_h),
    doseAlarm1uR: await this.readSfrU32(VSFR.DS_LEV1_uR),
    doseAlarm2uR: await this.readSfrU32(VSFR.DS_LEV2_uR),
    soundOn: await this.readSfrBool(VSFR.SOUND_ON),
    soundVolume: await this.readSfrU8(VSFR.SOUND_VOL),
    vibroOn: await this.readSfrBool(VSFR.VIBRO_ON),
    ledsOn: await this.readSfrBool(VSFR.LEDS_ON),
    doseUnitsSv: await this.readSfrBool(VSFR.DS_UNITS),
    countRateCpm: await this.readSfrBool(VSFR.CR_UNITS),
    doseRateNSvh: await this.readSfrBool(VSFR.USE_nSv_h),
  };
}
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts -t readSettings`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): readSettings aggregiert 11 VSFRs"
```

---

## Task 6: `writeSettings` + `playSignal` + `doseReset` (test-first)

**Files:**
- Modify: `src/hooks/radiacode/client.test.ts`
- Modify: `src/hooks/radiacode/client.ts`

**Step 1: Failing-Tests hinzufügen**

```ts
it('writeSettings writes only the VSFRs present in the patch', async () => {
  vi.useRealTimers();
  const adapter = makeAdapter();
  let seqCounter = 0;
  const wrArgs: Array<{ id: number; bytes: Uint8Array }> = [];
  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR) {
      const id = view.getUint32(8, true);
      const argsAfterId = frame.slice(12);
      wrArgs.push({ id, bytes: new Uint8Array(argsAfterId) });
      return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
    }
    return null;
  });
  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  // connect() already issued WR_VIRT_SFR for DEVICE_TIME=0 — reset our log.
  wrArgs.length = 0;

  await client.writeSettings({
    doseRateAlarm1uRh: 500,
    soundOn: false,
    soundVolume: 3,
  });

  expect(wrArgs).toHaveLength(3);
  const byId = Object.fromEntries(wrArgs.map((w) => [w.id, w.bytes]));
  expect(byId[VSFR.DR_LEV1_uR_h]).toEqual(new Uint8Array([0xf4, 0x01, 0, 0]));
  expect(byId[VSFR.SOUND_ON]).toEqual(new Uint8Array([0x00]));
  expect(byId[VSFR.SOUND_VOL]).toEqual(new Uint8Array([0x03]));
  await client.disconnect();
});

it('playSignal writes PLAY_SIGNAL=1, doseReset writes DOSE_RESET=1', async () => {
  vi.useRealTimers();
  const adapter = makeAdapter();
  let seqCounter = 0;
  const wrLog: Array<{ id: number; v: number }> = [];
  adapter.setResponder((frame) => {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = view.getUint16(4, true);
    const seq = seqCounter++;
    if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    if (cmd === COMMAND.WR_VIRT_SFR) {
      const id = view.getUint32(8, true);
      wrLog.push({ id, v: frame[12] });
      return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
    }
    return null;
  });
  const client = new RadiacodeClient(adapter, 'dev');
  await client.connect();
  wrLog.length = 0;

  await client.playSignal();
  await client.doseReset();

  expect(wrLog).toEqual([
    { id: VSFR.PLAY_SIGNAL, v: 1 },
    { id: VSFR.DOSE_RESET, v: 1 },
  ]);
  await client.disconnect();
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts -t "writeSettings|playSignal"`
Expected: FAIL.

**Step 3: Implementierung in `client.ts`**

```ts
async writeSettings(patch: Partial<RadiacodeSettings>): Promise<void> {
  if (patch.doseRateAlarm1uRh !== undefined)
    await this.writeSfrU32(VSFR.DR_LEV1_uR_h, patch.doseRateAlarm1uRh);
  if (patch.doseRateAlarm2uRh !== undefined)
    await this.writeSfrU32(VSFR.DR_LEV2_uR_h, patch.doseRateAlarm2uRh);
  if (patch.doseAlarm1uR !== undefined)
    await this.writeSfrU32(VSFR.DS_LEV1_uR, patch.doseAlarm1uR);
  if (patch.doseAlarm2uR !== undefined)
    await this.writeSfrU32(VSFR.DS_LEV2_uR, patch.doseAlarm2uR);
  if (patch.soundOn !== undefined)
    await this.writeSfrBool(VSFR.SOUND_ON, patch.soundOn);
  if (patch.soundVolume !== undefined)
    await this.writeSfrU8(VSFR.SOUND_VOL, patch.soundVolume);
  if (patch.vibroOn !== undefined)
    await this.writeSfrBool(VSFR.VIBRO_ON, patch.vibroOn);
  if (patch.ledsOn !== undefined)
    await this.writeSfrBool(VSFR.LEDS_ON, patch.ledsOn);
  if (patch.doseUnitsSv !== undefined)
    await this.writeSfrBool(VSFR.DS_UNITS, patch.doseUnitsSv);
  if (patch.countRateCpm !== undefined)
    await this.writeSfrBool(VSFR.CR_UNITS, patch.countRateCpm);
  if (patch.doseRateNSvh !== undefined)
    await this.writeSfrBool(VSFR.USE_nSv_h, patch.doseRateNSvh);
}

async playSignal(): Promise<void> {
  await this.writeSfrU8(VSFR.PLAY_SIGNAL, 1);
}

async doseReset(): Promise<void> {
  await this.writeSfrBool(VSFR.DOSE_RESET, true);
}
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: PASS (alle Tests).

**Step 5: Commit**

```bash
git add src/hooks/radiacode/client.ts src/hooks/radiacode/client.test.ts
git commit -m "feat(radiacode): writeSettings, playSignal und doseReset"
```

---

## Task 7: Context-Wert um die neuen Methoden erweitern

**Files:**
- Modify: `src/components/providers/RadiacodeProvider.tsx`
- Modify: `src/components/providers/RadiacodeProvider.test.tsx` (falls Context-Shape getestet)
- Modify: `src/components/pages/Dosimetrie.test.tsx` (Fixture um neue Keys erweitern)

**Step 1: `RadiacodeContextValue` erweitern**

```ts
export interface RadiacodeContextValue {
  // ... bestehend ...
  readSettings: () => Promise<RadiacodeSettings>;
  writeSettings: (patch: Partial<RadiacodeSettings>) => Promise<void>;
  playSignal: () => Promise<void>;
  doseReset: () => Promise<void>;
}
```

Import ergänzen: `RadiacodeSettings` aus `../../hooks/radiacode/types`.

**Step 2: Implementierungen als `useCallback` hinzufügen**

Nach `cancelSpectrumRecording`:

```ts
const readSettings = useCallback(async () => {
  const client = clientRef.current;
  if (!client) throw new Error('Kein Radiacode verbunden');
  return client.readSettings();
}, [clientRef]);

const writeSettings = useCallback(
  async (patch: Partial<RadiacodeSettings>) => {
    const client = clientRef.current;
    if (!client) throw new Error('Kein Radiacode verbunden');
    await client.writeSettings(patch);
  },
  [clientRef],
);

const playSignal = useCallback(async () => {
  const client = clientRef.current;
  if (!client) throw new Error('Kein Radiacode verbunden');
  await client.playSignal();
}, [clientRef]);

const doseReset = useCallback(async () => {
  const client = clientRef.current;
  if (!client) throw new Error('Kein Radiacode verbunden');
  await client.doseReset();
}, [clientRef]);
```

**Step 3: Im `useMemo<RadiacodeContextValue>` die neuen Felder ergänzen** (Value + Deps-Array).

**Step 4: Fixture in `Dosimetrie.test.tsx` erweitern**

```ts
readSettings: vi.fn(async () => ({
  doseRateAlarm1uRh: 0, doseRateAlarm2uRh: 0,
  doseAlarm1uR: 0, doseAlarm2uR: 0,
  soundOn: true, soundVolume: 5,
  vibroOn: true, ledsOn: true,
  doseUnitsSv: true, countRateCpm: false, doseRateNSvh: false,
})),
writeSettings: vi.fn(async () => {}),
playSignal: vi.fn(async () => {}),
doseReset: vi.fn(async () => {}),
```

**Step 5: Tests laufen lassen**

Run: `NO_COLOR=1 npm run test`
Expected: PASS (gleicher Umfang wie vor Task 7 + 2 neue im Client).

Wenn `RadiacodeProvider.test.tsx` oder andere Tests einen eigenen Fixture-Helper haben, den ebenfalls erweitern.

**Step 6: Commit**

```bash
git add src/components/providers/RadiacodeProvider.tsx \
        src/components/pages/Dosimetrie.test.tsx \
        src/components/providers/RadiacodeProvider.test.tsx
git commit -m "feat(radiacode): Settings-Methoden im Context durchreichen"
```

---

## Task 8: Settings-Dialog — Grundgerüst & Read-on-Open (test-first)

**Files:**
- Create: `src/components/pages/RadiacodeSettingsDialog.tsx`
- Create: `src/components/pages/RadiacodeSettingsDialog.test.tsx`

**Step 1: Failing-Test schreiben (`RadiacodeSettingsDialog.test.tsx`)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RadiacodeSettings } from '../../hooks/radiacode/types';
import RadiacodeSettingsDialog from './RadiacodeSettingsDialog';

function makeSettings(partial: Partial<RadiacodeSettings> = {}): RadiacodeSettings {
  return {
    doseRateAlarm1uRh: 100_000,   // 1000 µSv/h
    doseRateAlarm2uRh: 500_000,   // 5000 µSv/h
    doseAlarm1uR: 100_000_000,     // 1000 µSv
    doseAlarm2uR: 500_000_000,     // 5000 µSv
    soundOn: true,
    soundVolume: 5,
    vibroOn: true,
    ledsOn: false,
    doseUnitsSv: true,
    countRateCpm: false,
    doseRateNSvh: false,
    ...partial,
  };
}

describe('RadiacodeSettingsDialog', () => {
  it('loads settings from the device when opened', async () => {
    const readSettings = vi.fn(async () => makeSettings());
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={readSettings}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => expect(readSettings).toHaveBeenCalledTimes(1));
    // Dose rate alarm 1: 100_000 µR/h = 1000 µSv/h
    expect(await screen.findByDisplayValue('1000')).toBeInTheDocument();
    // Dose rate alarm 2: 500_000 µR/h = 5000 µSv/h
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
  });

  it('shows an error alert when readSettings fails, action buttons remain enabled', async () => {
    const readSettings = vi.fn(async () => {
      throw new Error('BLE timeout');
    });
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={readSettings}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText(/BLE timeout/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signalton/i })).toBeEnabled();
  });
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/RadiacodeSettingsDialog.test.tsx`
Expected: FAIL (Modul existiert nicht).

**Step 3: `RadiacodeSettingsDialog.tsx` Grundgerüst implementieren**

```tsx
'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { RadiacodeSettings } from '../../hooks/radiacode/types';

export interface RadiacodeSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  readSettings: () => Promise<RadiacodeSettings>;
  writeSettings: (patch: Partial<RadiacodeSettings>) => Promise<void>;
  playSignal: () => Promise<void>;
  doseReset: () => Promise<void>;
}

function uRh_to_uSvh(uRh: number): number {
  return uRh / 100;
}
function uSvh_to_uRh(uSvh: number): number {
  return Math.max(0, Math.round(uSvh * 100));
}
function uR_to_uSv(uR: number): number {
  return uR / 100;
}
function uSv_to_uR(uSv: number): number {
  return Math.max(0, Math.round(uSv * 100));
}

function diff(
  initial: RadiacodeSettings,
  current: RadiacodeSettings,
): Partial<RadiacodeSettings> {
  const out: Partial<RadiacodeSettings> = {};
  for (const k of Object.keys(current) as (keyof RadiacodeSettings)[]) {
    if (initial[k] !== current[k]) {
      // @ts-expect-error — keyof narrows away the union at runtime
      out[k] = current[k];
    }
  }
  return out;
}

export default function RadiacodeSettingsDialog({
  open,
  onClose,
  readSettings,
  writeSettings,
  playSignal,
  doseReset,
}: RadiacodeSettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<RadiacodeSettings | null>(null);
  const [current, setCurrent] = useState<RadiacodeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    readSettings()
      .then((s) => {
        if (cancelled) return;
        setInitial(s);
        setCurrent(s);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, readSettings]);

  const hasChanges =
    initial !== null &&
    current !== null &&
    Object.keys(diff(initial, current)).length > 0;

  const handleSave = async () => {
    if (!initial || !current) return;
    setSaving(true);
    setSaveError(null);
    try {
      await writeSettings(diff(initial, current));
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const canEdit = !!current && !loading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Geräte-Einstellungen</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        )}
        {canEdit && current && (
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Section title="Alarm-Schwellen">
              <TextField
                label="Dosisleistung Stufe 1 (µSv/h)"
                type="number"
                value={uRh_to_uSvh(current.doseRateAlarm1uRh)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseRateAlarm1uRh: uSvh_to_uRh(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Dosisleistung Stufe 2 (µSv/h)"
                type="number"
                value={uRh_to_uSvh(current.doseRateAlarm2uRh)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseRateAlarm2uRh: uSvh_to_uRh(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Gesamtdosis Stufe 1 (µSv)"
                type="number"
                value={uR_to_uSv(current.doseAlarm1uR)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseAlarm1uR: uSv_to_uR(Number(e.target.value)),
                  })
                }
              />
              <TextField
                label="Gesamtdosis Stufe 2 (µSv)"
                type="number"
                value={uR_to_uSv(current.doseAlarm2uR)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    doseAlarm2uR: uSv_to_uR(Number(e.target.value)),
                  })
                }
              />
            </Section>
            <Section title="Signalisierung">
              <FormControlLabel
                control={
                  <Switch
                    checked={current.soundOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, soundOn: v })
                    }
                  />
                }
                label="Sound"
              />
              <Box sx={{ px: 2, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Lautstärke: {current.soundVolume}
                </Typography>
                <Slider
                  value={current.soundVolume}
                  min={0}
                  max={9}
                  step={1}
                  marks
                  disabled={!current.soundOn}
                  onChange={(_, v) =>
                    setCurrent({ ...current, soundVolume: v as number })
                  }
                />
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={current.vibroOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, vibroOn: v })
                    }
                  />
                }
                label="Vibration"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.ledsOn}
                    onChange={(_, v) =>
                      setCurrent({ ...current, ledsOn: v })
                    }
                  />
                }
                label="LEDs"
              />
            </Section>
            <Section title="Einheiten">
              <FormControlLabel
                control={
                  <Switch
                    checked={current.doseUnitsSv}
                    onChange={(_, v) =>
                      setCurrent({ ...current, doseUnitsSv: v })
                    }
                  />
                }
                label="Dosis in Sv (statt R)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.countRateCpm}
                    onChange={(_, v) =>
                      setCurrent({ ...current, countRateCpm: v })
                    }
                  />
                }
                label="Zählrate in cpm (statt cps)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={current.doseRateNSvh}
                    onChange={(_, v) =>
                      setCurrent({ ...current, doseRateNSvh: v })
                    }
                  />
                }
                label="Dosisleistung in nSv/h (statt µSv/h)"
              />
            </Section>
          </Stack>
        )}
        <Section title="Aktionen">
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button onClick={() => void playSignal()}>Signalton abspielen</Button>
            <ConfirmDoseResetButton doseReset={doseReset} />
          </Stack>
        </Section>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          disabled={!hasChanges || saving}
          onClick={handleSave}
        >
          Speichern
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

function ConfirmDoseResetButton({
  doseReset,
}: {
  doseReset: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button color="warning" onClick={() => setConfirming(true)}>
        Dosis zurücksetzen
      </Button>
    );
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2">Wirklich zurücksetzen?</Typography>
      <Button
        color="warning"
        variant="contained"
        onClick={async () => {
          await doseReset();
          setConfirming(false);
        }}
      >
        Ja
      </Button>
      <Button onClick={() => setConfirming(false)}>Nein</Button>
    </Stack>
  );
}
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/RadiacodeSettingsDialog.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pages/RadiacodeSettingsDialog.tsx \
        src/components/pages/RadiacodeSettingsDialog.test.tsx
git commit -m "feat(radiacode): Settings-Dialog Grundgeruest mit Read-on-Open"
```

---

## Task 9: Settings-Dialog — Speichern schreibt nur Diff (test-first)

**Files:**
- Modify: `src/components/pages/RadiacodeSettingsDialog.test.tsx`

**Step 1: Failing-Test ergänzen**

```tsx
it('Speichern writeSettings nur mit geänderten Feldern', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  const readSettings = vi.fn(async () => makeSettings());
  const writeSettings = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <RadiacodeSettingsDialog
      open
      onClose={onClose}
      readSettings={readSettings}
      writeSettings={writeSettings}
      playSignal={vi.fn(async () => {})}
      doseReset={vi.fn(async () => {})}
    />,
  );
  await waitFor(() => expect(readSettings).toHaveBeenCalled());
  // Vibration an → aus
  const vibroSwitch = screen.getByRole('checkbox', { name: /vibration/i });
  await user.click(vibroSwitch);
  // Speichern
  await user.click(screen.getByRole('button', { name: /speichern/i }));
  await waitFor(() => expect(writeSettings).toHaveBeenCalledTimes(1));
  expect(writeSettings).toHaveBeenCalledWith({ vibroOn: false });
  expect(onClose).toHaveBeenCalled();
});

it('Abbrechen ruft writeSettings nicht auf, onClose ja', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  const writeSettings = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <RadiacodeSettingsDialog
      open
      onClose={onClose}
      readSettings={vi.fn(async () => makeSettings())}
      writeSettings={writeSettings}
      playSignal={vi.fn(async () => {})}
      doseReset={vi.fn(async () => {})}
    />,
  );
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: /vibration/i })).toBeInTheDocument();
  });
  await user.click(screen.getByRole('button', { name: /abbrechen/i }));
  expect(onClose).toHaveBeenCalled();
  expect(writeSettings).not.toHaveBeenCalled();
});

it('Speichern ist disabled wenn nichts geändert wurde', async () => {
  render(
    <RadiacodeSettingsDialog
      open
      onClose={vi.fn()}
      readSettings={vi.fn(async () => makeSettings())}
      writeSettings={vi.fn(async () => {})}
      playSignal={vi.fn(async () => {})}
      doseReset={vi.fn(async () => {})}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: /vibration/i })).toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/RadiacodeSettingsDialog.test.tsx`
Expected: PASS (Task 8 Implementierung deckt diesen Flow schon ab — Regression-Sicherung).

Sollten Tests fehlschlagen, `handleSave` / Save-Disabled-Logik anpassen.

**Step 3: Commit**

```bash
git add src/components/pages/RadiacodeSettingsDialog.test.tsx
git commit -m "test(radiacode): Speichern-Flow schreibt nur Diff"
```

---

## Task 10: Settings-Dialog — Action-Buttons (Signalton + Dosis-Reset mit Confirm)

**Files:**
- Modify: `src/components/pages/RadiacodeSettingsDialog.test.tsx`

**Step 1: Failing-Tests hinzufügen**

```tsx
it('Signalton-Button ruft playSignal sofort', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  const playSignal = vi.fn(async () => {});
  render(
    <RadiacodeSettingsDialog
      open
      onClose={vi.fn()}
      readSettings={vi.fn(async () => makeSettings())}
      writeSettings={vi.fn(async () => {})}
      playSignal={playSignal}
      doseReset={vi.fn(async () => {})}
    />,
  );
  await user.click(screen.getByRole('button', { name: /signalton/i }));
  expect(playSignal).toHaveBeenCalledTimes(1);
});

it('Dosis-Reset verlangt Bestätigung bevor doseReset aufgerufen wird', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  const doseReset = vi.fn(async () => {});
  render(
    <RadiacodeSettingsDialog
      open
      onClose={vi.fn()}
      readSettings={vi.fn(async () => makeSettings())}
      writeSettings={vi.fn(async () => {})}
      playSignal={vi.fn(async () => {})}
      doseReset={doseReset}
    />,
  );
  const resetBtn = screen.getByRole('button', { name: /dosis zurücksetzen/i });
  await user.click(resetBtn);
  // doseReset noch nicht aufgerufen — Bestätigung erwartet
  expect(doseReset).not.toHaveBeenCalled();
  // Bestätigungs-Button „Ja"
  await user.click(screen.getByRole('button', { name: /^ja$/i }));
  await waitFor(() => expect(doseReset).toHaveBeenCalledTimes(1));
});

it('Dosis-Reset „Nein" bricht ohne doseReset-Aufruf ab', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  const doseReset = vi.fn(async () => {});
  render(
    <RadiacodeSettingsDialog
      open
      onClose={vi.fn()}
      readSettings={vi.fn(async () => makeSettings())}
      writeSettings={vi.fn(async () => {})}
      playSignal={vi.fn(async () => {})}
      doseReset={doseReset}
    />,
  );
  await user.click(screen.getByRole('button', { name: /dosis zurücksetzen/i }));
  await user.click(screen.getByRole('button', { name: /nein/i }));
  expect(doseReset).not.toHaveBeenCalled();
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/RadiacodeSettingsDialog.test.tsx`
Expected: PASS.

Falls noch nicht: Komponente/Confirm-Logik aus Task 8 verifizieren bzw. anpassen.

**Step 3: Commit**

```bash
git add src/components/pages/RadiacodeSettingsDialog.test.tsx
git commit -m "test(radiacode): Signalton und Dosis-Reset mit Confirm"
```

---

## Task 11: Dosimetrie-Seite integriert den Settings-Button (test-first)

**Files:**
- Modify: `src/components/pages/Dosimetrie.test.tsx`
- Modify: `src/components/pages/Dosimetrie.tsx`

**Step 1: Failing-Test hinzufügen**

In `Dosimetrie.test.tsx`:

```tsx
it('Settings-Button ist disabled wenn nicht verbunden', () => {
  mockedUseRadiacode.mockReturnValue(fixture());
  render(<Dosimetrie />);
  expect(
    screen.getByRole('button', { name: /einstellungen/i }),
  ).toBeDisabled();
});

it('Settings-Button ist enabled wenn verbunden und öffnet Dialog', async () => {
  const user = (await import('@testing-library/user-event')).default.setup();
  mockedUseRadiacode.mockReturnValue(
    fixture({
      status: 'connected',
      device: { id: 'id', name: 'RC-103', serial: 'SN' },
    }),
  );
  render(<Dosimetrie />);
  const btn = screen.getByRole('button', { name: /einstellungen/i });
  expect(btn).toBeEnabled();
  await user.click(btn);
  expect(await screen.findByText(/geräte-einstellungen/i)).toBeInTheDocument();
});
```

**Step 2: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/Dosimetrie.test.tsx`
Expected: FAIL (Button existiert noch nicht).

**Step 3: Integration in `Dosimetrie.tsx`**

Imports ergänzen:

```ts
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import SettingsIcon from '@mui/icons-material/Settings';
import RadiacodeSettingsDialog from './RadiacodeSettingsDialog';
```

Destructure-Zeile oben in `Dosimetrie()` erweitern:

```ts
const {
  status,
  device,
  deviceInfo,
  measurement,
  history,
  error,
  connect,
  disconnect,
  readSettings,
  writeSettings,
  playSignal,
  doseReset,
} = useRadiacode();
const [settingsOpen, setSettingsOpen] = useState(false);
```

Im Button-Stack neben „Trennen":

```tsx
<Tooltip title="Einstellungen">
  <span>
    <IconButton
      aria-label="Einstellungen"
      onClick={() => setSettingsOpen(true)}
      disabled={status !== 'connected'}
    >
      <SettingsIcon />
    </IconButton>
  </span>
</Tooltip>
```

Am Ende des JSX vor `</Stack>`:

```tsx
<RadiacodeSettingsDialog
  open={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  readSettings={readSettings}
  writeSettings={writeSettings}
  playSignal={playSignal}
  doseReset={doseReset}
/>
```

**Step 4: Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/Dosimetrie.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pages/Dosimetrie.tsx src/components/pages/Dosimetrie.test.tsx
git commit -m "feat(radiacode): Settings-Button auf Dosimetrie-Seite"
```

---

## Task 12: Vollständiger Check und finaler Commit

**Step 1: `next-env.d.ts` zurücksetzen**

```bash
git checkout -- next-env.d.ts
```

**Step 2: `npm run check` ausführen**

Run: `NO_COLOR=1 npm run check`
Expected: tsc, lint, tests, build — alle grün, keine Warnings.

Falls Lint-Warnings: beheben (meist ungenutzte Imports, TS-Typen).
Falls TSC-Fehler: **niemals ignorieren**, immer beheben (siehe MEMORY.md).

**Step 3: Test-Zusammenfassung dokumentieren**

Abschnitt „## Zusammenfassung" im Design-Doc (`2026-04-21-radiacode-settings-dialog-design.md`) ergänzen mit:

- Anzahl der neuen Tests (Client: 3, Dialog: ~7, Dosimetrie: 2, Protocol: ~8 — anpassen nach echtem Stand).
- Etwaige Abweichungen vom ursprünglichen Design (falls während Implementierung nötig).

**Step 4: Falls Doku geändert, committen**

```bash
git add docs/plans/2026-04-21-radiacode-settings-dialog-design.md
git commit -m "docs(radiacode): Settings-Dialog Design-Doc nach Implementierung aktualisiert"
```

---

## YAGNI-Check

- Keine Batch-Reads.
- Keine Display/Sprache/LED-Einzelhelligkeit/Sound-Trigger-Flags.
- Kein Live-Werte-Panel im Dialog (steht bereits auf der Seite).
- Kein Auto-Apply — lokale Änderungen + Save.
- Kein Cross-Validation-Blocker für Stufe 1 > Stufe 2 (nur Warn-Text kann bei Bedarf nachgezogen werden, nicht Teil dieses Plans).
