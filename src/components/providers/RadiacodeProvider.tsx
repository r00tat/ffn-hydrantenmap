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
  scan: () => Promise<RadiacodeDeviceRef | null>;
  connect: () => Promise<void>;
  connectDevice: (device: RadiacodeDeviceRef) => Promise<void>;
  disconnect: () => Promise<void>;
  startForegroundService?: (opts: {
    title: string;
    body: string;
  }) => Promise<void>;
  stopForegroundService?: () => Promise<void>;
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
    measurement: hookMeasurement,
    error,
    scan,
    connect: connectRaw,
    disconnect,
  } = useRadiacodeDevice(adapter);

  const [history, setHistory] = useState<RadiacodeSample[]>([]);
  const [overrideMeasurement, setOverrideMeasurement] =
    useState<RadiacodeMeasurement | null>(null);
  const measurement = overrideMeasurement ?? hookMeasurement;

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

  // Testing feeder: sets override measurement (which also triggers history push
  // via the adjust-state-while-rendering block above).
  const feederRef = useRef(feedMeasurement);
  useEffect(() => {
    feederRef.current?.((m) => {
      setOverrideMeasurement(m);
    });
  }, []);

  // scan + save default device
  const scanAndSave = useCallback(async () => {
    const scanned = await scan();
    if (scanned) {
      await saveDefaultDevice(scanned);
    }
    return scanned;
  }, [scan]);

  // scan + connect combined (convenience for Dosimetrie page)
  const connect = useCallback(async () => {
    const scanned = await scanAndSave();
    if (!scanned) return;
    await connectRaw(scanned);
  }, [scanAndSave, connectRaw]);

  const connectDevice = useCallback(
    async (d: RadiacodeDeviceRef) => {
      await connectRaw(d);
    },
    [connectRaw],
  );

  // Load default device on mount (non-autoconnect, user must press Connect)
  useEffect(() => {
    loadDefaultDevice().catch(() => null);
  }, []);

  const startForegroundService = useMemo(
    () =>
      adapter.startForegroundService
        ? (opts: { title: string; body: string }) =>
            adapter.startForegroundService!(opts)
        : undefined,
    [adapter],
  );
  const stopForegroundService = useMemo(
    () =>
      adapter.stopForegroundService
        ? () => adapter.stopForegroundService!()
        : undefined,
    [adapter],
  );

  const value = useMemo<RadiacodeContextValue>(
    () => ({
      status,
      device,
      measurement,
      history,
      error,
      scan: scanAndSave,
      connect,
      connectDevice,
      disconnect,
      startForegroundService,
      stopForegroundService,
    }),
    [
      status,
      device,
      measurement,
      history,
      error,
      scanAndSave,
      connect,
      connectDevice,
      disconnect,
      startForegroundService,
      stopForegroundService,
    ],
  );

  return (
    <RadiacodeContext.Provider value={value}>
      {children}
    </RadiacodeContext.Provider>
  );
}
