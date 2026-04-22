import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeClient } from './client';
import { COMMAND, SpectrumSnapshot, VS, VSFR } from './protocol';
import { RadiacodeMeasurement } from './types';

// `./nativeBridge` wird überall im Testfile als inaktiv gemockt —
// Capacitor `isNativePlatform()` liefert in jsdom ohnehin false, aber der
// Import zieht `@capacitor/core` rein und wir wollen in Tests keine echte
// Plugin-Registrierung. Einzelne Tests überschreiben das Mock dynamisch.
vi.mock('./nativeBridge', () => ({
  isNativeAvailable: vi.fn(() => false),
  onNativeMeasurement: vi.fn(() => () => {}),
  onNativeNotification: vi.fn(() => () => {}),
  onNativeConnectionState: vi.fn(() => () => {}),
  nativeConnect: vi.fn(async () => {}),
  nativeDisconnect: vi.fn(async () => {}),
  nativeWrite: vi.fn(async () => {}),
}));

function fromHex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function loadFixtureChunks(name: string): Uint8Array[] {
  const raw = readFileSync(
    join(__dirname, '__fixtures__', `${name}.hex`),
    'utf8',
  );
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('##'));
  // All lines except the last (which is the reassembled reference).
  return lines.slice(0, -1).map(fromHex);
}

interface MockAdapter extends BleAdapter {
  writes: Uint8Array[];
  emit: (chunk: Uint8Array) => void;
  setResponder: (fn: (frame: Uint8Array) => Uint8Array[] | null) => void;
  simulateDisconnect: () => void;
  disconnectHandlers: Array<() => void>;
}

function makeAdapter(): MockAdapter {
  let notifyHandler: ((bytes: Uint8Array) => void) | null = null;
  const writes: Uint8Array[] = [];
  let buffered = new Uint8Array(0);
  let responder: ((frame: Uint8Array) => Uint8Array[] | null) | null = null;
  const disconnectHandlers: Array<() => void> = [];

  const adapter: MockAdapter = {
    isSupported: () => true,
    requestDevice: vi.fn(async () => ({
      id: 'dev',
      name: 'RC-103',
      serial: 'TEST',
    })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    onNotification: vi.fn(async (_id, h) => {
      notifyHandler = h;
      const unsub: Unsubscribe = () => {
        notifyHandler = null;
      };
      return unsub;
    }),
    onDisconnect: vi.fn((_id, handler) => {
      disconnectHandlers.push(handler);
      return () => {
        const idx = disconnectHandlers.indexOf(handler);
        if (idx >= 0) disconnectHandlers.splice(idx, 1);
      };
    }),
    write: vi.fn(async (_id, data) => {
      writes.push(data);
      // Reassemble the full request frame (first chunk has 4-byte length prefix).
      const combined = new Uint8Array(buffered.length + data.length);
      combined.set(buffered, 0);
      combined.set(data, buffered.length);
      buffered = combined;
      if (buffered.length >= 4) {
        const view = new DataView(
          buffered.buffer,
          buffered.byteOffset,
          buffered.byteLength,
        );
        const declared = view.getUint32(0, true);
        if (buffered.length >= 4 + declared) {
          const frame = buffered.slice(0, 4 + declared);
          buffered = buffered.slice(4 + declared);
          if (responder) {
            const chunks = responder(frame);
            if (chunks) {
              for (const c of chunks) notifyHandler?.(c);
            }
          }
        }
      }
    }),
    writes,
    emit: (chunk) => notifyHandler?.(chunk),
    setResponder: (fn) => {
      responder = fn;
    },
    simulateDisconnect: () => {
      for (const h of [...disconnectHandlers]) h();
    },
    disconnectHandlers,
  };
  return adapter;
}

function buildResponseChunks(
  cmd: number,
  seq: number,
  data: Uint8Array,
): Uint8Array[] {
  const payloadLen = 4 + data.length;
  const full = new Uint8Array(4 + payloadLen);
  const view = new DataView(full.buffer);
  view.setUint32(0, payloadLen, true);
  view.setUint16(4, cmd, true);
  full[6] = 0;
  full[7] = 0x80 + (seq % 32);
  full.set(data, 8);
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < full.length; off += 20) {
    chunks.push(full.slice(off, Math.min(off + 20, full.length)));
  }
  return chunks;
}

function buildRareRecordBody(
  realtime: {
    cps: number;
    doseRateSv: number;
    cpsErrPct?: number;
    doseRateErrPct?: number;
  },
  rare: {
    doseRaw: number;
    temperatureC: number;
    chargePct: number;
    durationSec?: number;
  },
): Uint8Array {
  // retcode(4) + flen(4) + records
  const records: number[] = [];
  // Realtime record: seq(1)=0, eid(1)=0, gid(1)=0, tsOffset(4)=0, then 15B payload
  // countRate f32, doseRate f32, countRateErrPct u16, doseRateErrPct u16, flags u16, realTimeFlags u8
  const realtimeBuf = new ArrayBuffer(7 + 15);
  const rv = new DataView(realtimeBuf);
  rv.setUint8(0, 0); // seq
  rv.setUint8(1, 0); // eid
  rv.setUint8(2, 0); // gid
  rv.setInt32(3, 0, true); // tsOffset
  rv.setFloat32(7, realtime.cps, true);
  rv.setFloat32(11, realtime.doseRateSv, true);
  rv.setUint16(15, Math.round((realtime.cpsErrPct ?? 0) * 10), true);
  rv.setUint16(17, Math.round((realtime.doseRateErrPct ?? 0) * 10), true);
  rv.setUint16(19, 0, true);
  rv.setUint8(21, 0);
  records.push(...new Uint8Array(realtimeBuf));

  // Rare record: seq=1, eid=0, gid=3, tsOffset=0, then 14B payload
  // duration u32, dose f32 (mSv), temperature u16 ((t*100)+2000), charge u16 (pct*100), flags u16
  const rareBuf = new ArrayBuffer(7 + 14);
  const rr = new DataView(rareBuf);
  rr.setUint8(0, 1); // seq
  rr.setUint8(1, 0); // eid
  rr.setUint8(2, 3); // gid
  rr.setInt32(3, 0, true);
  rr.setUint32(7, rare.durationSec ?? 100, true); // duration
  rr.setFloat32(11, rare.doseRaw, true);
  rr.setUint16(15, Math.round(rare.temperatureC * 100) + 2000, true);
  rr.setUint16(17, Math.round(rare.chargePct * 100), true);
  rr.setUint16(19, 0, true);
  records.push(...new Uint8Array(rareBuf));

  const bodyLen = 8 + records.length;
  const body = new Uint8Array(bodyLen);
  const bv = new DataView(body.buffer);
  bv.setUint32(0, 0, true); // retcode = 0
  bv.setUint32(4, records.length, true);
  body.set(records, 8);
  return body;
}

describe('RadiacodeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('init: sends SET_EXCHANGE, SET_TIME, DEVICE_TIME and consumes responses', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE) {
        return buildResponseChunks(cmd, seq, new Uint8Array(4));
      }
      if (cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0x00, 0x00, 0x00]),
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    // Inspect the commands that were actually written.
    const sentCmds: number[] = [];
    let acc = new Uint8Array(0);
    for (const w of adapter.writes) {
      const next = new Uint8Array(acc.length + w.length);
      next.set(acc, 0);
      next.set(w, acc.length);
      acc = next;
      while (acc.length >= 4) {
        const view = new DataView(acc.buffer, acc.byteOffset, acc.byteLength);
        const declared = view.getUint32(0, true);
        if (acc.length < 4 + declared) break;
        const cmd = view.getUint16(4, true);
        sentCmds.push(cmd);
        acc = acc.slice(4 + declared);
      }
    }
    expect(sentCmds).toEqual([
      COMMAND.SET_EXCHANGE,
      COMMAND.SET_TIME,
      COMMAND.WR_VIRT_SFR,
    ]);
  });

  it('polls DATA_BUF and emits a measurement from realtime records', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    // Reassembled DATA_BUF response from fixture (small) = 49B = 4-byte header + 45B body.
    // Body = retcode (4) + flen (4) + 37B record payload.
    // We reuse the fixture's chunks but strip the first 4 length bytes: we rebuild the
    // response via buildResponseChunks with raw data = body-without-header.
    const rspChunks = loadFixtureChunks('databuf_rsp_small');
    // Glue chunks back, then strip the 4-byte length prefix and 4-byte header.
    const glued = rspChunks.reduce((acc, c) => {
      const n = new Uint8Array(acc.length + c.length);
      n.set(acc, 0);
      n.set(c, acc.length);
      return n;
    }, new Uint8Array(0));
    // glued = <4 length><2 cmd><1 0><1 seq><body...>
    const body = glued.slice(8);

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0x00, 0x00, 0x00]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(COMMAND.RD_VIRT_STRING, seq, body);
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const onMeasurement = vi.fn();
    client.startPolling(onMeasurement, 500);

    // Advance the poll timer and let any pending tasks resolve.
    await vi.advanceTimersByTimeAsync(600);

    expect(onMeasurement).toHaveBeenCalledTimes(1);
    const m = onMeasurement.mock.calls[0][0];
    // Small fixture realtime record: countRate ≈ 5.931, doseRate ≈ 8.05e-6 (Sv/h).
    // dosisleistung (μSv/h) = doseRate * 10000 (cdump reference convention).
    expect(m.cps).toBeCloseTo(5.931, 2);
    expect(m.dosisleistung).toBeCloseTo(8.05e-6 * 10000, 3);
    expect(typeof m.timestamp).toBe('number');

    await client.disconnect();
  });

  it('emits dose, temperature and charge when rare record is present', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const body = buildRareRecordBody(
      { cps: 3.5, doseRateSv: 2e-7, cpsErrPct: 12.5, doseRateErrPct: 38.2 },
      {
        doseRaw: 0.05, // mSv (Rohwert aus RareData)
        temperatureC: 23.5,
        chargePct: 87.3,
        durationSec: 540,
      },
    );

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
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
    expect(m.dosisleistung).toBeCloseTo(2e-7 * 10000, 5); // 0.002 µSv/h
    expect(m.dose).toBeCloseTo(0.05 * 1e3, 3); // 50 µSv (Rohwert 0.05 mSv × 1e3)
    expect(m.temperatureC).toBeCloseTo(23.5, 1);
    expect(m.chargePct).toBeCloseTo(87.3, 1);
    expect(m.cpsErrPct).toBeCloseTo(12.5, 1);
    expect(m.dosisleistungErrPct).toBeCloseTo(38.2, 1);
    expect(m.durationSec).toBe(540);

    await client.disconnect();
  });

  it('getDeviceInfo: queries GET_VERSION, GET_SERIAL, FW_SIGNATURE and returns metadata', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;

    // Build response payloads matching the decoder expectations.
    const versionPayload = (() => {
      const bootDate = 'Jan 10 2024';
      const targetDate = 'Apr 1 2025';
      const buf = new Uint8Array(4 + 4 + bootDate.length + 4 + 4 + targetDate.length);
      const v = new DataView(buf.buffer);
      v.setUint16(0, 1, true);
      v.setUint16(2, 4, true);
      v.setUint32(4, bootDate.length, true);
      for (let i = 0; i < bootDate.length; i++) buf[8 + i] = bootDate.charCodeAt(i);
      const targetOffset = 8 + bootDate.length;
      v.setUint16(targetOffset, 14, true);
      v.setUint16(targetOffset + 2, 4, true);
      v.setUint32(targetOffset + 4, targetDate.length, true);
      for (let i = 0; i < targetDate.length; i++) {
        buf[targetOffset + 8 + i] = targetDate.charCodeAt(i);
      }
      return buf;
    })();

    const serialPayload = (() => {
      const buf = new Uint8Array(4 + 8);
      const v = new DataView(buf.buffer);
      v.setUint32(0, 8, true);
      v.setUint32(4, 0x12345678, true);
      v.setUint32(8, 0x9abcdef0, true);
      return buf;
    })();

    const fwSignaturePayload = (() => {
      const fileName = 'rc-103.bin';
      const idString = 'RadiaCode RC-103';
      const buf = new Uint8Array(4 + 4 + fileName.length + 4 + idString.length);
      const v = new DataView(buf.buffer);
      v.setUint32(0, 0xdeadbeef, true);
      v.setUint32(4, fileName.length, true);
      for (let i = 0; i < fileName.length; i++) buf[8 + i] = fileName.charCodeAt(i);
      const idOffset = 8 + fileName.length;
      v.setUint32(idOffset, idString.length, true);
      for (let i = 0; i < idString.length; i++) {
        buf[idOffset + 4 + i] = idString.charCodeAt(i);
      }
      return buf;
    })();

    adapter.setResponder((frame) => {
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      if (cmd === COMMAND.WR_VIRT_SFR)
        return buildResponseChunks(cmd, seq, new Uint8Array([0x01, 0, 0, 0]));
      if (cmd === COMMAND.GET_VERSION)
        return buildResponseChunks(cmd, seq, versionPayload);
      if (cmd === COMMAND.GET_SERIAL)
        return buildResponseChunks(cmd, seq, serialPayload);
      if (cmd === COMMAND.FW_SIGNATURE)
        return buildResponseChunks(cmd, seq, fwSignaturePayload);
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const info = await client.getDeviceInfo();
    expect(info.firmwareVersion).toBe('4.14');
    expect(info.bootVersion).toBe('4.1');
    expect(info.firmwareDate).toBe('Apr 1 2025');
    expect(info.hardwareSerial).toBe('12345678-9ABCDEF0');
    expect(info.model).toBe('RadiaCode RC-103');

    await client.disconnect();
  });

  it('getDeviceInfo: tolerates missing FW_SIGNATURE', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;

    const versionPayload = (() => {
      const bootDate = '';
      const targetDate = '';
      const buf = new Uint8Array(4 + 4 + bootDate.length + 4 + 4 + targetDate.length);
      const v = new DataView(buf.buffer);
      v.setUint16(0, 0, true);
      v.setUint16(2, 4, true);
      v.setUint32(4, 0, true);
      v.setUint16(8, 8, true);
      v.setUint16(10, 4, true);
      v.setUint32(12, 0, true);
      return buf;
    })();

    const serialPayload = (() => {
      const buf = new Uint8Array(4 + 4);
      const v = new DataView(buf.buffer);
      v.setUint32(0, 4, true);
      v.setUint32(4, 0xabcdef01, true);
      return buf;
    })();

    adapter.setResponder((frame) => {
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      if (cmd === COMMAND.WR_VIRT_SFR)
        return buildResponseChunks(cmd, seq, new Uint8Array([0x01, 0, 0, 0]));
      if (cmd === COMMAND.GET_VERSION)
        return buildResponseChunks(cmd, seq, versionPayload);
      if (cmd === COMMAND.GET_SERIAL)
        return buildResponseChunks(cmd, seq, serialPayload);
      // FW_SIGNATURE: echo back a short payload that triggers a decoder throw.
      if (cmd === COMMAND.FW_SIGNATURE)
        return buildResponseChunks(cmd, seq, new Uint8Array(2));
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const info = await client.getDeviceInfo();
    expect(info.firmwareVersion).toBe('4.8');
    expect(info.hardwareSerial).toBe('ABCDEF01');
    expect(info.model).toBeUndefined();
    await client.disconnect();
  });

  it('serializes concurrent executes via FIFO queue', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    const seenCmds: number[] = [];
    const deferredResponses: Array<() => void> = [];
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.GET_STATUS) {
        seenCmds.push(seq);
        // Queue the response so the test can control when the device replies.
        const chunks = buildResponseChunks(cmd, seq, new Uint8Array([seq]));
        deferredResponses.push(() => {
          for (const c of chunks) adapter.emit(c);
        });
        return null;
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const runCmd = (client as unknown as {
      execute: (cmd: number, args: Uint8Array) => Promise<{ data: Uint8Array }>;
    }).execute.bind(client);

    const p1 = runCmd(COMMAND.GET_STATUS, new Uint8Array(0));
    const p2 = runCmd(COMMAND.GET_STATUS, new Uint8Array(0));

    // Let the queue pump: first write happens, second must wait in queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(seenCmds.length).toBe(1); // only first request has been written

    // Release the first response → queue pumps second write.
    deferredResponses[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(seenCmds.length).toBe(2);

    // Release second response.
    deferredResponses[1]();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.data[0]).toBe(seenCmds[0]);
    expect(r2.data[0]).toBe(seenCmds[1]);
    expect(seenCmds[0]).toBeLessThan(seenCmds[1]);

    await client.disconnect();
  });

  it('disconnect rejects queued waiters', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    let deferredResponse: (() => void) | null = null;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.GET_STATUS) {
        // Defer the first GET_STATUS response so the second stays queued.
        if (!deferredResponse) {
          const chunks = buildResponseChunks(cmd, seq, new Uint8Array(0));
          deferredResponse = () => {
            for (const c of chunks) adapter.emit(c);
          };
          return null;
        }
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const runCmd = (client as unknown as {
      execute: (cmd: number, args: Uint8Array) => Promise<{ data: Uint8Array }>;
    }).execute.bind(client);

    const p1 = runCmd(COMMAND.GET_STATUS, new Uint8Array(0));
    const p2 = runCmd(COMMAND.GET_STATUS, new Uint8Array(0));

    // Attach catch handlers early to avoid unhandled rejections.
    const p1Settled = p1.catch((e: Error) => e);
    const p2Settled = p2.catch((e: Error) => e);

    await client.disconnect();

    const r1 = await p1Settled;
    const r2 = await p2Settled;
    expect(r1).toBeInstanceOf(Error);
    expect(r2).toBeInstanceOf(Error);
    expect((r1 as Error).message).toMatch(/disconnect/i);
    expect((r2 as Error).message).toMatch(/disconnect/i);
  });

  it('specReset sends WR_VIRT_SFR(SPEC_RESET, 0)', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    const wrVirtSfrFrames: Uint8Array[] = [];
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        wrVirtSfrFrames.push(frame);
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    // After connect, one WR_VIRT_SFR frame (DEVICE_TIME) was already sent.
    const framesBefore = wrVirtSfrFrames.length;

    await client.specReset();

    expect(wrVirtSfrFrames.length).toBe(framesBefore + 1);
    const frame = wrVirtSfrFrames[wrVirtSfrFrames.length - 1];
    const fv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const cmd = fv.getUint16(4, true);
    expect(cmd).toBe(COMMAND.WR_VIRT_SFR);
    // args start at offset 8 (after 4-byte length + 4-byte header)
    const arg0 = fv.getUint32(8, true);
    const arg1 = fv.getUint32(12, true);
    expect(arg0).toBe(VSFR.SPEC_RESET);
    expect(arg1).toBe(0);

    await client.disconnect();
  });

  it('readSpectrum decodes the VS.SPECTRUM response into a SpectrumSnapshot', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureHex = readFileSync(
      join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
      'utf8',
    ).trim();
    const fixtureBytes = fromHex(fixtureHex);

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const snap = await client.readSpectrum();
    expect(snap.counts.length).toBe(1024);
    expect(snap.durationSec).toBe(60);
    expect(snap.coefficients).toEqual([0, 2.5, 0]);

    await client.disconnect();
  });

  it('disconnect stops polling and unsubscribes', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0x00, 0x00, 0x00]),
        );
      }
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const onMeasurement = vi.fn();
    client.startPolling(onMeasurement, 500);

    await client.disconnect();
    const writesBefore = adapter.writes.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(adapter.writes.length).toBe(writesBefore);
    expect(adapter.disconnect).toHaveBeenCalledWith('dev');
  });

  it('startSpectrumPolling invokes callback at the configured interval', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        // args start at offset 8 (after 4-byte length + 4-byte header)
        const vsId = view.getUint32(8, true);
        if (vsId === VS.SPECTRUM) {
          return buildResponseChunks(
            COMMAND.RD_VIRT_STRING,
            seq,
            fixtureBytes,
          );
        }
        // Fallback for DATA_BUF or other VS ids: minimal body with retcode+flen=0.
        const empty = new Uint8Array(8);
        return buildResponseChunks(COMMAND.RD_VIRT_STRING, seq, empty);
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const received: SpectrumSnapshot[] = [];
    client.startSpectrumPolling((s) => received.push(s), 2000);

    // Before the first interval elapses, no callback should have fired.
    await vi.advanceTimersByTimeAsync(1000);
    expect(received.length).toBe(0);

    // Advance to the first tick → readSpectrum resolves, callback fires.
    await vi.advanceTimersByTimeAsync(1000);
    expect(received.length).toBe(1);
    expect(received[0].counts.length).toBe(1024);

    // Advance to the next tick → second callback.
    await vi.advanceTimersByTimeAsync(2000);
    expect(received.length).toBe(2);

    client.stopSpectrumPolling();
    await client.disconnect();
  });

  it('stopSpectrumPolling prevents further callbacks', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const received: SpectrumSnapshot[] = [];
    client.startSpectrumPolling((s) => received.push(s), 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(received.length).toBe(1);

    client.stopSpectrumPolling();
    const afterStop = received.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(received.length).toBe(afterStop);

    await client.disconnect();
  });

  it('registers onDisconnect during connect and emits reconnecting + connection-lost after 3 failed reconnects', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const events: string[] = [];
    client.onSessionEvent((e) => events.push(e));

    const received: SpectrumSnapshot[] = [];
    client.startSpectrumPolling((s) => received.push(s), 2000);

    // Make future connect() calls fail → all 3 reconnects will throw
    (adapter.connect as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        throw new Error('connect failed');
      },
    );

    // Trigger the disconnect event
    adapter.simulateDisconnect();

    // Let the microtask queue flush, then advance timers for 3 attempts × 2s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(2100);

    expect(events).toContain('reconnecting');
    expect(events).toContain('connection-lost');
    // spectrum polling must be stopped after connection-lost
    const writesAfter = adapter.writes.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.writes.length).toBe(writesAfter);
  });

  it('re-subscribes to BLE notifications after a successful reconnect', async () => {
    // Regression: without re-subscribing, the old characteristic's listener
    // is dead after the GATT drop, so `handleUnexpectedDisconnect` would
    // wedge on `execute(SET_EXCHANGE)` because the response notifications
    // never reach the client.
    const adapter = makeAdapter();
    let seqCounter = 0;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    expect(adapter.onNotification).toHaveBeenCalledTimes(1);

    client.startSpectrumPolling(() => {}, 2000);
    adapter.simulateDisconnect();

    await vi.advanceTimersByTimeAsync(2100);

    // Client must re-subscribe to notifications as part of the reconnect.
    expect(
      (adapter.onNotification as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);

    client.stopSpectrumPolling();
    await client.disconnect();
  });

  it('emits reconnected when a reconnect attempt succeeds', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const events: string[] = [];
    client.onSessionEvent((e) => events.push(e));

    const received: SpectrumSnapshot[] = [];
    client.startSpectrumPolling((s) => received.push(s), 2000);

    // First attempt fails, second succeeds
    let attempt = 0;
    (adapter.connect as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('first fail');
      },
    );

    adapter.simulateDisconnect();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(2100);

    expect(events).toContain('reconnecting');
    expect(events).toContain('reconnected');
    expect(events).not.toContain('connection-lost');

    client.stopSpectrumPolling();
    await client.disconnect();
  });

  it('does not reconnect if no spectrum session is active', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    const events: string[] = [];
    client.onSessionEvent((e) => events.push(e));

    // no startSpectrumPolling → disconnect should not trigger reconnect
    adapter.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toEqual([]);
  });

  it('disconnect() clears onDisconnect so no reconnect fires after clean shutdown', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME) {
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      }
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    client.startSpectrumPolling(() => {}, 2000);

    const events: string[] = [];
    client.onSessionEvent((e) => events.push(e));

    await client.disconnect();

    // adapter-side disconnect event arriving after clean shutdown must be a no-op
    adapter.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toEqual([]);
  });

  it('disconnect stops spectrum polling', async () => {
    const adapter = makeAdapter();
    let seqCounter = 0;
    const fixtureBytes = fromHex(
      readFileSync(
        join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
        'utf8',
      ).trim(),
    );

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.WR_VIRT_SFR) {
        return buildResponseChunks(
          cmd,
          seq,
          new Uint8Array([0x01, 0, 0, 0]),
        );
      }
      if (cmd === COMMAND.RD_VIRT_STRING) {
        return buildResponseChunks(
          COMMAND.RD_VIRT_STRING,
          seq,
          fixtureBytes,
        );
      }
      return buildResponseChunks(cmd, seq, new Uint8Array(0));
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const received: SpectrumSnapshot[] = [];
    client.startSpectrumPolling((s) => received.push(s), 1000);

    await client.disconnect();
    const writesBefore = adapter.writes.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.writes.length).toBe(writesBefore);
  });

  it('readSfrU32 sends RD_VIRT_SFR(id) and decodes the u32 value', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      if (cmd === COMMAND.WR_VIRT_SFR)
        return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
      if (cmd === COMMAND.RD_VIRT_SFR) {
        const payload = new Uint8Array(8);
        const v = new DataView(payload.buffer);
        v.setUint32(0, 1, true);
        v.setUint32(4, 1337, true);
        return buildResponseChunks(cmd, seq, payload);
      }
      return null;
    });
    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const value = await client.readSfrU32(VSFR.DR_LEV1_uR_h);
    expect(value).toBe(1337);
    const lastWrite = adapter.writes[adapter.writes.length - 1];
    const args = lastWrite.slice(8);
    expect(Array.from(args)).toEqual([0x00, 0x80, 0x00, 0x00]);
    await client.disconnect();
  });

  it('readSettings uses RD_VIRT_SFR_BATCH for all 11 VSFRs in one call', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;

    // Expected order the client requests the VSFRs in — mirrors the
    // RadiacodeSettings key order. Using a fixed order keeps the responder
    // simple: we build the batch response in this order.
    const expectedOrder = [
      VSFR.DR_LEV1_uR_h,
      VSFR.DR_LEV2_uR_h,
      VSFR.DS_LEV1_uR,
      VSFR.DS_LEV2_uR,
      VSFR.SOUND_ON,
      VSFR.SOUND_VOL,
      VSFR.VIBRO_ON,
      VSFR.LEDS_ON,
      VSFR.DS_UNITS,
      VSFR.CR_UNITS,
      VSFR.USE_nSv_h,
    ];
    const valueByVsfr: Record<number, number> = {
      [VSFR.DR_LEV1_uR_h]: 100_000,
      [VSFR.DR_LEV2_uR_h]: 200_000,
      [VSFR.DS_LEV1_uR]: 10_000_000,
      [VSFR.DS_LEV2_uR]: 20_000_000,
      [VSFR.SOUND_ON]: 1,
      [VSFR.SOUND_VOL]: 5,
      [VSFR.VIBRO_ON]: 0,
      [VSFR.LEDS_ON]: 1,
      [VSFR.DS_UNITS]: 1,
      [VSFR.CR_UNITS]: 0,
      [VSFR.USE_nSv_h]: 0,
    };
    const batchRequestedIds: number[] = [];

    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
      const cmd = view.getUint16(4, true);
      const seq = seqCounter++;
      if (cmd === COMMAND.SET_EXCHANGE || cmd === COMMAND.SET_TIME)
        return buildResponseChunks(cmd, seq, new Uint8Array(0));
      if (cmd === COMMAND.WR_VIRT_SFR)
        return buildResponseChunks(cmd, seq, new Uint8Array([1, 0, 0, 0]));
      if (cmd === COMMAND.RD_VIRT_SFR_BATCH) {
        // Args: <I n><n*I ids>. Read requested ids, respond with values in order.
        const n = view.getUint32(8, true);
        for (let i = 0; i < n; i++) {
          batchRequestedIds.push(view.getUint32(12 + i * 4, true));
        }
        const body = new Uint8Array(4 + n * 4);
        const bv = new DataView(body.buffer);
        bv.setUint32(0, (1 << n) - 1, true); // all valid
        for (let i = 0; i < n; i++) {
          bv.setUint32(4 + i * 4, valueByVsfr[batchRequestedIds[i]] ?? 0, true);
        }
        return buildResponseChunks(cmd, seq, body);
      }
      return null;
    });

    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();
    const result = await client.readSettings();
    expect(result).toEqual({
      settings: {
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
      },
      unsupportedFields: [],
    });
    expect(batchRequestedIds).toEqual(expectedOrder);
    await client.disconnect();
  });

  it('writeSettings writes only the VSFRs present in the patch', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    const wrArgs: Array<{ id: number; bytes: Uint8Array }> = [];
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
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
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
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

  it('native path: connect skips handshake writes and startPolling subscribes to bridge', async () => {
    vi.useRealTimers();
    const nativeBridge = await import('./nativeBridge');
    (nativeBridge.isNativeAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const emitterRef: {
      current: ((m: RadiacodeMeasurement) => void) | null;
    } = { current: null };
    (nativeBridge.onNativeMeasurement as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (m: RadiacodeMeasurement) => void) => {
        emitterRef.current = h;
        return () => {
          emitterRef.current = null;
        };
      },
    );

    const adapter = makeAdapter();
    const client = new RadiacodeClient(adapter, 'dev');
    await client.connect();

    // Im Native-Mode darf der Client keine Handshake-Frames schicken — der
    // Foreground-Service hat das bereits erledigt.
    expect(adapter.writes.length).toBe(0);

    const seen: RadiacodeMeasurement[] = [];
    client.startPolling((m) => seen.push(m), 500);

    // Kein Poll-Write am TS-Layer — Messwerte kommen aus dem Plugin-Event.
    expect(adapter.writes.length).toBe(0);
    expect(emitterRef.current).not.toBeNull();

    emitterRef.current?.({
      dosisleistung: 0.123,
      cps: 4.2,
      timestamp: 42,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].dosisleistung).toBe(0.123);

    await client.disconnect();
    expect(emitterRef.current).toBeNull();

    (nativeBridge.isNativeAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it('writeSfrBool sends WR_VIRT_SFR(id, 0/1)', async () => {
    vi.useRealTimers();
    const adapter = makeAdapter();
    let seqCounter = 0;
    const wrFrames: Uint8Array[] = [];
    adapter.setResponder((frame) => {
      const view = new DataView(
        frame.buffer,
        frame.byteOffset,
        frame.byteLength,
      );
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
});
