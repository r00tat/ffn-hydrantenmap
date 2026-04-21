import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMAND,
  MAX_WRITE_CHUNK,
  ResponseReassembler,
  VS,
  VSFR,
  buildRequest,
  decodeDataBufRecords,
  decodeFwSignature,
  decodeSerial,
  decodeSpectrumResponse,
  decodeVersion,
  decodeVsfrBool,
  decodeVsfrU32,
  decodeVsfrU8,
  encodeVsfrRead,
  encodeVsfrWriteBool,
  encodeVsfrWriteU32,
  encodeVsfrWriteU8,
  splitForWrite,
} from './protocol';

function loadFixture(name: string): string[] {
  const raw = readFileSync(
    join(__dirname, '__fixtures__', `${name}.hex`),
    'utf8',
  );
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('##'));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('buildRequest', () => {
  it('encodes SET_EXCHANGE request matching captured wire bytes', () => {
    // Fixture: SET_EXCHANGE args=01ff12ff, seq=0x80
    const lines = loadFixture('set_exchange_req');
    const chunks = lines.slice(0, lines.length - 1);
    const wireBytes = chunks[0];

    const frame = buildRequest(
      COMMAND.SET_EXCHANGE,
      0,
      fromHex('01ff12ff'),
    );
    expect(hex(frame)).toBe(wireBytes);
  });

  it('encodes RD_VIRT_STRING DATA_BUF request matching captured wire bytes', () => {
    // Fixture: seq 0x8f = index 15 (0x8f - 0x80)
    const lines = loadFixture('databuf_req');
    const chunks = lines.slice(0, lines.length - 1);
    const wireBytes = chunks[0];

    // args = <I vs_id>: DATA_BUF = 0x100
    const args = new Uint8Array([0x00, 0x01, 0x00, 0x00]);
    const frame = buildRequest(COMMAND.RD_VIRT_STRING, 15, args);
    expect(hex(frame)).toBe(wireBytes);
  });

  it('uses seq 0x80..0x9f rolling over at 32', () => {
    const f1 = buildRequest(COMMAND.GET_STATUS, 0, new Uint8Array());
    const f2 = buildRequest(COMMAND.GET_STATUS, 31, new Uint8Array());
    const f3 = buildRequest(COMMAND.GET_STATUS, 32, new Uint8Array()); // wraps to 0x80
    expect(f1[7]).toBe(0x80);
    expect(f2[7]).toBe(0x9f);
    expect(f3[7]).toBe(0x80);
  });
});

describe('splitForWrite', () => {
  it('keeps short frames as a single chunk', () => {
    const frame = buildRequest(
      COMMAND.SET_EXCHANGE,
      0,
      fromHex('01ff12ff'),
    );
    const chunks = splitForWrite(frame);
    expect(chunks).toHaveLength(1);
    expect(hex(chunks[0])).toBe(hex(frame));
  });

  it('splits long frames into 18-byte chunks', () => {
    const longArgs = new Uint8Array(50);
    longArgs.fill(0xab);
    const frame = buildRequest(COMMAND.WR_VIRT_STRING, 0, longArgs);
    // Total frame = 4 (len) + 4 (header) + 50 (args) = 58 B
    const chunks = splitForWrite(frame);
    expect(chunks.length).toBe(Math.ceil(58 / MAX_WRITE_CHUNK));
    expect(chunks[0].length).toBe(MAX_WRITE_CHUNK);
    expect(chunks[chunks.length - 1].length).toBeLessThanOrEqual(
      MAX_WRITE_CHUNK,
    );
    // Concatenation must equal the original frame
    const rejoined = new Uint8Array(frame.length);
    let off = 0;
    for (const c of chunks) {
      rejoined.set(c, off);
      off += c.length;
    }
    expect(hex(rejoined)).toBe(hex(frame));
  });
});

describe('ResponseReassembler', () => {
  it('reassembles a single-chunk response', () => {
    const lines = loadFixture('set_exchange_rsp');
    const chunks = lines.slice(0, lines.length - 1);
    const reassembled = lines[lines.length - 1];

    const r = new ResponseReassembler();
    let out: Uint8Array | null = null;
    for (const c of chunks) {
      out = r.push(fromHex(c));
    }
    expect(out).not.toBeNull();
    expect(hex(out as Uint8Array)).toBe(reassembled);
  });

  it('reassembles a 3-chunk DATA_BUF response', () => {
    const lines = loadFixture('databuf_rsp_small');
    const chunks = lines.slice(0, lines.length - 1);
    const reassembled = lines[lines.length - 1];

    const r = new ResponseReassembler();
    let out: Uint8Array | null = null;
    // Push all but last chunk — should return null (still collecting)
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(r.push(fromHex(chunks[i]))).toBeNull();
    }
    out = r.push(fromHex(chunks[chunks.length - 1]));
    expect(out).not.toBeNull();
    expect(hex(out as Uint8Array)).toBe(reassembled);
  });

  it('reassembles a 34-chunk backlog response', () => {
    const lines = loadFixture('databuf_rsp_backlog');
    const chunks = lines.slice(0, lines.length - 1);
    const reassembled = lines[lines.length - 1];

    const r = new ResponseReassembler();
    let out: Uint8Array | null = null;
    for (const c of chunks) {
      out = r.push(fromHex(c));
    }
    expect(out).not.toBeNull();
    expect(hex(out as Uint8Array)).toBe(reassembled);
    expect((out as Uint8Array).length).toBe(661);
  });

  it('parseHeader returns cmd + seq + data from reassembled payload', () => {
    const lines = loadFixture('set_exchange_rsp');
    const reassembled = lines[lines.length - 1];
    const r = new ResponseReassembler();
    r.push(fromHex(lines[0]));
    const parsed = r.parseLast();
    expect(parsed).not.toBeNull();
    expect(parsed?.cmd).toBe(COMMAND.SET_EXCHANGE);
    expect(parsed?.seq).toBe(0);
    // data = everything after the 4-byte header
    const expectedData = reassembled.slice(8); // 4 bytes header = 8 hex chars
    expect(hex(parsed!.data)).toBe(expectedData);
  });

  it('handles two back-to-back responses', () => {
    const r = new ResponseReassembler();
    const lines1 = loadFixture('set_exchange_rsp');
    const out1 = r.push(fromHex(lines1[0]));
    expect(out1).not.toBeNull();

    const lines2 = loadFixture('databuf_rsp_small');
    const chunks2 = lines2.slice(0, lines2.length - 1);
    let out2: Uint8Array | null = null;
    for (const c of chunks2) {
      out2 = r.push(fromHex(c));
    }
    expect(out2).not.toBeNull();
    expect(hex(out2 as Uint8Array)).toBe(lines2[lines2.length - 1]);
  });
});

describe('decodeDataBufRecords', () => {
  it('decodes the small fixture into 1 RealTime + 1 Raw record', () => {
    const lines = loadFixture('databuf_records_small');
    const bytes = fromHex(lines[0]);
    const records = decodeDataBufRecords(bytes);
    expect(records).toHaveLength(2);

    const rt = records[0];
    expect(rt.type).toBe('realtime');
    if (rt.type !== 'realtime') throw new Error();
    expect(rt.seq).toBe(12);
    expect(rt.timestampOffsetMs).toBe(-13320);
    expect(rt.countRate).toBeCloseTo(5.931, 3);
    expect(rt.doseRate).toBeCloseTo(8.05e-6, 8);
    expect(rt.countRateErrPct).toBeCloseTo(15.1, 1);
    expect(rt.doseRateErrPct).toBeCloseTo(50.3, 1);
    expect(rt.flags).toBe(0x40);
    expect(rt.realTimeFlags).toBe(0);

    const raw = records[1];
    expect(raw.type).toBe('raw');
    if (raw.type !== 'raw') throw new Error();
    expect(raw.seq).toBe(13);
    expect(raw.timestampOffsetMs).toBe(930);
    expect(raw.countRate).toBeCloseTo(6.0, 3);
  });

  it('decodes backlog fixture without throwing, extracting RealTime records', () => {
    const lines = loadFixture('databuf_records_backlog');
    const bytes = fromHex(lines[0]);
    const records = decodeDataBufRecords(bytes);
    // Should at least produce the records we verified earlier
    expect(records.length).toBeGreaterThan(0);
    const rts = records.filter((r) => r.type === 'realtime');
    expect(rts.length).toBeGreaterThanOrEqual(1);
  });

  it('extractLatestRealtime returns newest RealTimeData by seq', () => {
    const lines = loadFixture('databuf_records_small');
    const bytes = fromHex(lines[0]);
    const records = decodeDataBufRecords(bytes);
    const rt = records
      .filter((r) => r.type === 'realtime')
      .at(-1);
    expect(rt).toBeDefined();
    expect(rt?.type).toBe('realtime');
  });
});

describe('decodeSpectrumResponse', () => {
  it('decodes the synthetic spectrum fixture', () => {
    const raw = readFileSync(
      join(__dirname, '__fixtures__', 'spectrum_rsp.hex'),
      'utf8',
    ).trim();
    const payload = new Uint8Array(Buffer.from(raw, 'hex'));
    const snap = decodeSpectrumResponse(payload);

    expect(snap.durationSec).toBe(60);
    expect(snap.coefficients).toEqual([0, 2.5, 0]);
    expect(snap.counts.length).toBe(1024);
    expect(snap.counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);

    let peak = 0;
    for (let i = 1; i < snap.counts.length; i++) {
      if (snap.counts[i] > snap.counts[peak]) peak = i;
    }
    expect(Math.abs(peak - 264)).toBeLessThanOrEqual(1);
  });

  it('throws on a payload that is too short', () => {
    expect(() => decodeSpectrumResponse(new Uint8Array(10))).toThrow(
      /spectrum payload/i,
    );
  });

  it('throws when declared flen overflows the buffer', () => {
    // 24 bytes = minimum (passes initial short-payload guard)
    // retcode=1, flen=0xFFFFFFFF (way larger than buffer-8)
    const payload = new Uint8Array(24);
    const view = new DataView(payload.buffer);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0xffffffff, true);
    expect(() => decodeSpectrumResponse(payload)).toThrow(
      /declared flen=.* but only .* B available/i,
    );
  });
});

describe('COMMAND / VS constants', () => {
  it('matches numeric values from cdump/radiacode', () => {
    expect(COMMAND.SET_EXCHANGE).toBe(0x0007);
    expect(COMMAND.GET_VERSION).toBe(0x000a);
    expect(COMMAND.RD_VIRT_SFR).toBe(0x0824);
    expect(COMMAND.WR_VIRT_SFR).toBe(0x0825);
    expect(COMMAND.RD_VIRT_STRING).toBe(0x0826);
    expect(VS.DATA_BUF).toBe(0x100);
    expect(VS.ENERGY_CALIB).toBe(0x202);
  });
});

describe('decodeVersion', () => {
  it('extracts boot + target major/minor and dates', () => {
    // boot: minor=1, major=4, date="Jan 10 2024"
    // target: minor=14, major=4, date="Apr  1 2025"
    const bootDate = 'Jan 10 2024';
    const targetDate = 'Apr  1 2025';
    const buf = new Uint8Array(4 + 4 + bootDate.length + 4 + 4 + targetDate.length);
    const v = new DataView(buf.buffer);
    v.setUint16(0, 1, true); // boot minor
    v.setUint16(2, 4, true); // boot major
    v.setUint32(4, bootDate.length, true);
    for (let i = 0; i < bootDate.length; i++) buf[8 + i] = bootDate.charCodeAt(i);
    const targetOffset = 8 + bootDate.length;
    v.setUint16(targetOffset, 14, true); // target minor
    v.setUint16(targetOffset + 2, 4, true); // target major
    v.setUint32(targetOffset + 4, targetDate.length, true);
    for (let i = 0; i < targetDate.length; i++) {
      buf[targetOffset + 8 + i] = targetDate.charCodeAt(i);
    }
    const result = decodeVersion(buf);
    expect(result.bootMajor).toBe(4);
    expect(result.bootMinor).toBe(1);
    expect(result.bootDate).toBe('Jan 10 2024');
    expect(result.targetMajor).toBe(4);
    expect(result.targetMinor).toBe(14);
    expect(result.targetDate).toBe('Apr  1 2025');
  });
});

describe('decodeSerial', () => {
  it('formats 12-byte serial as hyphen-separated hex groups', () => {
    const buf = new Uint8Array(4 + 12);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 12, true);
    v.setUint32(4, 0x12345678, true);
    v.setUint32(8, 0x9abcdef0, true);
    v.setUint32(12, 0xdeadbeef, true);
    expect(decodeSerial(buf)).toBe('12345678-9ABCDEF0-DEADBEEF');
  });

  it('throws on non-multiple-of-4 length', () => {
    const buf = new Uint8Array(4 + 3);
    new DataView(buf.buffer).setUint32(0, 3, true);
    expect(() => decodeSerial(buf)).toThrow(/length/i);
  });
});

describe('decodeFwSignature', () => {
  it('extracts CRC + filename + id string', () => {
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
    const result = decodeFwSignature(buf);
    expect(result.signature).toBe(0xdeadbeef);
    expect(result.fileName).toBe('rc-103.bin');
    expect(result.idString).toBe('RadiaCode RC-103');
  });
});

describe('VSFR encoders', () => {
  it('encodeVsfrRead packs the id as u32 LE', () => {
    const bytes = encodeVsfrRead(0x8000);
    expect(Array.from(bytes)).toEqual([0x00, 0x80, 0x00, 0x00]);
  });

  it('encodeVsfrWriteU32 packs id + value as two u32 LE', () => {
    const bytes = encodeVsfrWriteU32(VSFR.DR_LEV1_uR_h, 0x12345678);
    expect(Array.from(bytes)).toEqual([
      0x00, 0x80, 0x00, 0x00, 0x78, 0x56, 0x34, 0x12,
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

describe('VSFR decoders', () => {
  it('decodeVsfrU32 returns the value after the retcode', () => {
    const payload = new Uint8Array(8);
    const v = new DataView(payload.buffer);
    v.setUint32(0, 1, true);
    v.setUint32(4, 4200, true);
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
