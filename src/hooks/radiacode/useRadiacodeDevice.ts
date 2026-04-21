import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { BleAdapter } from './bleAdapter';
import { RadiacodeClient } from './client';
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
  clientRef: RefObject<RadiacodeClient | null>;
}

export interface UseRadiacodeDeviceOptions {
  pollIntervalMs?: number;
  clientFactory?: (adapter: BleAdapter, deviceId: string) => RadiacodeClient;
}

export function useRadiacodeDevice(
  adapter: BleAdapter,
  options: UseRadiacodeDeviceOptions = {},
): UseRadiacodeDeviceResult {
  const { pollIntervalMs = 500, clientFactory } = options;
  const [status, setStatus] = useState<RadiacodeStatus>('idle');
  const [device, setDevice] = useState<RadiacodeDeviceRef | null>(null);
  const [measurement, setMeasurement] =
    useState<RadiacodeMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<{
    adapter: BleAdapter;
    device: RadiacodeDeviceRef | null;
    client: RadiacodeClient | null;
  }>({ adapter, device: null, client: null });
  const clientRef = useRef<RadiacodeClient | null>(null);

  useEffect(() => {
    stateRef.current.adapter = adapter;
  }, [adapter]);

  const scan = useCallback(async (): Promise<RadiacodeDeviceRef | null> => {
    setError(null);
    setStatus('scanning');
    try {
      const d = await adapter.requestDevice();
      setDevice(d);
      stateRef.current.device = d;
      setStatus('idle');
      return d;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    const client = stateRef.current.client;
    stateRef.current.client = null;
    clientRef.current = null;
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // best-effort
      }
    }
    setStatus('idle');
    setMeasurement(null);
  }, []);

  const connect = useCallback(
    async (maybeDevice?: RadiacodeDeviceRef) => {
      const target = maybeDevice ?? stateRef.current.device;
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
        stateRef.current.device = target;
        const client = clientFactory
          ? clientFactory(adapter, target.id)
          : new RadiacodeClient(adapter, target.id);
        await client.connect();
        client.startPolling(
          (m) =>
            setMeasurement((prev) => ({
              ...m,
              dose: m.dose ?? prev?.dose,
              temperatureC: m.temperatureC ?? prev?.temperatureC,
              chargePct: m.chargePct ?? prev?.chargePct,
            })),
          pollIntervalMs,
        );
        stateRef.current.client = client;
        clientRef.current = client;
        setStatus('connected');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    },
    [adapter, clientFactory, pollIntervalMs],
  );

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      const client = state.client;
      state.client = null;
      clientRef.current = null;
      if (client) {
        client.disconnect().catch(() => {
          // best-effort
        });
      }
    };
  }, []);

  return {
    status,
    device,
    measurement,
    error,
    scan,
    connect,
    disconnect,
    clientRef,
  };
}
