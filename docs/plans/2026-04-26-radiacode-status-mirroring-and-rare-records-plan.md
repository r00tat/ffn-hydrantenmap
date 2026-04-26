# Radiacode Status-Mirroring & Rare-Records — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** UI synchron zum nativen BLE-Status, plus Diagnose-Logs und ein hypothesengeleiteter Fix für den dauerhaft fehlenden Rare-Records-Datenstrom nach Late-Connect.

**Architecture:** Zwei Blöcke. Block A erweitert TS-Provider und Hook um eine reine Status-Adoption (kein neuer BLE-Connect), plus einen Refresh-Button im UI. Block B ergänzt im nativen Foreground-Service Diagnose-Logs, einen Initial-Delay vor dem ersten Poll-Tick und einen In-Memory-Cache für Rare-Felder, der vom Plugin als Fallback bei leeren Ticks verwendet wird.

**Tech Stack:** TypeScript / React 19 / Next.js 16 / Vitest / Capacitor 7 / Kotlin (Android Foreground Service) / Java (Capacitor Plugin).

**Lean-Modus:** Pro Block einmal Implementation + Tests am Stück, dann **am Ende des Blocks** `npx tsc --noEmit`, `npx eslint`, `npx vitest run` (und für Block B nichts TS-mäßig — Kotlin/Java-Code wird nur kompiliert, wenn Capacitor build läuft, das machen wir am Ende einmal über `npx next build --webpack`). Ein Commit pro Block.

**Design-Doc:** [docs/plans/2026-04-26-radiacode-status-mirroring-and-rare-records-design.md](2026-04-26-radiacode-status-mirroring-and-rare-records-design.md)

---

## Block A — Status-Mirroring & Refresh-Button (TypeScript)

**Ziel:** Beim Mount, beim Foreground-Wechsel und bei Refresh-Klick wird der native Verbindungsstatus in den React-State gespiegelt — ohne neue BLE-Verbindung. UI-Status und Datenfluss sind danach für den Late-Connect-Fall korrekt.

### Files

- Modify: `src/hooks/radiacode/useRadiacodeDevice.ts` — neue Methode `adoptExistingConnection(device)` und Export im Result-Interface.
- Modify: `src/components/providers/RadiacodeProvider.tsx` — neue Methode `syncFromNative()`, Mount-Effekt nutzt sie, neuer `visibilitychange`-Listener, Context-Wert um `refreshConnectionState` erweitern.
- Modify: `src/components/pages/RadiacodeConnectionControls.tsx` — Refresh-IconButton neben Connect/Disconnect.
- Modify: `src/components/providers/RadiacodeProvider.tsx` (Interface `RadiacodeContextValue`) — neuer Eintrag `refreshConnectionState: () => Promise<void>`.
- Test: `src/components/providers/RadiacodeProvider.test.tsx` — falls existiert, sonst neu anlegen mit Sync-Test.
- Test: `src/components/pages/RadiacodeConnectionControls.test.tsx` — Refresh-Button-Test.

### Step A.1 — `adoptExistingConnection` im Hook

In [src/hooks/radiacode/useRadiacodeDevice.ts](../../src/hooks/radiacode/useRadiacodeDevice.ts) eine neue Methode neben `connect` ergänzen, die **nur** den Client erstellt, das Polling abonniert und den Status setzt — kein `adapter.connect()`, kein `client.connect()`.

```ts
const adoptExistingConnection = useCallback(
  async (target: RadiacodeDeviceRef): Promise<void> => {
    if (stateRef.current.client) {
      // Already adopted — nothing to do.
      return;
    }
    setError(null);
    const client = clientFactory
      ? clientFactory(adapter, target.id)
      : new RadiacodeClient(adapter, target.id);

    // Auf nativem Pfad ist client.connect() ein No-Op-äquivalentes Setup
    // (registriert nur Notification-Listener, kein Handshake — siehe
    // client.ts). Auf Web ist Adoption ohnehin nicht möglich, weil eine
    // bestehende GATT-Session zwischen Page-Loads nicht überlebt.
    await client.connect();
    client.startPolling((m) => {
      setMeasurement((prev) => {
        if (!prev) return m;
        const next = { ...prev };
        for (const [key, val] of Object.entries(m)) {
          if (val != null) {
            (next as any)[key] = val;
          }
        }
        return next;
      });
    }, pollIntervalMs);

    setDevice(target);
    stateRef.current.device = target;
    stateRef.current.client = client;
    clientRef.current = client;
    setStatus('connected');
  },
  [adapter, clientFactory, pollIntervalMs],
);
```

Im `UseRadiacodeDeviceResult`-Interface ergänzen:

```ts
adoptExistingConnection: (device: RadiacodeDeviceRef) => Promise<void>;
```

Und im `return`-Block am Ende:

```ts
return {
  status,
  device,
  measurement,
  error,
  scan,
  connect,
  disconnect,
  adoptExistingConnection,
  clientRef,
};
```

### Step A.2 — `syncFromNative` im Provider

In [src/components/providers/RadiacodeProvider.tsx](../../src/components/providers/RadiacodeProvider.tsx):

1. Den bisherigen Mount-`useEffect` (Zeilen 376-402) ersetzen: statt nur loggen, ruft er `syncFromNative()` auf.
2. Neue `syncFromNative`-useCallback definieren:

```ts
const syncFromNative = useCallback(async (): Promise<void> => {
  if (typeof RadiacodeNotification.getState !== 'function') {
    return;
  }
  let state: RadiacodeNativeState;
  try {
    state = await RadiacodeNotification.getState();
  } catch (err) {
    console.warn('[RadiacodeProvider] syncFromNative — getState failed', err);
    return;
  }
  if (!state.connected || !state.deviceAddress) {
    // Nichts zu spiegeln. Wenn JS-State 'connected' war und Native sagt jetzt
    // disconnect, wird das ohnehin vom onConnectionStateChange-Listener im
    // Hook erkannt — wir greifen hier nicht regelnd ein, um Race-Conditions
    // mit gerade laufenden connect()-Aufrufen zu vermeiden.
    return;
  }
  // Bereits adoptiert oder gerade verbunden? Dann nichts tun.
  if (rawStatus === 'connected' || rawStatus === 'connecting') {
    return;
  }
  const target: RadiacodeDeviceRef = {
    id: state.deviceAddress,
    name: device?.name ?? 'Radiacode',
    serial: device?.serial ?? state.deviceAddress,
  };
  console.log('[RadiacodeProvider] syncFromNative — adopting', target.id);
  await adoptExistingConnection(target).catch((err) => {
    console.warn('[RadiacodeProvider] adoptExistingConnection failed', err);
  });
}, [adoptExistingConnection, rawStatus, device]);
```

3. Mount-Effekt:

```ts
useEffect(() => {
  void syncFromNative();
  return () => {
    sessionUnsubRef.current?.();
    sessionUnsubRef.current = null;
  };
}, [syncFromNative]);
```

4. Visibilitychange-Effekt (App-Foreground):

```ts
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
```

5. Im Context-Value `refreshConnectionState: syncFromNative` ergänzen, im `RadiacodeContextValue`-Interface:

```ts
/** Fragt den nativen BLE-Status ab und spiegelt ihn in den React-State.
 *  Kein neuer Verbindungsaufbau — nur Listener-Registrierung, falls
 *  Native bereits verbunden ist. */
refreshConnectionState: () => Promise<void>;
```

`useRadiacodeDevice`-Aufruf um den neuen Hook-Eintrag erweitern (`adoptExistingConnection` destrukturieren) und im Memo der Context-Werte (oder direkt im Provider-`value`) `refreshConnectionState: syncFromNative` aufnehmen.

### Step A.3 — Refresh-Button in den Connection-Controls

In [src/components/pages/RadiacodeConnectionControls.tsx](../../src/components/pages/RadiacodeConnectionControls.tsx):

1. Imports erweitern:
   ```ts
   import RefreshIcon from '@mui/icons-material/Refresh';
   ```
2. Aus `useRadiacode()` zusätzlich `refreshConnectionState` destrukturieren.
3. Neuer IconButton zwischen Connect/Disconnect und Settings:

```tsx
<Tooltip title="Verbindungsstatus prüfen">
  <span>
    <IconButton
      aria-label="Verbindungsstatus prüfen"
      onClick={() => {
        void refreshConnectionState();
      }}
      disabled={status === 'connecting' || status === 'reconnecting'}
    >
      <RefreshIcon />
    </IconButton>
  </span>
</Tooltip>
```

### Step A.4 — Tests

**Datei:** `src/components/providers/RadiacodeProvider.test.tsx` (anlegen oder erweitern)

Mock `RadiacodeNotification.getState` so, dass der Provider beim Mount adoptiert. Den BLE-Adapter so mocken, dass `connect` einen Fehler wirft, falls er fälschlich aufgerufen wird (Beweis: Adoption ruft kein `connect`).

```tsx
import { render, waitFor, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RadiacodeProvider, { useRadiacode } from './RadiacodeProvider';
import { RadiacodeNotification } from '../../hooks/radiacode/radiacodeNotification';
import type { BleAdapter } from '../../hooks/radiacode/bleAdapter';

vi.mock('../../hooks/radiacode/radiacodeNotification', () => ({
  RadiacodeNotification: {
    getState: vi.fn(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    connectNative: vi.fn(),
    disconnectNative: vi.fn(),
    writeNative: vi.fn(),
  },
}));

function StatusProbe() {
  const { status, device } = useRadiacode();
  return <div data-testid="probe">{status}|{device?.id ?? '-'}</div>;
}

function makeAdapter(overrides: Partial<BleAdapter> = {}): BleAdapter {
  return {
    isSupported: () => true,
    requestDevice: vi.fn(),
    getConnectedDevices: vi.fn().mockResolvedValue([]),
    connect: vi.fn().mockRejectedValue(new Error('connect must NOT be called')),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn().mockResolvedValue(() => {}),
    write: vi.fn().mockResolvedValue(undefined),
    onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('RadiacodeProvider — syncFromNative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adoptiert eine bestehende Native-Verbindung beim Mount ohne adapter.connect aufzurufen', async () => {
    (RadiacodeNotification.getState as any).mockResolvedValue({
      connected: true,
      deviceAddress: 'aa:bb:cc:dd:ee:ff',
      radiacodeTracking: false,
      gpsTracking: false,
    });
    const adapter = makeAdapter();
    render(
      <RadiacodeProvider adapter={adapter}>
        <StatusProbe />
      </RadiacodeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toContain('connected');
    });
    expect(adapter.connect).not.toHaveBeenCalled();
  });

  it('bleibt idle, wenn Native disconnect meldet', async () => {
    (RadiacodeNotification.getState as any).mockResolvedValue({
      connected: false,
      deviceAddress: null,
      radiacodeTracking: false,
      gpsTracking: false,
    });
    const adapter = makeAdapter();
    render(
      <RadiacodeProvider adapter={adapter}>
        <StatusProbe />
      </RadiacodeProvider>,
    );
    // Kurze Wartezeit, damit der Mount-Effekt durchläuft
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('probe').textContent).toBe('idle|-');
  });
});
```

> **Hinweis für die Implementierung:** Falls der bestehende Provider beim Mount `adapter.getConnectedDevices()` über den zweiten useEffect (Zeile 435-463) aufruft und dort `connectRaw` antriggert, würde der Test fehlschlagen, weil `connectRaw` `adapter.connect` ruft. Dann muss im zweiten useEffect ergänzt werden: „wenn syncFromNative bereits adoptiert hat (`rawStatus === 'connected'`), Auto-Connect überspringen". Das ist sicher, weil syncFromNative im Mount-Effekt vorher läuft. Verifizieren: erst Tests laufen lassen, dann ggf. Guard ergänzen.

**Datei:** `src/components/pages/RadiacodeConnectionControls.test.tsx` (anlegen oder erweitern)

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RadiacodeConnectionControls from './RadiacodeConnectionControls';
import { RadiacodeContext } from '../providers/RadiacodeProvider';
import type { RadiacodeContextValue } from '../providers/RadiacodeProvider';

function makeCtx(overrides: Partial<RadiacodeContextValue> = {}): RadiacodeContextValue {
  return {
    status: 'idle',
    device: null,
    deviceInfo: null,
    measurement: null,
    lastSampleTimestamp: null,
    history: [],
    error: null,
    scan: vi.fn(),
    connect: vi.fn(),
    connectDevice: vi.fn(),
    disconnect: vi.fn(),
    spectrum: null,
    liveRecording: false,
    startLiveRecording: vi.fn(),
    stopLiveRecording: vi.fn(),
    resetLiveSpectrum: vi.fn(),
    saveLiveSpectrum: vi.fn(),
    readSettings: vi.fn(),
    writeSettings: vi.fn(),
    playSignal: vi.fn(),
    doseReset: vi.fn(),
    refreshConnectionState: vi.fn(),
    ...overrides,
  } as RadiacodeContextValue;
}

describe('RadiacodeConnectionControls — Refresh-Button', () => {
  it('ruft refreshConnectionState beim Klick', () => {
    const refresh = vi.fn();
    const ctx = makeCtx({ refreshConnectionState: refresh });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    fireEvent.click(screen.getByLabelText('Verbindungsstatus prüfen'));
    expect(refresh).toHaveBeenCalled();
  });

  it('ist deaktiviert während connecting', () => {
    const ctx = makeCtx({ status: 'connecting' });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    const btn = screen.getByLabelText('Verbindungsstatus prüfen');
    expect(btn).toBeDisabled();
  });
});
```

### Step A.5 — Block A abschließen

Am Ende von Block A einmalig laufen lassen (in der Reihenfolge):

```bash
npx tsc --noEmit
npx eslint
npx vitest run
```

Errors fixen, dann ein Commit:

```bash
git add src/hooks/radiacode/useRadiacodeDevice.ts \
        src/components/providers/RadiacodeProvider.tsx \
        src/components/providers/RadiacodeProvider.test.tsx \
        src/components/pages/RadiacodeConnectionControls.tsx \
        src/components/pages/RadiacodeConnectionControls.test.tsx
git commit -m "feat(radiacode): syncFromNative + Refresh-Button für saubere Status-Spiegelung

Beim Mount, beim visibilitychange und bei Klick auf den neuen Refresh-Button
fragt der RadiacodeProvider den nativen Verbindungsstatus ab und adoptiert
eine bereits bestehende Verbindung über die neue Hook-Methode
adoptExistingConnection(). adoptExistingConnection registriert nur die
Plugin-Listener (Measurement/Polling) und setzt den React-Status — kein
adapter.connect, kein erneuter BLE-Handshake.

Behebt: UI zeigt 'nicht verbunden' obwohl der native Service bereits
verbunden ist (insbesondere wenn die App startet, bevor das RadiaCode-
Gerät an ist und sich später verbindet)."
```

---

## Block B — Native Diagnose-Logs, Poll-Delay & Rare-Cache (Kotlin/Java)

**Ziel:** Verstehen, ob die Rare-Records nach Late-Connect tatsächlich auf BLE-Ebene fehlen oder nur auf TS-Ebene verloren gehen. Gleichzeitig zwei plausible Ursachen entschärfen: zu früher Poll vor Handshake-Settlement und „leere" Plugin-Events ohne gecachte Rare-Felder.

### Files

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt` — Log mit Realtime-/Rare-Record-Counts.
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt` — Log in `onMeasurementReceived`, Initial-Delay vor erstem Poll, In-Memory-Cache der letzten Rare-Felder, `getCachedMeasurement()`-Accessor.
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java` — bei `emitMeasurement` fehlende Rare-Felder aus dem Service-Cache nachfüllen.

### Step B.1 — Diagnose-Logs im Decoder

In [Measurement.kt](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt) `parse(...)` ergänzen (vor dem `realtime`-Lookup, nach `decodeRecords`):

```kotlin
val realtimeCount = records.count { it is Record.Realtime }
val rareCount = records.count { it is Record.Rare }
android.util.Log.d(
    "MeasurementDecoder",
    "parse — realtime=$realtimeCount rare=$rareCount totalRecords=${records.size}",
)
```

(Log-Tag bewusst kurz; Log-Level `DEBUG` damit es im Release-Logcat herausfiltern kann.)

### Step B.2 — Diagnose-Logs in `onMeasurementReceived`

In [RadiacodeForegroundService.kt](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L401-L408) `onMeasurementReceived(m)`:

```kotlin
private fun onMeasurementReceived(m: Measurement) {
    Log.d(
        TAG,
        "measurement dose=${m.doseUSv} chg=${m.chargePct} temp=${m.temperatureC} dur=${m.durationSec}",
    )
    RadiacodeNotificationPlugin.emitMeasurement(m)
    // ... bestehender Code unverändert
}
```

### Step B.3 — Initial-Delay vor erstem Poll-Tick

In `startPollLoop()` ([RadiacodeForegroundService.kt:521-527](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L521-L527)) den Initial-Delay von `0L` auf `200L` erhöhen — gibt dem Gerät Zeit, das `WR_VIRT_SFR(DEVICE_TIME, 0)` zu verarbeiten, bevor der erste `RD_VIRT_STRING(DATA_BUF)` rausgeht:

```kotlin
private fun startPollLoop() {
    stopPollLoop()
    val exec = Executors.newSingleThreadScheduledExecutor()
    pollExecutor = exec
    // Initial-Delay 200 ms: gibt dem Gerät Zeit, den DEVICE_TIME=0-Reset
    // aus dem Handshake zu verarbeiten, bevor der erste DATA_BUF-Read
    // rausgeht. Ohne den Delay sieht das Gerät die DEVICE_TIME-Reset
    // möglicherweise erst nach dem ersten Read und liefert dann nur
    // Realtime-Records — Rare-Records bleiben dauerhaft aus.
    pollTask = exec.scheduleAtFixedRate({
        pollTick()
    }, 200L, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS)
}
```

### Step B.4 — Rare-Felder-Cache im Service

In `RadiacodeForegroundService.kt` neue Properties (bei den anderen `@Volatile`/State-Feldern, ab Zeile 128-142):

```kotlin
@Volatile private var cachedDoseUSv: Double? = null
@Volatile private var cachedDurationSec: Int? = null
@Volatile private var cachedTemperatureC: Double? = null
@Volatile private var cachedChargePct: Double? = null
```

In `onMeasurementReceived(m)` Cache aktualisieren (vor `emitMeasurement(m)`):

```kotlin
m.doseUSv?.let { cachedDoseUSv = it }
m.durationSec?.let { cachedDurationSec = it }
m.temperatureC?.let { cachedTemperatureC = it }
m.chargePct?.let { cachedChargePct = it }
```

In `teardownSession()` ([Zeile 549-565](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L549-L565)) den Cache leeren — der Cache soll nur innerhalb der gleichen Session gelten:

```kotlin
private fun teardownSession() {
    // ... bestehender Code (stopPollLoop usw.) ...
    cachedDoseUSv = null
    cachedDurationSec = null
    cachedTemperatureC = null
    cachedChargePct = null
    session?.release()
    session = null
    deviceReady = false
}
```

Public Getter ergänzen, die das Plugin abfragen kann:

```kotlin
fun getCachedDoseUSv(): Double? = cachedDoseUSv
fun getCachedDurationSec(): Int? = cachedDurationSec
fun getCachedTemperatureC(): Double? = cachedTemperatureC
fun getCachedChargePct(): Double? = cachedChargePct
```

### Step B.5 — Plugin-Emit nutzt den Cache als Fallback

In [RadiacodeNotificationPlugin.java:241-256](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java#L241-L256) `emitMeasurement(...)` den Service-Cache als Fallback nutzen:

```java
public static void emitMeasurement(Measurement m) {
    RadiacodeNotificationPlugin i = instance;
    if (i == null) return;
    JSObject data = new JSObject();
    data.put("timestampMs", m.getTimestampMs());
    data.put("dosisleistungUSvH", m.getDosisleistungUSvH());
    data.put("cps", m.getCps());

    RadiacodeForegroundService svc = RadiacodeForegroundService.Companion.getInstance();

    Double dose = m.getDoseUSv() != null
        ? m.getDoseUSv()
        : (svc != null ? svc.getCachedDoseUSv() : null);
    if (dose != null) data.put("doseUSv", dose);

    Integer duration = m.getDurationSec() != null
        ? m.getDurationSec()
        : (svc != null ? svc.getCachedDurationSec() : null);
    if (duration != null) data.put("durationSec", duration);

    Double temp = m.getTemperatureC() != null
        ? m.getTemperatureC()
        : (svc != null ? svc.getCachedTemperatureC() : null);
    if (temp != null) data.put("temperatureC", temp);

    Double chg = m.getChargePct() != null
        ? m.getChargePct()
        : (svc != null ? svc.getCachedChargePct() : null);
    if (chg != null) data.put("chargePct", chg);

    if (m.getDosisleistungErrPct() != null)
        data.put("dosisleistungErrPct", m.getDosisleistungErrPct());
    if (m.getCpsErrPct() != null) data.put("cpsErrPct", m.getCpsErrPct());
    i.notifyListeners("measurement", data);
}
```

> Wichtig: Der Cache wird **nur als Fallback** genutzt — wenn der aktuelle Tick einen frischen Rare-Wert hat, gewinnt der frische Wert. So gibt es keine veralteten Werte, sobald Rare-Records wieder fließen.

### Step B.6 — Block B abschließen

Block B verändert nur Native-Code. Der TS-Build prüft das nicht direkt, aber `npx next build --webpack` triggert die Capacitor-Sync-Logik nicht — der Native-Code wird beim Android-Build separat kompiliert. Um Tippfehler im Kotlin/Java zu fangen, idealerweise einmal:

```bash
cd capacitor/android && ./gradlew :app:compileDebugKotlin :app:compileDebugJavaWithJavac
```

Wenn das `gradlew` nicht ausführbar ist oder der Build zu lang dauert, ersatzweise eine sorgfältige visuelle Code-Review der drei Native-Dateien gegen das Plan-Snippet machen.

Anschließend Commit:

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java
git commit -m "feat(radiacode): native Diagnose-Logs, Poll-Delay und Rare-Felder-Cache

Diagnose-Logs in MeasurementDecoder.parse() (Anzahl Realtime/Rare pro
DATA_BUF) und in onMeasurementReceived (rohe Rare-Felder). Initial-Delay
von 200 ms vor dem ersten Poll-Tick im Foreground-Service, damit das
Gerät den DEVICE_TIME=0-Reset aus dem Handshake verarbeiten kann, bevor
der erste DATA_BUF-Read rausgeht. In-Memory-Cache der letzten gesehenen
Rare-Werte (dose, chargePct, temperatureC, durationSec); das Plugin füllt
fehlende Rare-Felder beim Emit aus dem Cache, damit die UI nach
Late-Connect nicht dauerhaft '—' anzeigt.

Hypothesengeleiteter Fix für: nach Late-Connect (App startet vor dem
Gerät) erscheinen Rare-Felder erst nach explizitem Disconnect+Reconnect.
Die Logs erlauben die finale Verifikation per Logcat."
```

---

## Final-Check (gemeinsam für beide Blöcke)

Nach Block B einmal über die ganze Branch:

```bash
git checkout -- next-env.d.ts
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

Falls etwas rot ist, fixen und einen `fix(...)`-Commit obendrauf legen oder den letzten Commit erweitern (kein `--amend`, lieber neuer Commit per User-Konvention).

---

## Manuelle Verifikation auf Android-Gerät

(Nach Build und Install auf realem Gerät — nicht Teil des automatisierten Plans.)

1. App starten, Gerät aus → erwartet: `Verbindung erkannt → Status `Getrennt` (idle).
2. Gerät einschalten → erwartet: nach <5 s Status `Verbunden`, Live-Daten erscheinen, Akku/Dosis/Temperatur sichtbar (auch beim allerersten Tick dank Rare-Cache, sobald mindestens ein Rare-Record-Tick durchkam).
3. App in Background → in Foreground → erwartet: Status bleibt `Verbunden`, Live-Daten laufen weiter.
4. Klick auf Refresh → erwartet: keine Statusänderung wenn alles ok, Status spiegelt sich falls JS-Provider out-of-sync war.
5. Logcat-Filter `tag:RadiacodeFGS OR tag:MeasurementDecoder`: nach Late-Connect prüfen, ob `rare=>0` Records erscheinen und ob `measurement dose=… chg=…` Werte mit echten (nicht-null) Werten geloggt werden.
