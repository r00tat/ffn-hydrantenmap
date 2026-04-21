import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeClient } from './client';
import { COMMAND } from './protocol';

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
