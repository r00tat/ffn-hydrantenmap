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
import {
  BleAdapter,
  Unsubscribe,
  getBleAdapter,
} from '../../hooks/radiacode/bleAdapter';
import { RadiacodeClient } from '../../hooks/radiacode/client';
import {
  loadDefaultDevice,
  saveDefaultDevice,
} from '../../hooks/radiacode/devicePreference';
import { pushAndPrune, RadiacodeSample } from '../../hooks/radiacode/history';
import { SpectrumSnapshot } from '../../hooks/radiacode/protocol';
import {
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
} from '../../hooks/radiacode/types';
import {
  RadiacodeStatus,
  useRadiacodeDevice,
} from '../../hooks/radiacode/useRadiacodeDevice';

export interface RadiacodeSpectrumSessionState {
  active: boolean;
  startedAt: number | null;
  snapshotCount: number;
}

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
  spectrum: SpectrumSnapshot | null;
  spectrumSession: RadiacodeSpectrumSessionState;
  startSpectrumRecording: () => Promise<void>;
  stopSpectrumRecording: () => Promise<SpectrumSnapshot | null>;
  cancelSpectrumRecording: () => Promise<void>;
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
  /** Testing hook: factory used by the internal hook to construct the RadiacodeClient. */
  clientFactory?: (adapter: BleAdapter, deviceId: string) => RadiacodeClient;
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
  clientFactory,
}: ProviderProps) {
  const [adapter, setAdapter] = useState<BleAdapter>(
    providedAdapter ?? NULL_ADAPTER,
  );
  useEffect(() => {
    if (providedAdapter) return;
    getBleAdapter().then(setAdapter);
  }, [providedAdapter]);

  const {
    status: rawStatus,
    device,
    measurement: hookMeasurement,
    error,
    scan,
    connect: connectRaw,
    disconnect,
    clientRef,
  } = useRadiacodeDevice(adapter, { clientFactory });

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

  // Spectrum recording session state
  const [spectrum, setSpectrum] = useState<SpectrumSnapshot | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const sessionUnsubRef = useRef<Unsubscribe | null>(null);
  const spectrumRef = useRef<SpectrumSnapshot | null>(null);
  useEffect(() => {
    spectrumRef.current = spectrum;
  }, [spectrum]);

  const stopSession = useCallback(() => {
    clientRef.current?.stopSpectrumPolling();
    sessionUnsubRef.current?.();
    sessionUnsubRef.current = null;
  }, [clientRef]);

  const startSpectrumRecording = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('Kein Radiacode verbunden');
    // If a prior session is still active, stop it cleanly first.
    if (sessionUnsubRef.current) {
      stopSession();
    }
    await client.specReset();
    setSpectrum(null);
    setSnapshotCount(0);
    setSessionStartedAt(Date.now());
    setSessionActive(true);
    setReconnecting(false);
    const unsubEvt = client.onSessionEvent((e) => {
      if (e === 'reconnecting') setReconnecting(true);
      else setReconnecting(false);
    });
    sessionUnsubRef.current = unsubEvt;
    client.startSpectrumPolling((s) => {
      setSpectrum(s);
      setSnapshotCount((c) => c + 1);
    });
  }, [clientRef, stopSession]);

  const stopSpectrumRecording =
    useCallback(async (): Promise<SpectrumSnapshot | null> => {
      stopSession();
      setSessionActive(false);
      setReconnecting(false);
      return spectrumRef.current;
    }, [stopSession]);

  const cancelSpectrumRecording = useCallback(async () => {
    stopSession();
    setSessionActive(false);
    setReconnecting(false);
    setSpectrum(null);
    setSessionStartedAt(null);
    setSnapshotCount(0);
  }, [stopSession]);

  // Clean up any active session subscription on unmount.
  useEffect(() => {
    return () => {
      sessionUnsubRef.current?.();
      sessionUnsubRef.current = null;
    };
  }, []);

  // Mask status while reconnecting — UI should show the "connecting…" state
  // during an auto-reconnect attempt rather than flipping to idle/error.
  const status: RadiacodeStatus = reconnecting ? 'connecting' : rawStatus;

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

  const spectrumSession = useMemo<RadiacodeSpectrumSessionState>(
    () => ({
      active: sessionActive,
      startedAt: sessionStartedAt,
      snapshotCount,
    }),
    [sessionActive, sessionStartedAt, snapshotCount],
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
      spectrum,
      spectrumSession,
      startSpectrumRecording,
      stopSpectrumRecording,
      cancelSpectrumRecording,
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
      spectrum,
      spectrumSession,
      startSpectrumRecording,
      stopSpectrumRecording,
      cancelSpectrumRecording,
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
