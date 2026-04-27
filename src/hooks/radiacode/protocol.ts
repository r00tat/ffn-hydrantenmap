export const COMMAND = {
  GET_STATUS: 0x0005,
  SET_EXCHANGE: 0x0007,
  GET_VERSION: 0x000a,
  GET_SERIAL: 0x000b,
  FW_SIGNATURE: 0x0101,
  RD_VIRT_SFR: 0x0824,
  WR_VIRT_SFR: 0x0825,
  RD_VIRT_STRING: 0x0826,
  WR_VIRT_STRING: 0x0827,
  RD_VIRT_SFR_BATCH: 0x082a,
  WR_VIRT_SFR_BATCH: 0x082b,
  SET_TIME: 0x0a04,
} as const;

export interface FirmwareVersion {
  bootMajor: number;
  bootMinor: number;
  bootDate: string;
  targetMajor: number;
  targetMinor: number;
  targetDate: string;
}

export interface FirmwareSignature {
  signature: number;
  fileName: string;
  idString: string;
}

function decodeLengthPrefixedString(
  view: DataView,
  offset: number,
): { value: string; nextOffset: number } {
  if (view.byteLength - offset < 4) {
    throw new Error('String too short: missing length prefix');
  }
  const len = view.getUint32(offset, true);
  if (view.byteLength - offset - 4 < len) {
    throw new Error(
      `String too short: declared ${len} B but only ${view.byteLength - offset - 4} available`,
    );
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 4, len);
  // Strings sind typischerweise ASCII/CP1251; bei ASCII reicht TextDecoder,
  // fremde Bytes werden als Replacement-Char dargestellt (für UI ok).
  const value = new TextDecoder('ascii', { fatal: false }).decode(bytes);
  return { value: value.replace(/\0+$/g, '').trim(), nextOffset: offset + 4 + len };
}

/** Decodes a GET_VERSION response payload (cmd 0x000A). */
export function decodeVersion(data: Uint8Array): FirmwareVersion {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 4) throw new Error('Version payload too short');
  const bootMinor = view.getUint16(0, true);
  const bootMajor = view.getUint16(2, true);
  const { value: bootDate, nextOffset: afterBoot } = decodeLengthPrefixedString(
    view,
    4,
  );
  const targetMinor = view.getUint16(afterBoot, true);
  const targetMajor = view.getUint16(afterBoot + 2, true);
  const { value: targetDate } = decodeLengthPrefixedString(view, afterBoot + 4);
  return { bootMajor, bootMinor, bootDate, targetMajor, targetMinor, targetDate };
}

/** Decodes a GET_SERIAL response payload (cmd 0x000B). */
export function decodeSerial(data: Uint8Array): string {
  if (data.length < 4) throw new Error('Serial payload too short');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = view.getUint32(0, true);
  if (len % 4 !== 0) throw new Error(`Unexpected serial length ${len}`);
  if (data.length - 4 < len) throw new Error('Serial payload truncated');
  const groups: string[] = [];
  for (let off = 4; off < 4 + len; off += 4) {
    const g = view.getUint32(off, true);
    groups.push(g.toString(16).toUpperCase().padStart(8, '0'));
  }
  return groups.join('-');
}

/** Decodes a FW_SIGNATURE response payload (cmd 0x0101). */
export function decodeFwSignature(data: Uint8Array): FirmwareSignature {
  if (data.length < 4) throw new Error('FW signature payload too short');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const signature = view.getUint32(0, true);
  const { value: fileName, nextOffset } = decodeLengthPrefixedString(view, 4);
  const { value: idString } = decodeLengthPrefixedString(view, nextOffset);
  return { signature, fileName, idString };
}

export const VS = {
  CONFIGURATION: 2,
  SERIAL_NUMBER: 8,
  TEXT_MESSAGE: 0xf,
  DATA_BUF: 0x100,
  SFR_FILE: 0x101,
  SPECTRUM: 0x200,
  ENERGY_CALIB: 0x202,
  SPEC_ACCUM: 0x205,
  DOSE_RESET: 0x800,
} as const;

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

export const MAX_WRITE_CHUNK = 18;
export const SEQ_MODULO = 32;

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
  return encodeVsfrWriteU32(id, value ? 1 : 0);
}

function checkVsfrRetcode(payload: Uint8Array): DataView {
  if (payload.length < 4) {
    throw new Error('VSFR response too short: missing retcode');
  }
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
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
  // Response layout per protocol: <I retcode><I value> (8 B). On error the
  // firmware may return only <I retcode> (4 B) without a value — check retcode
  // first so callers see the real error instead of a generic "too short".
  checkVsfrRetcode(payload);
  if (payload.length < 5) {
    throw new Error(
      `VSFR U8 response truncated: ${payload.length} B (retcode OK, value missing)`,
    );
  }
  return payload[4];
}

export function decodeVsfrBool(payload: Uint8Array): boolean {
  return decodeVsfrU8(payload) !== 0;
}

/**
 * Encode args for `RD_VIRT_SFR_BATCH` (0x082A): `<I n><n*I ids>` little-endian.
 * Firmware reads/writes that don't support single-VSFR `RD_VIRT_SFR` for
 * bool/u8 registers still accept the batch call — matches the official app.
 */
export function encodeVsfrBatchRead(ids: readonly number[]): Uint8Array {
  if (ids.length === 0) {
    throw new Error('encodeVsfrBatchRead: at least one VSFR id required');
  }
  const buf = new Uint8Array(4 + ids.length * 4);
  const v = new DataView(buf.buffer);
  v.setUint32(0, ids.length, true);
  for (let i = 0; i < ids.length; i++) {
    v.setUint32(4 + i * 4, ids[i] >>> 0, true);
  }
  return buf;
}

/**
 * Decode a `RD_VIRT_SFR_BATCH` response: `<I validity_mask><k*I values>`,
 * where `k = popcount(validity_mask)` — the firmware only sends values for
 * successfully read VSFRs. The returned array has length `count` with `null`
 * at positions of VSFRs the firmware rejected (invalid/unsupported id).
 * Callers decide whether to fail loudly or substitute a default.
 */
export function decodeVsfrBatchRead(
  payload: Uint8Array,
  count: number,
): (number | null)[] {
  if (payload.length < 4) {
    throw new Error(
      `VSFR batch response too short: ${payload.length} B (need at least 4 for validity mask)`,
    );
  }
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const mask = view.getUint32(0, true);
  let nValid = 0;
  for (let i = 0; i < count; i++) {
    if ((mask >>> i) & 1) nValid++;
  }
  const expectedLen = 4 + nValid * 4;
  if (payload.length < expectedLen) {
    throw new Error(
      `VSFR batch response too short: ${payload.length} B (need ${expectedLen} for ${nValid} valid values, mask=0b${mask.toString(2)})`,
    );
  }
  const result: (number | null)[] = new Array(count).fill(null);
  let valueIdx = 0;
  for (let i = 0; i < count; i++) {
    if ((mask >>> i) & 1) {
      result[i] = view.getUint32(4 + valueIdx * 4, true);
      valueIdx++;
    }
  }
  return result;
}

export function buildRequest(
  cmd: number,
  seqIndex: number,
  args: Uint8Array,
): Uint8Array {
  const seq = 0x80 + (seqIndex % SEQ_MODULO);
  const payloadLen = 4 + args.length;
  const frame = new Uint8Array(4 + payloadLen);
  const view = new DataView(frame.buffer);
  view.setUint32(0, payloadLen, true);
  view.setUint16(4, cmd, true);
  frame[6] = 0;
  frame[7] = seq;
  frame.set(args, 8);
  return frame;
}

export function splitForWrite(
  frame: Uint8Array,
  maxChunk = MAX_WRITE_CHUNK,
): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < frame.length; off += maxChunk) {
    chunks.push(frame.slice(off, Math.min(off + maxChunk, frame.length)));
  }
  return chunks;
}

export interface ParsedResponse {
  cmd: number;
  seq: number;
  data: Uint8Array;
}

/**
 * Reassembles fragmented BLE notifications into full response payloads.
 * The first chunk of a response carries a 4-byte LE length prefix indicating
 * how many HEADER+DATA bytes follow. push() returns the complete reassembled
 * payload (header+data, without the length prefix) as soon as it has been
 * fully received, otherwise null.
 */
export class ResponseReassembler {
  private buf: Uint8Array = new Uint8Array(0);
  private remaining = 0;
  private last: Uint8Array | null = null;

  push(chunk: Uint8Array): Uint8Array | null {
    if (this.remaining === 0) {
      if (chunk.length < 4) {
        return null;
      }
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const declared = view.getUint32(0, true);
      this.remaining = declared;
      this.buf = new Uint8Array(declared);
      const first = chunk.subarray(4);
      const copyLen = Math.min(first.length, this.remaining);
      this.buf.set(first.subarray(0, copyLen), 0);
      this.remaining -= copyLen;
      if (this.remaining === 0) {
        this.last = this.buf;
        this.buf = new Uint8Array(0);
        return this.last;
      }
      return null;
    }

    const written = this.buf.length - this.remaining;
    const copyLen = Math.min(chunk.length, this.remaining);
    this.buf.set(chunk.subarray(0, copyLen), written);
    this.remaining -= copyLen;
    if (this.remaining === 0) {
      this.last = this.buf;
      this.buf = new Uint8Array(0);
      return this.last;
    }
    return null;
  }

  parseLast(): ParsedResponse | null {
    if (!this.last || this.last.length < 4) return null;
    const view = new DataView(
      this.last.buffer,
      this.last.byteOffset,
      this.last.byteLength,
    );
    return {
      cmd: view.getUint16(0, true),
      seq: this.last[3] & 0x1f,
      data: this.last.subarray(4),
    };
  }
}

export function parseResponse(reassembled: Uint8Array): ParsedResponse {
  if (reassembled.length < 4) {
    throw new Error(
      `Response too short: ${reassembled.length} B (need ≥ 4 for header)`,
    );
  }
  const view = new DataView(
    reassembled.buffer,
    reassembled.byteOffset,
    reassembled.byteLength,
  );
  return {
    cmd: view.getUint16(0, true),
    seq: reassembled[3] & 0x1f,
    data: reassembled.subarray(4),
  };
}

export type DataBufRecord =
  | RealTimeRecord
  | RawRecord
  | DoseRateDbRecord
  | RareRecord
  | EventRecord
  | UnknownRecord;

export interface RealTimeRecord {
  type: 'realtime';
  seq: number;
  timestampOffsetMs: number;
  countRate: number;
  doseRate: number;
  countRateErrPct: number;
  doseRateErrPct: number;
  flags: number;
  realTimeFlags: number;
}

export interface RawRecord {
  type: 'raw';
  seq: number;
  timestampOffsetMs: number;
  countRate: number;
  doseRate: number;
}

export interface DoseRateDbRecord {
  type: 'doseRateDb';
  seq: number;
  timestampOffsetMs: number;
  count: number;
  countRate: number;
  doseRate: number;
  doseRateErrPct: number;
  flags: number;
}

export interface RareRecord {
  type: 'rare';
  seq: number;
  timestampOffsetMs: number;
  duration: number;
  dose: number;
  temperatureC: number;
  chargePct: number;
  flags: number;
}

export interface EventRecord {
  type: 'event';
  seq: number;
  timestampOffsetMs: number;
  event: number;
  param1: number;
  flags: number;
}

export interface UnknownRecord {
  type: 'unknown';
  seq: number;
  timestampOffsetMs: number;
  eid: number;
  gid: number;
}

/**
 * Decodes a DATA_BUF record stream. Follows the same layout as
 * cdump/radiacode's decode_VS_DATA_BUF. Returns recognized records;
 * stops at the first unknown (eid,gid) combination where the record
 * length cannot be determined, matching the reference implementation's
 * defensive behavior.
 */
export function decodeDataBufRecords(data: Uint8Array): DataBufRecord[] {
  const records: DataBufRecord[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  // Sequenznummer-Verifikation analog radiacode-py: pro Record um 1
  // erhöhter Byte-Counter. Springt er, wurde der Cursor zwischen
  // den Records verschoben (z.B. durch eine falsche Längen-Annahme bei
  // einem unbekannten Record-Type). In dem Fall sauber abbrechen, statt
  // Müll-Records zu produzieren.
  let nextSeq: number | null = null;

  while (data.length - off >= 7) {
    const seq = data[off];
    const eid = data[off + 1];
    const gid = data[off + 2];
    if (nextSeq !== null && nextSeq !== seq) {
      break;
    }
    nextSeq = (seq + 1) & 0xff;
    const tsOffset = view.getInt32(off + 3, true);
    const tsMs = tsOffset * 10;
    off += 7;

    if (eid === 0 && gid === 0) {
      if (data.length - off < 15) break;
      records.push({
        type: 'realtime',
        seq,
        timestampOffsetMs: tsMs,
        countRate: view.getFloat32(off, true),
        doseRate: view.getFloat32(off + 4, true),
        countRateErrPct: view.getUint16(off + 8, true) / 10,
        doseRateErrPct: view.getUint16(off + 10, true) / 10,
        flags: view.getUint16(off + 12, true),
        realTimeFlags: data[off + 14],
      });
      off += 15;
    } else if (eid === 0 && gid === 1) {
      if (data.length - off < 8) break;
      records.push({
        type: 'raw',
        seq,
        timestampOffsetMs: tsMs,
        countRate: view.getFloat32(off, true),
        doseRate: view.getFloat32(off + 4, true),
      });
      off += 8;
    } else if (eid === 0 && gid === 2) {
      if (data.length - off < 16) break;
      records.push({
        type: 'doseRateDb',
        seq,
        timestampOffsetMs: tsMs,
        count: view.getUint32(off, true),
        countRate: view.getFloat32(off + 4, true),
        doseRate: view.getFloat32(off + 8, true),
        doseRateErrPct: view.getUint16(off + 12, true) / 10,
        flags: view.getUint16(off + 14, true),
      });
      off += 16;
    } else if (eid === 0 && gid === 3) {
      if (data.length - off < 14) break;
      const duration = view.getUint32(off, true);
      const dose = view.getFloat32(off + 4, true);
      const temperature = view.getUint16(off + 8, true);
      const charge = view.getUint16(off + 10, true);
      const flags = view.getUint16(off + 12, true);
      records.push({
        type: 'rare',
        seq,
        timestampOffsetMs: tsMs,
        duration,
        dose,
        temperatureC: (temperature - 2000) / 100,
        chargePct: charge / 100,
        flags,
      });
      off += 14;
    } else if (eid === 0 && gid === 4) {
      // GRP_UserData (radiacode-py decoders/databuf.py): <I f f H H> = 16 bytes.
      // Inhalt wird derzeit nicht ausgewertet (radiacode-py macht TODO ebenfalls);
      // wichtig ist nur, die Bytes korrekt zu überspringen, damit nachfolgende
      // Records (insb. gid=3 RareData) nicht verloren gehen.
      if (data.length - off < 16) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += 16;
    } else if (eid === 0 && gid === 5) {
      // GRP_SheduleData: <I f f H H> = 16 bytes
      if (data.length - off < 16) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += 16;
    } else if (eid === 0 && gid === 6) {
      // GRP_AccelData: <H H H> = 6 bytes
      if (data.length - off < 6) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += 6;
    } else if (eid === 0 && gid === 7) {
      if (data.length - off < 4) break;
      records.push({
        type: 'event',
        seq,
        timestampOffsetMs: tsMs,
        event: data[off],
        param1: data[off + 1],
        flags: view.getUint16(off + 2, true),
      });
      off += 4;
    } else if (eid === 0 && gid === 8) {
      // GRP_RawCountRate: <f H> = 6 bytes
      if (data.length - off < 6) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += 6;
    } else if (eid === 0 && gid === 9) {
      // GRP_RawDoseRate: <f H> = 6 bytes
      if (data.length - off < 6) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += 6;
    } else if (eid === 1 && (gid === 1 || gid === 2 || gid === 3)) {
      // Variable-length histogram-style records. Header is <H samples_num><I smpl_time_ms>,
      // followed by samples_num × (8|16|14) bytes depending on gid.
      if (data.length - off < 6) break;
      const samplesNum = view.getUint16(off, true);
      const perSample = gid === 1 ? 8 : gid === 2 ? 16 : 14;
      const payloadLen = 6 + samplesNum * perSample;
      if (data.length - off < payloadLen) break;
      records.push({
        type: 'unknown',
        seq,
        timestampOffsetMs: tsMs,
        eid,
        gid,
      });
      off += payloadLen;
    } else {
      // Unrecognized record type — we can't know its length; stop here as the
      // Python reference does, to avoid corrupting subsequent decodes.
      break;
    }
  }
  return records;
}

export interface SpectrumSnapshot {
  durationSec: number;
  coefficients: [number, number, number];
  counts: number[];
  timestamp: number;
}

/**
 * Decodes a VS.SPECTRUM response payload. Layout:
 *   <retcode:u32 LE> <flen:u32 LE>
 *   <duration:u32 LE> <a0:f32 LE> <a1:f32 LE> <a2:f32 LE>
 *   <counts: u32 LE * n>
 */
export function decodeSpectrumResponse(payload: Uint8Array): SpectrumSnapshot {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  // Debug-Logging der ersten Bytes, um das Header-Layout im Feld zu verifizieren
  const headHex = Array.from(payload.subarray(0, 32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  console.log(
    `[RadiacodeProtocol] decodeSpectrumResponse len=${payload.length}, head=${headHex}`,
  );

  if (payload.length < 8) {
    throw new Error(`Spectrum payload too short: ${payload.length} B`);
  }

  // Wir suchen nach dem Start der Spektrum-Daten (duration + 3 coefficients).
  // Ein Virtual String Response sollte mit <retcode:u32><flen:u32> beginnen.
  // Das Spektrum-Innere beginnt mit <duration:u32>.
  
  let inner: Uint8Array | null = null;

  // Strategie 1: Standard Virtual String (8 Byte Header)
  const maybeRetcode = view.getUint32(0, true);
  const maybeFlen = view.getUint32(4, true);
  if (maybeRetcode === 1) {
    if (maybeFlen > payload.length - 8) {
      throw new Error(`Invalid spectrum response: declared flen=${maybeFlen} but only ${payload.length - 8} B available`);
    }
    if (maybeFlen > 0) {
      console.log(`[RadiacodeProtocol] Detected Virtual String Header (retcode=1, flen=${maybeFlen})`);
      inner = payload.subarray(8, 8 + maybeFlen);
    }
  }
  
  if (!inner) {
    // Strategie 2: Versatzprüfung. Manchmal schickt das Gerät 4 extra Bytes oder gar keinen Header.
    // Wir schauen uns die Koeffizienten an, um den richtigen Offset zu finden.
    // Typischerweise ist a1 (Kanal-zu-keV) zwischen 1.0 und 5.0.
    for (const offset of [0, 4, 8, 12]) {
      if (payload.length < offset + 16) continue;
      const a1 = view.getFloat32(offset + 8, true);
      if (a1 > 0.5 && a1 < 10.0) {
        console.log(`[RadiacodeProtocol] Found plausible calibration at offset ${offset} (a1=${a1.toFixed(4)})`);
        inner = payload.subarray(offset);
        break;
      }
    }
  }

  if (!inner || inner.length < 16) {
    throw new Error('Could not find valid spectrum header in payload');
  }

  const innerView = new DataView(inner.buffer, inner.byteOffset, inner.byteLength);
  const durationSec = innerView.getUint32(0, true);
  const a0 = innerView.getFloat32(4, true);
  const a1 = innerView.getFloat32(8, true);
  const a2 = innerView.getFloat32(12, true);

  console.log(`[RadiacodeProtocol] Spectrum decoded: duration=${durationSec}s, calib=[${a0.toFixed(2)}, ${a1.toFixed(4)}, ${a2.toExponential(2)}]`);

  // Kanäle ab Byte 16.
  // Es gibt zwei Formate laut cdump/radiacode:
  // Version 0: Full (1024 * 4 Bytes, uint32 LE)
  // Version 1: Delta-Compression (Variable Länge)
  
  const counts: number[] = [];
  let pos = 16;
  
  if (inner.length - 16 === 1024 * 4) {
    // Version 0: Full format
    for (let i = 0; i < 1024; i++) {
      counts.push(innerView.getUint32(pos, true));
      pos += 4;
    }
  } else {
    // Version 1: Delta-Compression (V1)
    let last = 0;
    while (pos < inner.length && counts.length < 1024) {
      if (pos + 2 > inner.length) break;
      const u16 = innerView.getUint16(pos, true);
      pos += 2;
      const cnt = (u16 >> 4) & 0x0FFF;
      const vlen = u16 & 0x0F;
      
      for (let i = 0; i < cnt && counts.length < 1024; i++) {
        let v = 0;
        if (vlen === 0) {
          v = 0;
        } else if (vlen === 1) {
          if (pos + 1 > inner.length) break;
          v = innerView.getUint8(pos);
          pos += 1;
        } else if (vlen === 2) {
          if (pos + 1 > inner.length) break;
          v = last + innerView.getInt8(pos);
          pos += 1;
        } else if (vlen === 3) {
          if (pos + 2 > inner.length) break;
          v = last + innerView.getInt16(pos, true);
          pos += 2;
        } else if (vlen === 4) {
          // int24 delta: <BBb>
          if (pos + 3 > inner.length) break;
          const a = innerView.getUint8(pos);
          const b = innerView.getUint8(pos + 1);
          const c = innerView.getInt8(pos + 2);
          v = last + ((c << 16) | (b << 8) | a);
          pos += 3;
        } else if (vlen === 5) {
          if (pos + 4 > inner.length) break;
          v = last + innerView.getInt32(pos, true);
          pos += 4;
        } else {
          // Unsupported vlen
          break;
        }
        last = v;
        counts.push(v);
      }
    }
    // Pad to 1024 if necessary
    while (counts.length < 1024) counts.push(0);
  }

  return {
    durationSec,
    coefficients: [a0, a1, a2],
    counts,
    timestamp: Date.now(),
  };
}
