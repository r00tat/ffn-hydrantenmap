# Radiacode Persistent Notification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persistente Android-Notification mit Live-Werten (Dosisleistung + CPS) solange ein Radiacode per BLE verbunden ist. Tap öffnet App, Trennen-Button disconnectet.

**Architecture:** Eigener Android-Foreground-Service (`RadiacodeForegroundService`) zeigt die Notification; Custom Capacitor-Plugin (`RadiacodeNotification`) steuert den Service aus JS. BLE-Logik bleibt unverändert im WebView-Prozess — der Service hält lediglich den Prozess wach und rendert die Notification. `RadiacodeProvider` synchronisiert Status/Measurement mit dem Plugin.

**Tech Stack:** Java (Android-Service + Plugin), TypeScript (Provider + Adapter), Capacitor Core, Vitest.

**Design-Dokument:** [docs/plans/2026-04-21-radiacode-persistent-notification-design.md](./2026-04-21-radiacode-persistent-notification-design.md)

---

## Phase A — TypeScript-Layer (TDD)

### Task A1: Plugin-Binding + NotificationState-Typ

**Files:**
- Create: `src/hooks/radiacode/radiacodeNotification.ts`

**Step 1: Datei schreiben**

```ts
import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type NotificationState = 'connected' | 'recording' | 'reconnecting';

export interface RadiacodeNotificationUpdate {
  dosisleistung: number;
  cps: number;
  state: NotificationState;
}

export interface RadiacodeNotificationPlugin {
  start(opts: { title: string; body: string }): Promise<void>;
  update(opts: RadiacodeNotificationUpdate): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'disconnectRequested',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}

export const RadiacodeNotification =
  registerPlugin<RadiacodeNotificationPlugin>('RadiacodeNotification');
```

**Step 2: Type-Check**

Run: `npx tsc --noEmit`
Expected: kein Fehler in der neuen Datei.

**Step 3: Commit**

```bash
git add src/hooks/radiacode/radiacodeNotification.ts
git commit -m "feat(radiacode): capacitor plugin binding fuer notification plugin"
```

---

### Task A2: BleAdapter-Interface erweitern

**Files:**
- Modify: `src/hooks/radiacode/bleAdapter.ts`

**Step 1: Interface erweitern**

Ersetze den bestehenden Block:

```ts
startForegroundService?(opts: { title: string; body: string }): Promise<void>;
stopForegroundService?(): Promise<void>;
```

durch:

```ts
startForegroundService?(opts: { title: string; body: string }): Promise<void>;
updateForegroundService?(opts: {
  dosisleistung: number;
  cps: number;
  state: NotificationState;
}): Promise<void>;
stopForegroundService?(): Promise<void>;
onDisconnectRequested?(handler: () => void): Unsubscribe;
```

Am Anfang der Datei hinzufügen:

```ts
import { NotificationState } from './radiacodeNotification';
```

**Step 2: Type-Check**

Run: `npx tsc --noEmit`
Expected: pass.

**Step 3: Commit**

```bash
git add src/hooks/radiacode/bleAdapter.ts
git commit -m "feat(radiacode): adapter um notification-update und disconnect-request erweitert"
```

---

### Task A3: RadiacodeProvider — Tests für Notification-Effects schreiben (TDD)

**Files:**
- Modify: `src/components/providers/RadiacodeProvider.test.tsx`

**Step 1: Fehlende Tests schreiben**

Am Ende des `describe('RadiacodeProvider', …)` einen neuen `describe('notification service', …)` Block hinzufügen. Nutze einen helper, der einen Adapter mit Spys für `startForegroundService` / `updateForegroundService` / `stopForegroundService` / `onDisconnectRequested` liefert. Ein Disconnect-Handler wird in einem Ref gespeichert und kann in Tests manuell getriggert werden.

Der komplette Block:

```tsx
  describe('notification service', () => {
    function serviceAdapter() {
      const disconnectHandlers: Array<() => void> = [];
      const base = nullAdapter();
      const startForegroundService = vi.fn(async () => {});
      const updateForegroundService = vi.fn(async () => {});
      const stopForegroundService = vi.fn(async () => {});
      const onDisconnectRequested = vi.fn((h: () => void) => {
        disconnectHandlers.push(h);
        return () => {
          const i = disconnectHandlers.indexOf(h);
          if (i >= 0) disconnectHandlers.splice(i, 1);
        };
      });
      return {
        adapter: {
          ...base,
          startForegroundService,
          updateForegroundService,
          stopForegroundService,
          onDisconnectRequested,
        } as BleAdapter,
        spies: {
          startForegroundService,
          updateForegroundService,
          stopForegroundService,
          onDisconnectRequested,
        },
        triggerDisconnectRequest: () => {
          disconnectHandlers.forEach((h) => h());
        },
      };
    }

    it('startet den foreground-service beim wechsel auf connected', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider adapter={adapter} clientFactory={factory}>
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      await waitFor(() => {
        expect(spies.startForegroundService).toHaveBeenCalledTimes(1);
      });
      expect(spies.startForegroundService).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('verbunden') }),
      );
    });

    it('schickt updateForegroundService bei jeder neuen messung', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider
          adapter={adapter}
          clientFactory={factory}
          feedMeasurement={(fn) => feeds.push(fn)}
        >
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      act(() => {
        feeds[0]({ cps: 11, dosisleistung: 0.42, timestamp: 1000 });
      });
      await waitFor(() => {
        expect(spies.updateForegroundService).toHaveBeenCalledWith({
          dosisleistung: 0.42,
          cps: 11,
          state: 'connected',
        });
      });
    });

    it('wechselt state auf recording wenn spectrumSession aktiv ist', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const feeds: ((m: RadiacodeMeasurement) => void)[] = [];
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider
          adapter={adapter}
          clientFactory={factory}
          feedMeasurement={(fn) => feeds.push(fn)}
        >
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      await act(async () => {
        await values.at(-1)!.startSpectrumRecording();
      });
      spies.startForegroundService.mockClear();
      act(() => {
        feeds[0]({ cps: 5, dosisleistung: 0.1, timestamp: 2000 });
      });
      await waitFor(() => {
        expect(spies.updateForegroundService).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'recording' }),
        );
      });
      // kein erneuter start beim Wechsel des Unter-States
      expect(spies.startForegroundService).not.toHaveBeenCalled();
    });

    it('stoppt den service beim disconnect', async () => {
      const { adapter, spies } = serviceAdapter();
      const { factory } = makeFakeSpectrumClientFactory();
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider adapter={adapter} clientFactory={factory}>
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      await act(async () => {
        await values.at(-1)!.disconnect();
      });
      await waitFor(() => {
        expect(spies.stopForegroundService).toHaveBeenCalled();
      });
    });

    it('reagiert auf onDisconnectRequested durch disconnect-aufruf', async () => {
      const { adapter, triggerDisconnectRequest } = serviceAdapter();
      const { factory, latest } = makeFakeSpectrumClientFactory();
      const values: ReturnType<typeof useRadiacode>[] = [];
      render(
        <RadiacodeProvider adapter={adapter} clientFactory={factory}>
          <Probe onValue={(v) => values.push(v)} />
        </RadiacodeProvider>,
      );
      await act(async () => {
        await values.at(-1)!.connect();
      });
      await act(async () => {
        triggerDisconnectRequest();
      });
      await waitFor(() => {
        expect(latest()!.disconnect).toHaveBeenCalled();
      });
    });
  });
```

**Step 2: Tests laufen lassen — sie MÜSSEN fehlschlagen**

Run: `NO_COLOR=1 npm run test -- RadiacodeProvider`
Expected: die fünf neuen Tests scheitern, alle bestehenden Tests laufen weiter grün.

**Step 3: Zwischenstopp — nicht committen**

Die Tests bleiben rot bis Task A4 den Provider anpasst.

---

### Task A4: RadiacodeProvider — Notification-Effects implementieren

**Files:**
- Modify: `src/components/providers/RadiacodeProvider.tsx`

**Step 1: Imports & Helper**

Oben `NotificationState` importieren:

```ts
import type { NotificationState } from '../../hooks/radiacode/radiacodeNotification';
```

Am Modul-Top (außerhalb der Komponente) zwei Helper:

```ts
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
```

**Step 2: Den bestehenden `startForegroundService`/`stopForegroundService`-Export aus dem Context-Value ENTFERNEN**

Der Service wird intern gesteuert — Consumer brauchen die Hooks nicht mehr. Entferne die entsprechenden `useMemo`-Blöcke und die Felder aus dem `value`-Objekt sowie aus `RadiacodeContextValue` (über der Komponente). Die Interface-Deklaration:

```ts
startForegroundService?: (opts: { title: string; body: string }) => Promise<void>;
stopForegroundService?: () => Promise<void>;
```

… komplett löschen.

**Step 3: Effect A — Service starten/stoppen (nur On/Off-Flanke)**

Nach der Definition von `status` (der gemaskten Variante) einfügen:

```ts
const notificationState: NotificationState | null = useMemo(() => {
  if (status === 'connected') {
    return spectrumSession.active ? 'recording' : 'connected';
  }
  if (status === 'connecting' && reconnecting) return 'reconnecting';
  return null;
}, [status, spectrumSession.active, reconnecting]);

// Ref auf die aktuelle Ableitung, damit Effect A nur auf On/Off-Flanken reagiert.
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
    // Service-Start darf BLE nicht blockieren — Fehler im Log lassen.
  });
  return () => {
    stop?.().catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [serviceActive, adapter]);
```

**Step 4: Effect B — Live-Updates pro Measurement / State-Wechsel**

```ts
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
```

**Step 5: Effect C — Disconnect-Request-Listener**

```ts
useEffect(() => {
  const register = adapter.onDisconnectRequested;
  if (!register) return;
  const unsub = register(() => {
    disconnect().catch(() => {});
  });
  return () => unsub();
}, [adapter, disconnect]);
```

**Step 6: Tests laufen lassen**

Run: `NO_COLOR=1 npm run test -- RadiacodeProvider`
Expected: **alle Tests grün**, inklusive der fünf neuen aus Task A3.

**Step 7: Type-Check**

Run: `npx tsc --noEmit`
Expected: pass. Falls Fehler: `RecordButton.tsx` zieht noch `startForegroundService`/`stopForegroundService` aus dem Context — diese Zeilen werden in Task A5 entfernt. Ignoriere den Fehler in diesem Task nicht, sondern springe direkt zu A5.

**Step 8: Commit (nur wenn A5 abgeschlossen ist)**

Dieser Task committed nicht allein — A4 und A5 gehen gemeinsam in einen Commit, sonst bleibt der Build zwischenzeitlich rot.

---

### Task A5: RecordButton von alten FG-Service-Aufrufen befreien

**Files:**
- Modify: `src/components/Map/RecordButton.tsx`

**Step 1: Dateiposition prüfen**

Öffne `src/components/Map/RecordButton.tsx`. Finde die Zeilen:

```ts
    startForegroundService,
    stopForegroundService,
  } = useRadiacode();
```

und die nachfolgende Verwendung in `onStart`/`onStop`.

**Step 2: Entfernen**

- Aus der Destructurierung von `useRadiacode()` die beiden Felder entfernen.
- In der `useRadiacodePointRecorder`-Konfiguration (oder wo auch immer `onStart`/`onStop` definiert sind) die Aufrufe:

  ```ts
  onStart: useCallback(
    () =>
      startForegroundService?.({
        title: 'Strahlenmessung läuft',
        body: 'Live-Messpunkte werden aufgezeichnet',
      }) ?? Promise.resolve(),
    [startForegroundService],
  ),
  onStop: useCallback(
    () => stopForegroundService?.() ?? Promise.resolve(),
    [stopForegroundService],
  ),
  ```

  … entfernen. Falls `onStart`/`onStop` dadurch leer werden, die ganzen Option-Felder weglassen (der Provider steuert den Service nun zentral anhand von `spectrumSession.active`).

**Step 3: Type-Check**

Run: `npx tsc --noEmit`
Expected: pass.

**Step 4: Lint**

Run: `npm run lint`
Expected: pass (kein Warn/Error).

**Step 5: Full Test-Run**

Run: `NO_COLOR=1 npm run test`
Expected: alle Tests grün.

**Step 6: Commit (A4 + A5 gemeinsam)**

```bash
git add src/components/providers/RadiacodeProvider.tsx src/components/providers/RadiacodeProvider.test.tsx src/components/Map/RecordButton.tsx
git commit -m "feat(radiacode): persistent notification via zentralen provider-effect"
```

---

### Task A6: Capacitor-Adapter an Plugin verdrahten

**Files:**
- Modify: `src/hooks/radiacode/bleAdapter.capacitor.ts`

**Step 1: Import & Implementierung**

Am Anfang der Datei:

```ts
import { RadiacodeNotification } from './radiacodeNotification';
```

Im `capacitorAdapter`-Objekt vor dem schließenden `};` ergänzen:

```ts
  async startForegroundService(opts) {
    await RadiacodeNotification.start(opts);
  },

  async updateForegroundService(opts) {
    await RadiacodeNotification.update(opts);
  },

  async stopForegroundService() {
    await RadiacodeNotification.stop();
  },

  onDisconnectRequested(handler) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    RadiacodeNotification.addListener('disconnectRequested', handler)
      .then((h) => {
        listenerHandle = h;
      })
      .catch(() => {});
    return () => {
      listenerHandle?.remove().catch(() => {});
    };
  },
```

**Step 2: Type-Check**

Run: `npx tsc --noEmit`
Expected: pass.

**Step 3: Tests**

Run: `NO_COLOR=1 npm run test`
Expected: pass (kein Test nutzt den capacitor-Adapter direkt).

**Step 4: Commit**

```bash
git add src/hooks/radiacode/bleAdapter.capacitor.ts
git commit -m "feat(radiacode): capacitor-adapter verdrahtet notification-plugin"
```

---

## Phase B — Android-Native

### Task B1: Notification-Strings lokalisieren

**Files:**
- Modify: `capacitor/android/app/src/main/res/values/strings.xml`

**Step 1: Strings hinzufügen**

Neuen Block am Ende (vor `</resources>`):

```xml
    <!-- Radiacode persistent notification -->
    <string name="radiacode_notification_channel_name">Radiacode Verbindung</string>
    <string name="radiacode_notification_channel_desc">Zeigt Live-Messwerte während einer Radiacode-Verbindung.</string>
    <string name="radiacode_notification_action_disconnect">Trennen</string>
```

**Step 2: Kein Commit** — zusammen mit B2 committen.

---

### Task B2: `RadiacodeForegroundService.java` schreiben

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java`

**Step 1: Komplette Datei anlegen**

```java
package at.ffnd.einsatzkarte;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class RadiacodeForegroundService extends Service {

    public static final String CHANNEL_ID = "radiacode_connection";
    public static final int NOTIFICATION_ID = 4711;

    public static final String ACTION_START  = "at.ffnd.einsatzkarte.RADIACODE_START";
    public static final String ACTION_UPDATE = "at.ffnd.einsatzkarte.RADIACODE_UPDATE";
    public static final String ACTION_STOP   = "at.ffnd.einsatzkarte.RADIACODE_STOP";
    public static final String ACTION_DISCONNECT_REQUESTED =
            "at.ffnd.einsatzkarte.RADIACODE_DISCONNECT_REQUESTED";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY  = "body";
    public static final String EXTRA_DOSE  = "dose";
    public static final String EXTRA_CPS   = "cps";
    public static final String EXTRA_STATE = "state";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body  = intent.getStringExtra(EXTRA_BODY);
            startForeground(NOTIFICATION_ID, buildNotification(
                    title != null ? title : "Radiacode verbunden",
                    body  != null ? body  : ""));
        } else if (ACTION_UPDATE.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body  = intent.getStringExtra(EXTRA_BODY);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification(
                        title != null ? title : "Radiacode verbunden",
                        body  != null ? body  : ""));
            }
        } else if (ACTION_STOP.equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        } else if (ACTION_DISCONNECT_REQUESTED.equals(action)) {
            RadiacodeNotificationPlugin.onDisconnectRequested();
        }
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    private Notification buildNotification(String title, String body) {
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tapPending = PendingIntent.getActivity(
                this, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent disconnectIntent = new Intent(this, RadiacodeForegroundService.class);
        disconnectIntent.setAction(ACTION_DISCONNECT_REQUESTED);
        PendingIntent disconnectPending = PendingIntent.getService(
                this, 1, disconnectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(tapPending)
                .addAction(
                        0,
                        getString(R.string.radiacode_notification_action_disconnect),
                        disconnectPending)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.radiacode_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.radiacode_notification_channel_desc));
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    public static Intent startIntent(Context ctx, String title, String body) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY,  body);
        return i;
    }

    public static Intent updateIntent(Context ctx, String title, String body) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_UPDATE);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY,  body);
        return i;
    }

    public static Intent stopIntent(Context ctx) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_STOP);
        return i;
    }
}
```

**Step 2: Kein eigener Commit** — zusammen mit B3.

---

### Task B3: `RadiacodeNotificationPlugin.java` schreiben

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java`

**Step 1: Datei anlegen**

```java
package at.ffnd.einsatzkarte;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
        name = "RadiacodeNotification",
        permissions = {
                @Permission(
                        alias = "notifications",
                        strings = { "android.permission.POST_NOTIFICATIONS" })
        })
public class RadiacodeNotificationPlugin extends Plugin {

    private static RadiacodeNotificationPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Radiacode verbunden");
        String body  = call.getString("body", "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionCallback");
                // Start service regardless — notification may be silent without permission.
            }
        }
        Context ctx = getContext();
        Intent intent = RadiacodeForegroundService.startIntent(ctx, title, body);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        double dose = call.getDouble("dosisleistung", 0.0);
        double cps  = call.getDouble("cps", 0.0);
        String state = call.getString("state", "connected");
        String title = titleForState(state);
        String body  = formatBody(dose, cps, state);
        getContext().startService(
                RadiacodeForegroundService.updateIntent(getContext(), title, body));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().startService(RadiacodeForegroundService.stopIntent(getContext()));
        call.resolve();
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionCallback(PluginCall call) {
        // Ergebnis wird ignoriert — Notification-Permission ist best-effort.
    }

    static void onDisconnectRequested() {
        RadiacodeNotificationPlugin i = instance;
        if (i != null) {
            i.notifyListeners("disconnectRequested", new JSObject());
        }
    }

    private static String titleForState(String state) {
        if ("recording".equals(state))    return "Strahlenmessung läuft";
        if ("reconnecting".equals(state)) return "Radiacode – Verbindung verloren";
        return "Radiacode verbunden";
    }

    private static String formatBody(double dose, double cps, String state) {
        String body = String.format(java.util.Locale.GERMAN, "%.2f µSv/h · %d CPS", dose, Math.round(cps));
        if ("reconnecting".equals(state)) return body + " (letzter Wert)";
        return body;
    }
}
```

**Step 2: Registrierung in `MainActivity`**

Open: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java`

In `onCreate`, **nach** `super.onCreate(savedInstanceState);`:

```java
        registerPlugin(RadiacodeNotificationPlugin.class);
```

**Step 3: APK-Build zur Verifikation**

Run:
```bash
cd capacitor && ./build.sh debug
```
Expected: Build erfolgreich, APK entsteht unter `capacitor/android/app/build/outputs/apk/debug/app-debug.apk`. Achte auf Compile-Errors (Locale-Import, Permission-Annotations).

**Step 4: Commit (B1 + B2 + B3 + MainActivity gemeinsam)**

```bash
git add capacitor/android/app/src/main/res/values/strings.xml \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/MainActivity.java
git commit -m "feat(android): foreground-service + capacitor-plugin fuer radiacode-notification"
```

---

## Phase C — Verifikation

### Task C1: Full Quality Gate

**Step 1: alle Checks**

Run: `NO_COLOR=1 npm run check`
Expected: tsc + lint + tests + build — alles grün.

**Step 2: `next-env.d.ts` zurücksetzen (falls verändert)**

```bash
git checkout -- next-env.d.ts
```

**Step 3: Git-Status sauber**

```bash
git status
```
Expected: "nothing to commit, working tree clean".

---

### Task C2: Manuelle Geräte-Tests (dokumentiert in PR-Beschreibung)

**Testfälle** auf physischem Android-Gerät (APK aus Task B3):

- [ ] **Connect** → Notification erscheint mit Titel "Radiacode verbunden" und Live-Werten.
- [ ] **Home-Button** → andere App öffnen → Notification bleibt sichtbar, Werte aktualisieren weiter.
- [ ] **Tap auf Notification** → Einsatzkarte kommt nach vorn (gleiche Seite wie zuvor).
- [ ] **Trennen-Button** in Notification → Notification verschwindet, App zeigt "nicht verbunden".
- [ ] **Recording starten** während Verbindung → Notification-Titel wechselt zu "Strahlenmessung läuft" (ohne Flicker).
- [ ] **Gerät ausschalten** → Notification zeigt "Radiacode – Verbindung verloren", danach verschwindet sie.
- [ ] **App-Kill via Recents** → Notification bleibt, Trennen-Button funktioniert weiterhin.
- [ ] **Android 13+**: beim ersten Connect wird Notification-Permission abgefragt. Bei Verweigerung: BLE läuft, Notification ist stumm (oder erscheint nicht) — kein App-Crash.

**Kein Commit** — reine Verifikation.

---

## Reihenfolge & Commits

1. `docs(radiacode): design fuer persistente Notification bei BLE-Verbindung` — bereits committed
2. `feat(radiacode): capacitor plugin binding fuer notification plugin` (A1)
3. `feat(radiacode): adapter um notification-update und disconnect-request erweitert` (A2)
4. `feat(radiacode): persistent notification via zentralen provider-effect` (A4 + A5)
5. `feat(radiacode): capacitor-adapter verdrahtet notification-plugin` (A6)
6. `feat(android): foreground-service + capacitor-plugin fuer radiacode-notification` (B1 + B2 + B3)

Kein Push am Ende — Branch bleibt lokal.
