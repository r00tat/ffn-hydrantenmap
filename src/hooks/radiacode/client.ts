import { BleAdapter, Unsubscribe } from './bleAdapter';
import {
  COMMAND,
  MAX_WRITE_CHUNK,
  ParsedResponse,
  ResponseReassembler,
  SEQ_MODULO,
  VS,
  VSFR,
  buildRequest,
  decodeDataBufRecords,
  parseResponse,
  splitForWrite,
} from './protocol';
import { RadiacodeMeasurement } from './types';

const DOSE_RATE_TO_USVH = 10000;
const DOSE_SV_TO_USV = 1e6;

interface InFlight {
  cmd: number;
  seq: number;
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

/**
 * Orchestrates a single Radiacode BLE session: owns the sequence counter,
 * response reassembler, and a single-slot in-flight request queue. Request
 * ordering is strictly serial — the device pairs responses to requests by
 * sequence byte, but the reference implementation always waits for the prior
 * response before issuing the next request, and we mirror that.
 */
export class RadiacodeClient {
  private seqIndex = 0;
  private reassembler = new ResponseReassembler();
  private inFlight: InFlight | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

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

  async disconnect(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.inFlight) {
      this.inFlight.reject(new Error('Client disconnected'));
      this.inFlight = null;
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
    if (this.inFlight) {
      return Promise.reject(new Error('Request already in flight'));
    }
    const seq = this.seqIndex;
    this.seqIndex = (this.seqIndex + 1) % SEQ_MODULO;
    const frame = buildRequest(cmd, seq, args);
    const chunks = splitForWrite(frame, MAX_WRITE_CHUNK);

    return new Promise<ParsedResponse>((resolve, reject) => {
      this.inFlight = { cmd, seq, resolve, reject };
      void (async () => {
        try {
          for (const c of chunks) {
            await this.adapter.write(this.deviceId, c);
          }
        } catch (e) {
          if (this.inFlight && this.inFlight.seq === seq) {
            this.inFlight = null;
          }
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
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
    ...(rareValid && {
      dose: rareValid.dose * DOSE_SV_TO_USV,
      temperatureC: rareValid.temperatureC,
      chargePct: rareValid.chargePct,
    }),
  };
}
