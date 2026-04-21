import { BleAdapter, Unsubscribe } from './bleAdapter';
import {
  COMMAND,
  MAX_WRITE_CHUNK,
  ParsedResponse,
  ResponseReassembler,
  SEQ_MODULO,
  SpectrumSnapshot,
  VS,
  VSFR,
  buildRequest,
  decodeDataBufRecords,
  decodeFwSignature,
  decodeSerial,
  decodeSpectrumResponse,
  decodeVersion,
  decodeVsfrBatchRead,
  decodeVsfrBool,
  decodeVsfrU32,
  decodeVsfrU8,
  encodeVsfrBatchRead,
  encodeVsfrRead,
  encodeVsfrWriteBool,
  encodeVsfrWriteU32,
  encodeVsfrWriteU8,
  parseResponse,
  splitForWrite,
} from './protocol';
import {
  RadiacodeDeviceInfo,
  RadiacodeMeasurement,
  RadiacodeSettings,
} from './types';

const DOSE_RATE_TO_USVH = 10000;
// RareData.dose kommt als Rohwert in mSv; für die App-Anzeige in µSv mit 1e3 skalieren.
const DOSE_RAW_TO_USV = 1e3;

interface InFlight {
  cmd: number;
  seq: number;
  resolve: (r: ParsedResponse) => void;
  reject: (e: Error) => void;
}

interface Queued {
  cmd: number;
  args: Uint8Array;
  resolve: (r: ParsedResponse) => void;
  reject: (e: Error) => void;
}

function encodeSetTime(d: Date): Uint8Array {
  return new Uint8Array([
    d.getDate(),
    d.getMonth() + 1,
    d.getFullYear() - 2000,
    0,
    d.getSeconds(),
    d.getMinutes(),
    d.getHours(),
    0,
  ]);
}

function u32le(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value, true);
  return buf;
}

export type SessionEvent = 'reconnecting' | 'reconnected' | 'connection-lost';

/**
 * Orchestrates a single Radiacode BLE session: owns the sequence counter,
 * response reassembler, and a FIFO request queue. Request ordering is strictly
 * serial — the device pairs responses to requests by sequence byte, but the
 * reference implementation always waits for the prior response before issuing
 * the next request, and we mirror that. Concurrent callers (multiple pollers,
 * user commands) are queued transparently so they do not need retry logic.
 */
export class RadiacodeClient {
  private seqIndex = 0;
  private reassembler = new ResponseReassembler();
  private inFlight: InFlight | null = null;
  private queue: Queued[] = [];
  private unsubscribe: Unsubscribe | null = null;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private spectrumPolling = false;
  private spectrumTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionListeners = new Set<(e: SessionEvent) => void>();
  private disconnectUnsub: Unsubscribe | null = null;
  private reconnecting = false;

  constructor(
    private readonly adapter: BleAdapter,
    private readonly deviceId: string,
  ) {}

  async connect(now: Date = new Date()): Promise<void> {
    this.unsubscribe = await this.adapter.onNotification(
      this.deviceId,
      (chunk) => this.handleNotification(chunk),
    );
    await this.execute(
      COMMAND.SET_EXCHANGE,
      new Uint8Array([0x01, 0xff, 0x12, 0xff]),
    );
    await this.execute(COMMAND.SET_TIME, encodeSetTime(now));
    // Write VSFR DEVICE_TIME = 0 (matches cdump init).
    const args = new Uint8Array(8);
    new DataView(args.buffer).setUint32(0, VSFR.DEVICE_TIME, true);
    await this.execute(COMMAND.WR_VIRT_SFR, args);

    // Register disconnect watcher so we can auto-reconnect during an active
    // spectrum session if the link drops unexpectedly.
    this.disconnectUnsub =
      this.adapter.onDisconnect?.(this.deviceId, () => {
        void this.handleUnexpectedDisconnect();
      }) ?? null;
  }

  onSessionEvent(handler: (e: SessionEvent) => void): Unsubscribe {
    this.sessionListeners.add(handler);
    return () => {
      this.sessionListeners.delete(handler);
    };
  }

  private emitSessionEvent(event: SessionEvent): void {
    for (const h of this.sessionListeners) h(event);
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    // Only reconnect if a spectrum session was active; otherwise stay idle.
    if (!this.spectrumPolling || this.reconnecting) return;
    this.reconnecting = true;
    this.emitSessionEvent('reconnecting');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!this.spectrumPolling) {
        // caller stopped the session during the backoff
        this.reconnecting = false;
        return;
      }
      try {
        await this.adapter.connect(this.deviceId);
        // The previous notify characteristic died with the dropped GATT link.
        // Re-subscribe before issuing any commands, otherwise execute() hangs.
        this.unsubscribe?.();
        this.unsubscribe = await this.adapter.onNotification(
          this.deviceId,
          (chunk) => this.handleNotification(chunk),
        );
        await this.execute(
          COMMAND.SET_EXCHANGE,
          new Uint8Array([0x01, 0xff, 0x12, 0xff]),
        );
        await this.execute(COMMAND.SET_TIME, encodeSetTime(new Date()));
        this.reconnecting = false;
        this.emitSessionEvent('reconnected');
        return;
      } catch {
        // fall through to next attempt
      }
    }
    this.reconnecting = false;
    this.stopSpectrumPolling();
    this.emitSessionEvent('connection-lost');
  }

  startPolling(
    onMeasurement: (m: RadiacodeMeasurement) => void,
    intervalMs = 500,
  ): void {
    if (this.polling) return;
    this.polling = true;
    const tick = async () => {
      if (!this.polling) return;
      try {
        const rsp = await this.execute(
          COMMAND.RD_VIRT_STRING,
          u32le(VS.DATA_BUF),
        );
        const m = extractLatestMeasurement(rsp);
        if (m) onMeasurement(m);
      } catch {
        // transient — continue polling
      }
      if (this.polling) {
        this.pollTimer = setTimeout(tick, intervalMs);
      }
    };
    this.pollTimer = setTimeout(tick, intervalMs);
  }

  async specReset(): Promise<void> {
    const args = new Uint8Array(8);
    const v = new DataView(args.buffer);
    v.setUint32(0, VSFR.SPEC_RESET, true);
    v.setUint32(4, 0, true);
    await this.execute(COMMAND.WR_VIRT_SFR, args);
  }

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

  /**
   * Batch-read multiple VSFRs in one call (`RD_VIRT_SFR_BATCH` / 0x082A).
   * Required for u8/bool registers on firmwares that reject `RD_VIRT_SFR` for
   * non-u32 types — matches the official Radiacode app. Values are returned as
   * u32; callers mask the low byte / compare against 0 for u8/bool.
   */
  async readSfrBatch(ids: readonly number[]): Promise<number[]> {
    const rsp = await this.execute(
      COMMAND.RD_VIRT_SFR_BATCH,
      encodeVsfrBatchRead(ids),
    );
    return decodeVsfrBatchRead(rsp.data, ids.length);
  }

  async readSettings(): Promise<RadiacodeSettings> {
    const ids = [
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
    const [
      dr1,
      dr2,
      ds1,
      ds2,
      soundOn,
      soundVol,
      vibroOn,
      ledsOn,
      dsUnits,
      crUnits,
      useNSvH,
    ] = await this.readSfrBatch(ids);
    return {
      doseRateAlarm1uRh: dr1,
      doseRateAlarm2uRh: dr2,
      doseAlarm1uR: ds1,
      doseAlarm2uR: ds2,
      soundOn: soundOn !== 0,
      soundVolume: soundVol & 0xff,
      vibroOn: vibroOn !== 0,
      ledsOn: ledsOn !== 0,
      doseUnitsSv: dsUnits !== 0,
      countRateCpm: crUnits !== 0,
      doseRateNSvh: useNSvH !== 0,
    };
  }

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

  async readSpectrum(): Promise<SpectrumSnapshot> {
    const rsp = await this.execute(COMMAND.RD_VIRT_STRING, u32le(VS.SPECTRUM));
    return decodeSpectrumResponse(rsp.data);
  }

  /**
   * Fragt Geräte-Metadaten ab (FW-Version, HW-Serial, Modellname).
   * FW_SIGNATURE ist optional — liefert das Gerät keine Signatur, bleibt `model`
   * leer und die restlichen Felder werden trotzdem zurückgegeben.
   */
  async getDeviceInfo(): Promise<RadiacodeDeviceInfo> {
    const versionRsp = await this.execute(COMMAND.GET_VERSION, new Uint8Array(0));
    const version = decodeVersion(versionRsp.data);
    const serialRsp = await this.execute(COMMAND.GET_SERIAL, new Uint8Array(0));
    const hardwareSerial = decodeSerial(serialRsp.data);

    let model: string | undefined;
    try {
      const sigRsp = await this.execute(
        COMMAND.FW_SIGNATURE,
        new Uint8Array(0),
      );
      model = decodeFwSignature(sigRsp.data).idString;
    } catch {
      // FW_SIGNATURE optional — alte Firmwares kennen das Kommando nicht.
    }

    return {
      firmwareVersion: `${version.targetMajor}.${version.targetMinor}`,
      bootVersion: `${version.bootMajor}.${version.bootMinor}`,
      firmwareDate: version.targetDate || undefined,
      hardwareSerial,
      model,
    };
  }

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

  async disconnect(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopSpectrumPolling();
    this.disconnectUnsub?.();
    this.disconnectUnsub = null;
    this.sessionListeners.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.inFlight) {
      this.inFlight.reject(new Error('Client disconnected'));
      this.inFlight = null;
    }
    const pending = this.queue;
    this.queue = [];
    for (const q of pending) {
      q.reject(new Error('Client disconnected'));
    }
    try {
      await this.adapter.disconnect(this.deviceId);
    } catch {
      // already gone
    }
  }

  private handleNotification(chunk: Uint8Array): void {
    const complete = this.reassembler.push(chunk);
    if (!complete) return;
    const parsed = parseResponse(complete);
    const waiter = this.inFlight;
    if (waiter && waiter.cmd === parsed.cmd && waiter.seq === parsed.seq) {
      this.inFlight = null;
      waiter.resolve(parsed);
    }
  }

  private execute(cmd: number, args: Uint8Array): Promise<ParsedResponse> {
    return new Promise<ParsedResponse>((resolve, reject) => {
      this.queue.push({ cmd, args, resolve, reject });
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
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
    void (async () => {
      try {
        for (const c of chunks) {
          await this.adapter.write(this.deviceId, c);
        }
      } catch (e) {
        const waiter = this.inFlight;
        if (waiter && waiter.seq === seq) {
          this.inFlight = null;
          waiter.reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    })();
  }
}

function extractLatestMeasurement(
  rsp: ParsedResponse,
): RadiacodeMeasurement | null {
  // Body starts with <retcode:u32><flen:u32> followed by the record payload.
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
    cpsErrPct: rt.countRateErrPct,
    dosisleistungErrPct: rt.doseRateErrPct,
    ...(rareValid && {
      dose: rareValid.dose * DOSE_RAW_TO_USV,
      durationSec: rareValid.duration,
      temperatureC: rareValid.temperatureC,
      chargePct: rareValid.chargePct,
    }),
  };
}
