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
import type { NotificationState } from '../../hooks/radiacode/radiacodeNotification';
import {
  RadiacodeDeviceInfo,
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
  RadiacodeSettings,
} from '../../hooks/radiacode/types';
import {
  RadiacodeStatus,
  useRadiacodeDevice,
} from '../../hooks/radiacode/useRadiacodeDevice';

function titleForNotification(state: NotificationState): string {
  switch (state) {
    case 'connected':
      return 'Radiacode verbunden';
    case 'recording':
      return 'Strahlenmessung läuft';
    case 'reconnecting':
      return 'Radiacode – Verbindung verloren';
  }
}

function formatBodyForNotification(
  m: { dosisleistung: number; cps: number } | null,
  state: NotificationState,
): string {
  if (!m) return state === 'reconnecting' ? 'Letzter Wert unbekannt' : '…';
  const body = `${m.dosisleistung.toFixed(2)} µSv/h · ${Math.round(m.cps)} CPS`;
  return state === 'reconnecting' ? `${body} (letzter Wert)` : body;
}

export interface RadiacodeSpectrumSessionState {
  active: boolean;
  startedAt: number | null;
  snapshotCount: number;
}

export interface RadiacodeContextValue {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  deviceInfo: RadiacodeDeviceInfo | null;
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
  readSettings: () => Promise<RadiacodeSettings>;
  writeSettings: (patch: Partial<RadiacodeSettings>) => Promise<void>;
  playSignal: () => Promise<void>;
  doseReset: () => Promise<void>;
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
  const [deviceInfo, setDeviceInfo] = useState<RadiacodeDeviceInfo | null>(null);

  // Fetch device info once we're connected and the client is ready. Clears on
  // disconnect so the UI doesn't show stale info for a different device.
  useEffect(() => {
    if (rawStatus !== 'connected') {
      if (rawStatus === 'idle' || rawStatus === 'unavailable') {
        setDeviceInfo(null);
      }
      return;
    }
    const client = clientRef.current;
    if (!client) return;
    let cancelled = false;
    client
      .getDeviceInfo()
      .then((info) => {
        if (!cancelled) setDeviceInfo(info);
      })
      .catch(() => {
        // best-effort — älteren Firmwares kann der Abruf fehlschlagen.
      });
    return () => {
      cancelled = true;
    };
  }, [rawStatus, clientRef]);

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
  const baselineRef = useRef<SpectrumSnapshot | null>(null);
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
    // SPEC_RESET greift am echten Gerät nicht zuverlässig — das
    // aktuelle Spektrum läuft weiter seit dem letzten Hard-Reset und
    // zeigt sofort mehrere Stunden Dauer. Wir lesen daher direkt nach
    // dem Reset-Versuch einen Baseline-Snapshot und ziehen ihn von
    // jedem Session-Snapshot ab. Greift SPEC_RESET doch, ist die
    // Baseline ≈ 0 und die Subtraktion ein No-op.
    baselineRef.current = await client.readSpectrum();
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
      const baseline = baselineRef.current;
      const sessionSnap: SpectrumSnapshot = baseline
        ? {
            ...s,
            durationSec: Math.max(0, s.durationSec - baseline.durationSec),
            counts: s.counts.map((c, i) =>
              Math.max(0, c - (baseline.counts[i] ?? 0)),
            ),
          }
        : s;
      setSpectrum(sessionSnap);
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
    baselineRef.current = null;
  }, [stopSession]);

  const readSettings = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('Kein Radiacode verbunden');
    return client.readSettings();
  }, [clientRef]);

  const writeSettings = useCallback(
    async (patch: Partial<RadiacodeSettings>) => {
      const client = clientRef.current;
      if (!client) throw new Error('Kein Radiacode verbunden');
      await client.writeSettings(patch);
    },
    [clientRef],
  );

  const playSignal = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('Kein Radiacode verbunden');
    await client.playSignal();
  }, [clientRef]);

  const doseReset = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('Kein Radiacode verbunden');
    await client.doseReset();
  }, [clientRef]);

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

  // Load default device on mount and auto-connect if present. Runs whenever
  // the adapter changes (notably: NULL_ADAPTER → real adapter from
  // getBleAdapter()) so the auto-connect happens once the real BLE stack is
  // available. Failures surface via status='unavailable' from the hook.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadDefaultDevice().catch(() => null);
      if (!saved || cancelled) return;
      await connectRaw(saved).catch(() => null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  // Persistent notification driven by the foreground service. One source of
  // truth for the lifecycle: derived purely from status / reconnect / recording.
  const notificationState: NotificationState | null = useMemo(() => {
    if (status === 'connected') {
      return sessionActive ? 'recording' : 'connected';
    }
    if (status === 'connecting' && reconnecting) return 'reconnecting';
    return null;
  }, [status, sessionActive, reconnecting]);

  const notificationStateRef = useRef<NotificationState | null>(null);
  useEffect(() => {
    notificationStateRef.current = notificationState;
  }, [notificationState]);

  const serviceActive = notificationState !== null;
  useEffect(() => {
    if (!serviceActive) return;
    const start = adapter.startForegroundService;
    const stop = adapter.stopForegroundService;
    if (!start) return;
    const current = notificationStateRef.current ?? 'connected';
    start({
      title: titleForNotification(current),
      body: formatBodyForNotification(measurement, current),
    }).catch(() => {
      // Service-Start darf BLE nicht blockieren.
    });
    return () => {
      stop?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceActive, adapter]);

  useEffect(() => {
    if (!notificationState || !measurement) return;
    const update = adapter.updateForegroundService;
    if (!update) return;
    update({
      dosisleistung: measurement.dosisleistung,
      cps: measurement.cps,
      state: notificationState,
    }).catch(() => {});
  }, [measurement, notificationState, adapter]);

  useEffect(() => {
    const register = adapter.onDisconnectRequested;
    if (!register) return;
    const unsub = register(() => {
      disconnect().catch(() => {});
    });
    return () => unsub();
  }, [adapter, disconnect]);

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
      deviceInfo,
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
      readSettings,
      writeSettings,
      playSignal,
      doseReset,
    }),
    [
      status,
      device,
      deviceInfo,
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
      readSettings,
      writeSettings,
      playSignal,
      doseReset,
    ],
  );

  return (
    <RadiacodeContext.Provider value={value}>
      {children}
    </RadiacodeContext.Provider>
  );
}
