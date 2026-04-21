'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BleAdapter, getBleAdapter } from '../../hooks/radiacode/bleAdapter';
import {
  loadDefaultDevice,
  saveDefaultDevice,
} from '../../hooks/radiacode/devicePreference';
import { pushAndPrune, RadiacodeSample } from '../../hooks/radiacode/history';
import {
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
} from '../../hooks/radiacode/types';
import {
  RadiacodeStatus,
  useRadiacodeDevice,
} from '../../hooks/radiacode/useRadiacodeDevice';

export interface RadiacodeContextValue {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  history: RadiacodeSample[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const RadiacodeContext = createContext<RadiacodeContextValue | null>(null);

export function useRadiacode(): RadiacodeContextValue {
  const ctx = useContext(RadiacodeContext);
  if (!ctx) {
    throw new Error('useRadiacode must be used within a RadiacodeProvider');
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  adapter?: BleAdapter;
  /** Testing hook: receives a callback that pushes a measurement into the buffer. */
  feedMeasurement?: (push: (m: RadiacodeMeasurement) => void) => void;
}

const NULL_ADAPTER: BleAdapter = {
  isSupported: () => false,
  requestDevice: async () => {
    throw new Error('BLE adapter not initialized');
  },
  connect: async () => {
    throw new Error('BLE adapter not initialized');
  },
  disconnect: async () => {},
  onNotification: async () => () => {},
  write: async () => {},
};

export function RadiacodeProvider({
  children,
  adapter: providedAdapter,
  feedMeasurement,
}: ProviderProps) {
  const [adapter, setAdapter] = useState<BleAdapter>(
    providedAdapter ?? NULL_ADAPTER,
  );
  useEffect(() => {
    if (providedAdapter) return;
    getBleAdapter().then(setAdapter);
  }, [providedAdapter]);

  const {
    status,
    device,
    measurement,
    error,
    scan,
    connect: connectRaw,
    disconnect,
  } = useRadiacodeDevice(adapter);

  const [history, setHistory] = useState<RadiacodeSample[]>([]);

  // Append live measurements using React's "adjusting state while rendering"
  // pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // We track the last appended timestamp in state and trigger a setState during
  // render if the measurement changed — React will discard this render and
  // re-run with the updated state, avoiding the cascading-effect anti-pattern.
  const [lastAppendedTs, setLastAppendedTs] = useState<number | null>(null);
  if (measurement && measurement.timestamp !== lastAppendedTs) {
    setLastAppendedTs(measurement.timestamp);
    setHistory((prev) =>
      pushAndPrune(
        prev,
        {
          t: measurement.timestamp,
          dosisleistung: measurement.dosisleistung,
          cps: measurement.cps,
        },
        measurement.timestamp,
      ),
    );
  }

  // Testing feeder
  const feederRef = useRef(feedMeasurement);
  useEffect(() => {
    feederRef.current?.((m) => {
      setHistory((prev) =>
        pushAndPrune(
          prev,
          { t: m.timestamp, dosisleistung: m.dosisleistung, cps: m.cps },
          m.timestamp,
        ),
      );
    });
  }, []);

  // scan + connect combined
  const connect = useCallback(async () => {
    const scanned = await scan();
    if (!scanned) return;
    await saveDefaultDevice(scanned);
    await connectRaw(scanned);
  }, [scan, connectRaw]);

  // Load default device on mount (non-autoconnect, user must press Connect)
  useEffect(() => {
    loadDefaultDevice().catch(() => null);
  }, []);

  const value = useMemo<RadiacodeContextValue>(
    () => ({
      status,
      device,
      measurement,
      history,
      error,
      connect,
      disconnect,
    }),
    [status, device, measurement, history, error, connect, disconnect],
  );

  return (
    <RadiacodeContext.Provider value={value}>
      {children}
    </RadiacodeContext.Provider>
  );
}
