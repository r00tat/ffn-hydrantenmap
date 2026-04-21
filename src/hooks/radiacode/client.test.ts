import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeClient } from './client';
import { COMMAND, VSFR } from './protocol';

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
}

function makeAdapter(): MockAdapter {
  let notifyHandler: ((bytes: Uint8Array) => void) | null = null;
  const writes: Uint8Array[] = [];
  let buffered = new Uint8Array(0);
  let responder: ((frame: Uint8Array) => Uint8Array[] | null) | null = null;

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
  realtime: { cps: number; doseRateSv: number },
  rare: { doseSv: number; temperatureC: number; chargePct: number },
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
  rv.setUint16(15, 0, true);
  rv.setUint16(17, 0, true);
  rv.setUint16(19, 0, true);
  rv.setUint8(21, 0);
  records.push(...new Uint8Array(realtimeBuf));

  // Rare record: seq=1, eid=0, gid=3, tsOffset=0, then 14B payload
  // duration u32, dose f32 (Sv), temperature u16 ((t*100)+2000), charge u16 (pct*100), flags u16
  const rareBuf = new ArrayBuffer(7 + 14);
  const rr = new DataView(rareBuf);
  rr.setUint8(0, 1); // seq
  rr.setUint8(1, 0); // eid
  rr.setUint8(2, 3); // gid
  rr.setInt32(3, 0, true);
  rr.setUint32(7, 100, true); // duration
  rr.setFloat32(11, rare.doseSv, true);
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
      { cps: 3.5, doseRateSv: 2e-7 },
      { doseSv: 1.23e-4, temperatureC: 23.5, chargePct: 87.3 },
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
    expect(m.dose).toBeCloseTo(1.23e-4 * 1e6, 1); // 123 µSv
    expect(m.temperatureC).toBeCloseTo(23.5, 1);
    expect(m.chargePct).toBeCloseTo(87.3, 1);

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
});
