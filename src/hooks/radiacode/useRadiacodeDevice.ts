import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { BleAdapter } from './bleAdapter';
import { RadiacodeClient } from './client';
import { RadiacodeDeviceRef, RadiacodeMeasurement } from './types';

export type RadiacodeStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'
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
    const unsub = adapter.onConnectionStateChange?.((s) => {
      console.log('[useRadiacodeDevice] adapter state change:', s);
      // Wenn der native Teil von sich aus den Status ändert (z.B. Reconnect
      // erfolgreich oder Link final verloren), ziehen wir das in den Hook-State
      // nach. 'connected' wird hier nicht forciert, das macht connect() aktiv.
      if (s === 'reconnecting') setStatus('reconnecting');
      if (s === 'disconnected' && stateRef.current.client) {
        // Wenn wir eigentlich ein Client-Objekt haben, aber der Adapter 'disconnected'
        // meldet, ist der Link weg.
        setStatus('unavailable');
      }
    });
    return unsub;
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

  const connectingRef = useRef<string | null>(null);
  const connect = useCallback(
    async (maybeDevice?: RadiacodeDeviceRef) => {
      const target = maybeDevice ?? stateRef.current.device;
      if (!target) {
        setError('Kein Gerät ausgewählt');
        setStatus('error');
        return;
      }
      if (connectingRef.current === target.id) return;
      connectingRef.current = target.id;

      setError(null);
      setStatus('connecting');
      try {
        // start connection
        await adapter.connect(target.id);

        const client = clientFactory
          ? clientFactory(adapter, target.id)
          : new RadiacodeClient(adapter, target.id);

        // Bei nativem Adapter warten wir bis zu 10s auf das 'connected' Event,
        // bevor wir den Status auf 'connected' setzen. Sonst zeigt die UI
        // sofort "Verbunden", obwohl die GATT-Session noch gar nicht steht.
        if (adapter.onConnectionStateChange) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              unsub();
              reject(new Error('Verbindungs-Timeout (Gerät eingeschaltet?)'));
            }, 10000);
            const unsub = adapter.onConnectionStateChange!((s) => {
              if (s === 'connected') {
                clearTimeout(timeout);
                unsub();
                resolve();
              } else if (s === 'disconnected') {
                // Initialer connect schlug fehl (z.B. Device off)
                clearTimeout(timeout);
                unsub();
                reject(new Error('Gerät nicht erreichbar'));
              }
            });
          });
        }

        setDevice(target);
        stateRef.current.device = target;

        await client.connect();
        client.startPolling(
          (m) =>
            // Rare-Record-Felder (dose, durationSec, temperatureC, chargePct)
            // liefert das Gerät nur alle paar Sekunden. extractLatestMeasurement
            // lässt diese Keys komplett weg, wenn kein Rare-Record im aktuellen
            // Polling-Fenster lag — der Spread erhält dann die Werte aus dem
            // letzten Rare-Record.
            setMeasurement((prev) => ({ ...prev, ...m })),
          pollIntervalMs,
        );
        stateRef.current.client = client;
        clientRef.current = client;
        setStatus('connected');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('unavailable');
      } finally {
        connectingRef.current = null;
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
