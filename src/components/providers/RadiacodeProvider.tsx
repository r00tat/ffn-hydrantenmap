'use client';

import { Capacitor } from '@capacitor/core';
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
  NotificationState,
  RadiacodeNativeState,
  RadiacodeNotification,
} from '../../hooks/radiacode/radiacodeNotification';
import {
  RadiacodeDeviceInfo,
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
  RadiacodeSettings,
  RadiacodeSettingsReadResult,
} from '../../hooks/radiacode/types';
import {
  RadiacodeStatus,
  useRadiacodeDevice,
} from '../../hooks/radiacode/useRadiacodeDevice';
import { Spectrum } from '../firebase/firestore';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';

export interface SaveLiveSpectrumMeta {
  name: string;
  description?: string;
  sampleName?: string;
}

export interface RadiacodeContextValue {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  deviceInfo: RadiacodeDeviceInfo | null;
  measurement: RadiacodeMeasurement | null;
  /**
   * Timestamp (ms since epoch) der letzten eingetroffenen Messung. `null`
   * solange noch keine Messung empfangen wurde. Wird für den
   * „Letzte Messung vor Xs"-Indikator verwendet, um im Hintergrundbetrieb
   * sichtbar zu machen, ob Samples durchkommen.
   */
  lastSampleTimestamp: number | null;
  history: RadiacodeSample[];
  error: string | null;
  scan: () => Promise<RadiacodeDeviceRef | null>;
  connect: () => Promise<void>;
  connectDevice: (device: RadiacodeDeviceRef) => Promise<void>;
  disconnect: () => Promise<void>;
  spectrum: SpectrumSnapshot | null;
  /**
   * `true`, solange die Energiespektrum-Seite eine Live-Aufzeichnung angefordert
   * hat. Nur dann pollt der Provider aktiv das Spektrum vom Gerät. Ausserhalb
   * bleibt der Provider ruhig, damit Consumer nicht im Sekundentakt neu
   * gerendert werden.
   */
  liveRecording: boolean;
  startLiveRecording: () => void;
  stopLiveRecording: () => Promise<void>;
  resetLiveSpectrum: () => Promise<void>;
  saveLiveSpectrum: (meta: SaveLiveSpectrumMeta) => Promise<string | null>;
  readSettings: () => Promise<RadiacodeSettingsReadResult>;
  writeSettings: (patch: Partial<RadiacodeSettings>) => Promise<void>;
  playSignal: () => Promise<void>;
  doseReset: () => Promise<void>;
  /**
   * Fragt den nativen BLE-Status ab und spiegelt ihn in den React-State.
   * Wenn der native Service bereits verbunden ist und der Provider noch
   * 'idle' ist, wird die Verbindung adoptiert (Listener registriert,
   * Status auf 'connected' gesetzt). Kein neuer BLE-Verbindungsaufbau,
   * kein Handshake. Wird auch beim Mount und beim Wechsel der Sichtbarkeit
   * (App-Foreground) automatisch ausgeführt.
   */
  refreshConnectionState: () => Promise<void>;
}

export default RadiacodeProvider;

export const RadiacodeContext = createContext<RadiacodeContextValue | null>(null);

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
  getConnectedDevices: async () => [],
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
    adoptExistingConnection,
    clientRef,
  } = useRadiacodeDevice(adapter, { clientFactory });

  const addItem = useFirecallItemAdd();

  const [history, setHistory] = useState<RadiacodeSample[]>([]);
  const [overrideMeasurement, setOverrideMeasurement] =
    useState<RadiacodeMeasurement | null>(null);

  const latest = overrideMeasurement ?? hookMeasurement;
  const measurement = latest;
  const lastSampleTimestamp = latest?.timestamp ?? null;
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
  if (latest && latest.timestamp !== lastAppendedTs) {
    setLastAppendedTs(latest.timestamp);
    setHistory((prev) =>
      pushAndPrune(
        prev,
        {
          t: latest.timestamp,
          dosisleistung: latest.dosisleistung,
          cps: latest.cps,
        },
        latest.timestamp,
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

  // Live spectrum state: polled nur wenn der Consumer explizit per
  // startLiveRecording() angefordert hat. Baseline-Subtraktion hält das
  // angezeigte Spektrum relativ zum letzten Reset.
  const [spectrum, setSpectrum] = useState<SpectrumSnapshot | null>(null);
  const [liveRecording, setLiveRecording] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const sessionUnsubRef = useRef<Unsubscribe | null>(null);
  const pollingStartedRef = useRef(false);
  const spectrumRef = useRef<SpectrumSnapshot | null>(null);
  useEffect(() => {
    spectrumRef.current = spectrum;
  }, [spectrum]);

  // When rawStatus transitions to 'connected' AND liveRecording === true,
  // kick off spectrum polling. Polling stops when either
  // condition drops. Only once per client instance — useRadiacodeDevice
  // re-creates the client on reconnect so we use a ref flag keyed implicitly
  // on clientRef.current.
  const lastClientRef = useRef<RadiacodeClient | null>(null);
  useEffect(() => {
    if (rawStatus !== 'connected' || !liveRecording) {
      pollingStartedRef.current = false;
      lastClientRef.current = null;
      return;
    }
    const client = clientRef.current;
    if (!client) return;
    if (lastClientRef.current === client && pollingStartedRef.current) return;
    lastClientRef.current = client;
    pollingStartedRef.current = true;

    setSpectrum(null);

    client.startSpectrumPolling((s) => {
      setSpectrum(s);
    });

    return () => {
      client.stopSpectrumPolling();
      // Nach dem Stop: Flags so zurücksetzen, dass ein erneutes
      // startLiveRecording() das Polling sauber neu startet.
      pollingStartedRef.current = false;
      lastClientRef.current = null;
      setSpectrum(null);
    };
  }, [rawStatus, clientRef, liveRecording]);

  // Session-Events (`reconnecting` / `reconnected`) gelten für die BLE-Session,
  // nicht für das Spektrum-Polling. Deshalb in einem eigenen Effect, der nur
  // am Connection-Status hängt und unabhängig von liveRecording läuft.
  useEffect(() => {
    console.log(
      '[RadiacodeProvider] session-event effect rawStatus=',
      rawStatus,
    );
    if (rawStatus !== 'connected') {
      setReconnecting(false);
      return;
    }
    const client = clientRef.current;
    if (!client) return;
    const unsub = client.onSessionEvent((e) => {
      console.log('[RadiacodeProvider] sessionEvent', e);
      if (e === 'reconnecting') setReconnecting(true);
      else setReconnecting(false);
    });
    sessionUnsubRef.current = unsub;
    return () => {
      unsub();
      sessionUnsubRef.current = null;
    };
  }, [rawStatus, clientRef]);

  const saveLiveSpectrum = useCallback(
    async (meta: SaveLiveSpectrumMeta): Promise<string | null> => {
      const snap = spectrumRef.current;
      if (!snap) return null;
      const deviceName = `${device?.name ?? 'Radiacode'}${
        device?.serial ? ` ${device.serial}` : ''
      }`.trim();
      const now = new Date();
      const startMs = now.getTime() - snap.durationSec * 1000;
      const item: Spectrum = {
        type: 'spectrum',
        name: meta.name,
        sampleName: meta.sampleName ?? meta.name,
        deviceName,
        measurementTime: snap.durationSec,
        liveTime: snap.durationSec,
        startTime: new Date(startMs).toISOString(),
        endTime: now.toISOString(),
        coefficients: snap.coefficients as unknown as number[],
        counts: snap.counts,
        description: meta.description,
      };
      const ref = await addItem(item);
      return ref?.id ?? null;
    },
    [addItem, device],
  );

  const startLiveRecording = useCallback(() => setLiveRecording(true), []);
  const stoppingRef = useRef(false);
  const stopLiveRecording = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      if (spectrumRef.current) {
        await saveLiveSpectrum({
          name: `Live-Messung ${new Date().toLocaleString('de-AT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        });
      }
    } finally {
      setLiveRecording(false);
      stoppingRef.current = false;
    }
  }, [saveLiveSpectrum]);

  const resetLiveSpectrum = useCallback(async () => {
    const client = clientRef.current;
    if (client) {
      try {
        await client.specReset();
      } catch {
        // ignore
      }
    }
    setSpectrum(null);
    setHistory([]);
  }, [clientRef]);

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

  // Refs auf den aktuellen Status / Device, damit syncFromNative stabil bleibt
  // und Listener (visibilitychange, mount) die aktuellen Werte sehen, ohne dass
  // der Effekt bei jeder Status-Änderung neu registriert.
  const rawStatusRef = useRef(rawStatus);
  rawStatusRef.current = rawStatus;
  const deviceRef = useRef(device);
  deviceRef.current = device;

  /**
   * Spiegelt den nativen BLE-Verbindungsstatus in den React-State.
   * Wenn der Foreground-Service als verbunden meldet und der React-Status
   * 'idle'/'unavailable'/'error' ist, wird die Verbindung adoptiert
   * (Listener-Registrierung, Status-Setzen) — ohne neuen Verbindungsaufbau.
   * Sicher idempotent: wenn bereits adoptiert oder gerade beim Connect,
   * tut die Funktion nichts.
   */
  const syncFromNative = useCallback(async (): Promise<void> => {
    // Capacitor's registerPlugin returns a Proxy where every method exists
    // as a function but throws "not implemented on web" when invoked. So we
    // can't typeof-guard the call — use the platform check instead.
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    let state: RadiacodeNativeState;
    try {
      state = await RadiacodeNotification.getState();
    } catch (err) {
      console.warn(
        '[RadiacodeProvider] syncFromNative — getState failed',
        err,
      );
      return;
    }
    if (!state.connected || !state.deviceAddress) {
      // Kein nativer Connect — UI-Status nicht regeln, das macht der Hook
      // über onConnectionStateChange.
      return;
    }
    if (
      rawStatusRef.current === 'connected' ||
      rawStatusRef.current === 'connecting'
    ) {
      return;
    }
    const target: RadiacodeDeviceRef = {
      id: state.deviceAddress,
      name: deviceRef.current?.name ?? 'Radiacode',
      serial: deviceRef.current?.serial ?? state.deviceAddress,
    };
    console.log('[RadiacodeProvider] syncFromNative — adopting', target.id);
    try {
      await adoptExistingConnection(target);
    } catch (err) {
      console.warn(
        '[RadiacodeProvider] adoptExistingConnection failed',
        err,
      );
    }
  }, [adoptExistingConnection]);

  // Beim Mount des Providers den nativen Status spiegeln, dann auf den
  // visibilitychange-Listener verzweigen (App kommt aus dem Hintergrund).
  // Cleanup: aktive Session-Subscription am Ende beenden.
  useEffect(() => {
    void syncFromNative();
    return () => {
      sessionUnsubRef.current?.();
      sessionUnsubRef.current = null;
    };
  }, [syncFromNative]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncFromNative();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncFromNative]);

  // Wenn der native Service eine Verbindung als 'connected' meldet, ohne dass
  // wir gerade aktiv aus connect()/connectRaw() warten (z.B. weil das
  // Auto-Connect-Promise schon mit unavailable rejected war und der Service
  // den Link erst danach aufgebaut hat), spiegelt syncFromNative den Status
  // automatisch in den React-State. Ohne diesen Pfad bleibt die UI auf
  // 'unavailable' hängen, obwohl die GATT-Session steht — der User müsste
  // dann manuell Refresh klicken.
  useEffect(() => {
    const register = adapter.onConnectionStateChange;
    if (!register) return;
    const unsub = register((s) => {
      if (s === 'connected' && rawStatusRef.current !== 'connected') {
        void syncFromNative();
      }
    });
    return unsub;
  }, [adapter, syncFromNative]);

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
  //
  // Bereits bestehende Verbindungen werden NICHT hier adoptiert — das macht
  // syncFromNative() im Mount/visibilitychange-Effekt. Hier wird nur ein
  // echter Connect zum gespeicherten Default-Device angestoßen, falls
  // weder Native noch der Hook bereits verbunden sind.
  useEffect(() => {
    let cancelled = false;
    const isAlreadyAdopted = (): boolean => {
      const s: RadiacodeStatus = rawStatusRef.current;
      return s === 'connected' || s === 'connecting';
    };
    (async () => {
      // syncFromNative hatte ggf. bereits adoptiert — dann nichts tun.
      if (isAlreadyAdopted()) return;
      // Falls Native bereits verbunden ist, übernimmt das syncFromNative.
      const connected = await adapter.getConnectedDevices();
      if (connected.length > 0) {
        console.log(
          '[RadiacodeProvider] adapter reports existing connection — leaving adoption to syncFromNative',
        );
        return;
      }
      if (cancelled) return;

      const saved = await loadDefaultDevice().catch(() => null);
      if (!saved || cancelled) return;

      // Doppel-Connect-Versuche vermeiden, falls der Status während des
      // await schon nach 'connecting' gesprungen ist.
      if (isAlreadyAdopted()) return;

      console.log(
        '[RadiacodeProvider] Auto-connecting to saved device:',
        saved.id,
      );
      await connectRaw(saved).catch(() => null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  useEffect(() => {
    const register = adapter.onDisconnectRequested;
    if (!register) return;
    const unsub = register(() => {
      console.warn(
        '[RadiacodeProvider] disconnectRequested received from native',
      );
      disconnect().catch((err) => {
        console.warn('[RadiacodeProvider] disconnect after request failed', err);
      });
    });
    return () => unsub();
  }, [adapter, disconnect]);

  const value = useMemo<RadiacodeContextValue>(
    () => ({
      status,
      device,
      deviceInfo,
      measurement,
      lastSampleTimestamp,
      history,
      error,
      scan: scanAndSave,
      connect,
      connectDevice,
      disconnect,
      spectrum,
      liveRecording,
      startLiveRecording,
      stopLiveRecording,
      resetLiveSpectrum,
      saveLiveSpectrum,
      readSettings,
      writeSettings,
      playSignal,
      doseReset,
      refreshConnectionState: syncFromNative,
    }),
    [
      status,
      device,
      deviceInfo,
      measurement,
      lastSampleTimestamp,
      history,
      error,
      scanAndSave,
      connect,
      connectDevice,
      disconnect,
      spectrum,
      liveRecording,
      startLiveRecording,
      stopLiveRecording,
      resetLiveSpectrum,
      saveLiveSpectrum,
      readSettings,
      writeSettings,
      playSignal,
      doseReset,
      syncFromNative,
    ],
  );

  return (
    <RadiacodeContext.Provider value={value}>
      {children}
    </RadiacodeContext.Provider>
  );
}
