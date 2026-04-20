import { useCallback, useEffect, useRef, useState } from 'react';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { parseRealtimeRateEvent } from './radiacodeProtocol';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from './types';

export type RadiacodeStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

export interface UseRadiacodeDeviceResult {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  error: string | null;
  scan: () => Promise<RadiacodeDeviceRef | null>;
  connect: (device?: RadiacodeDeviceRef) => Promise<void>;
  disconnect: () => Promise<void>;
}

export type PacketParser = (bytes: Uint8Array) => RadiacodeMeasurement | null;

function defaultParsePacket(bytes: Uint8Array): RadiacodeMeasurement | null {
  const evt = parseRealtimeRateEvent(bytes);
  if (!evt) return null;
  return { dosisleistung: evt.dosisleistung, cps: evt.cps, timestamp: Date.now() };
}

export function useRadiacodeDevice(
  adapter: BleAdapter,
  parsePacket: PacketParser = defaultParsePacket,
): UseRadiacodeDeviceResult {
  const [status, setStatus] = useState<RadiacodeStatus>('idle');
  const [device, setDevice] = useState<RadiacodeDeviceRef | null>(null);
  const [measurement, setMeasurement] = useState<RadiacodeMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanupRef = useRef<{
    adapter: BleAdapter;
    unsub: Unsubscribe | null;
    device: RadiacodeDeviceRef | null;
  }>({ adapter, unsub: null, device: null });
  cleanupRef.current.adapter = adapter;
  cleanupRef.current.device = device;

  const scan = useCallback(async (): Promise<RadiacodeDeviceRef | null> => {
    setError(null);
    setStatus('scanning');
    try {
      const d = await adapter.requestDevice();
      setDevice(d);
      setStatus('idle');
      return d;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    const current = cleanupRef.current;
    current.unsub?.();
    current.unsub = null;
    if (current.device) {
      try {
        await adapter.disconnect(current.device.id);
      } catch {
        // already disconnected
      }
    }
    setStatus('idle');
    setMeasurement(null);
  }, [adapter]);

  const connect = useCallback(
    async (maybeDevice?: RadiacodeDeviceRef) => {
      const target = maybeDevice ?? cleanupRef.current.device;
      if (!target) {
        setError('Kein Gerät ausgewählt');
        setStatus('error');
        return;
      }
      setError(null);
      setStatus('connecting');
      try {
        await adapter.connect(target.id);
        setDevice(target);
        cleanupRef.current.device = target;
        const unsub = await adapter.onNotification(target.id, (packet) => {
          const m = parsePacket(packet);
          if (m) setMeasurement(m);
        });
        cleanupRef.current.unsub = unsub;
        setStatus('connected');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    },
    [adapter, parsePacket],
  );

  useEffect(() => {
    const state = cleanupRef.current;
    return () => {
      state.unsub?.();
      if (state.device) {
        state.adapter.disconnect(state.device.id).catch(() => {
          // best-effort
        });
      }
    };
  }, []);

  return { status, device, measurement, error, scan, connect, disconnect };
}
