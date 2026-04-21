# Radiacode Persistent Notification — Design

**Status**: approved
**Datum**: 2026-04-21
**Branch**: `feat/radiacode-via-bluetooth`

## Ziel

Solange ein Radiacode-Gerät per Bluetooth mit der Android-App verbunden ist, zeigt das System eine persistente Notification mit den aktuellen Live-Werten (Dosisleistung in µSv/h und Counts per Second). Die Notification ist auch sichtbar, wenn der User in einer anderen App arbeitet. Ein Tap öffnet die App, ein Action-Button trennt die Verbindung.

## Produkt-Entscheidungen

- **Plattform**: Nur Android-nativ (Capacitor). Kein Web/PWA — Web-Bluetooth verliert bei Tab-Wechsel die Verbindung.
- **Ein gemeinsamer Service** für alle Zustände. Titel wechselt:
  - `Radiacode verbunden` — normal verbunden
  - `Strahlenmessung läuft` — während Spectrum-Recording
  - `Radiacode – Verbindung verloren…` — während Auto-Reconnect
- **Tap**: bringt `MainActivity` in den Vordergrund (`FLAG_ACTIVITY_SINGLE_TOP | FLAG_ACTIVITY_CLEAR_TOP`). Kein Deeplink zu einer Spezialseite.
- **Action-Button**: nur `Trennen`. Ohne den wäre die Notification nicht entfernbar (ongoing).
- **Format**: `"%.2f µSv/h · %d CPS"`, während Reconnect mit Suffix `(letzter Wert)`.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ WebView-Prozess (Capacitor, JS/TS)                          │
│                                                             │
│  RadiacodeProvider                                          │
│    status / measurement / spectrumSession.active            │
│                │                                            │
│  bleAdapter.capacitor.ts                                    │
│    startForegroundService / updateForegroundService /       │
│    stopForegroundService / onDisconnectRequested            │
│                │                                            │
│  Capacitor Plugin: RadiacodeNotification                    │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│ Android nativ (Kotlin, gleicher Prozess)                    │
│                                                             │
│  RadiacodeNotificationPlugin                                │
│    @PluginMethod start / update / stop                      │
│    notifyListeners("disconnectRequested")                   │
│                │                                            │
│  RadiacodeForegroundService                                 │
│    startForeground(NOTIFICATION_ID, notification)           │
│    PendingIntent Tap → MainActivity                         │
│    PendingIntent Action → LocalBroadcast DISCONNECT         │
└─────────────────────────────────────────────────────────────┘
```

BLE-Logik und Protocol-Decoding bleiben unverändert in TypeScript. Der Service existiert nur, um den Prozess wachzuhalten (damit die WebView-BLE-Verbindung im Hintergrund weiterläuft) und die Notification zu rendern.

## Lebenszyklus

1. `status` → `connected` → Provider ruft `startForegroundService` → Service startet, Notification erscheint.
2. Jede neue `measurement` (≈ 1 Hz) → Provider ruft `updateForegroundService` → Notification wird aktualisiert.
3. `spectrumSession.active` wechselt → Provider ruft `updateForegroundService` mit neuem `state` → Titel wechselt in derselben Notification.
4. User tippt "Trennen" in Notification → Service schickt LocalBroadcast → Plugin feuert `disconnectRequested` → Provider ruft `disconnect()`.
5. `status` → `idle`/`unavailable` → Provider ruft `stopForegroundService` → Service beendet sich.

## Android-Komponenten

### `RadiacodeForegroundService.kt`

- Service-Typ `connectedDevice|location` (im Manifest bereits deklariert).
- Notification-Channel `radiacode_connection`, Importance `LOW` (kein Ton/Vibration).
- `onStartCommand` unterscheidet `ACTION_START | ACTION_UPDATE | ACTION_STOP` anhand `intent.action`.
- `START_NOT_STICKY` — bei Prozess-Kill kommt der Service nicht allein zurück.
- Notification ist `setOngoing(true)` — User kann sie nur via Trennen-Action oder App-Handler schließen.
- Small-Icon: wiederverwendetes `ic_launcher_foreground` (kein neues Asset).
- `PendingIntent` für Content-Tap → `MainActivity` mit `FLAG_ACTIVITY_SINGLE_TOP | FLAG_ACTIVITY_CLEAR_TOP`.
- `PendingIntent` für Action-Button → interner `BroadcastReceiver`, sendet `LocalBroadcastManager`-Broadcast `RADIACODE_DISCONNECT_REQUESTED`.

### `RadiacodeNotificationPlugin.kt`

- `@CapacitorPlugin(name = "RadiacodeNotification")`.
- Registriert beim Load einen `BroadcastReceiver` auf `RADIACODE_DISCONNECT_REQUESTED` → ruft `notifyListeners("disconnectRequested", JSObject())`.
- `@PluginMethod start(title, body)`: `startForegroundService(intent)` mit `ACTION_START`.
- `@PluginMethod update(dosisleistung, cps, state)`: `startService(intent)` mit `ACTION_UPDATE`.
- `@PluginMethod stop()`: `startService(intent)` mit `ACTION_STOP`.
- In `MainActivity.onCreate`: `registerPlugin(RadiacodeNotificationPlugin.class);`.

### Berechtigungen

- `POST_NOTIFICATIONS` (Android 13+): einmaliger Runtime-Request beim ersten `start`-Aufruf. Bei Verweigerung: Service läuft, stille Channel-Notification; JS loggt Warnung.
- `FOREGROUND_SERVICE_CONNECTED_DEVICE` + `FOREGROUND_SERVICE_LOCATION`: schon deklariert, kein Runtime-Request nötig.

## TypeScript-Komponenten

### `src/hooks/radiacode/radiacodeNotification.ts` (neu)

```ts
import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type NotificationState = 'connected' | 'recording' | 'reconnecting';

export interface RadiacodeNotificationPlugin {
  start(opts: { title: string; body: string }): Promise<void>;
  update(opts: {
    dosisleistung: number;
    cps: number;
    state: NotificationState;
  }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'disconnectRequested',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}

export const RadiacodeNotification =
  registerPlugin<RadiacodeNotificationPlugin>('RadiacodeNotification');
```

### `bleAdapter.ts` — Interface erweitern

```ts
export interface BleAdapter {
  // … bestehend …
  startForegroundService?(opts: { title: string; body: string }): Promise<void>;
  updateForegroundService?(opts: {
    dosisleistung: number;
    cps: number;
    state: NotificationState;
  }): Promise<void>;
  stopForegroundService?(): Promise<void>;
  onDisconnectRequested?(handler: () => void): Unsubscribe;
}
```

### `bleAdapter.capacitor.ts` — Methoden implementieren

Delegiert direkt an das `RadiacodeNotification`-Plugin. `onDisconnectRequested` registriert einen Listener und returnt den Unsubscriber.

### `bleAdapter.web.ts` — unverändert

Die neuen Methoden sind alle optional; Web liefert sie gar nicht. Kein Regressionsrisiko.

### `RadiacodeProvider.tsx` — neue Effects

```ts
const notificationState: NotificationState | null = useMemo(() => {
  if (status === 'connected') {
    return spectrumSession.active ? 'recording' : 'connected';
  }
  if (reconnecting) return 'reconnecting';
  return null;
}, [status, spectrumSession.active, reconnecting]);

// Effect A: start/stop nur auf On/Off-Flanke
useEffect(() => {
  if (!adapter.startForegroundService || !notificationState) return;
  adapter.startForegroundService({
    title: titleFor(notificationState),
    body: formatBody(measurement, notificationState),
  });
  return () => { adapter.stopForegroundService?.(); };
}, [notificationState !== null, adapter]);

// Effect B: Live-Updates
useEffect(() => {
  if (!adapter.updateForegroundService || !notificationState || !measurement) return;
  adapter.updateForegroundService({
    dosisleistung: measurement.dosisleistung,
    cps: measurement.cps,
    state: notificationState,
  });
}, [measurement?.timestamp, notificationState, adapter]);

// Effect C: Disconnect-Request-Listener
useEffect(() => {
  const unsub = adapter.onDisconnectRequested?.(() => { disconnect(); });
  return () => unsub?.();
}, [adapter, disconnect]);
```

### `RecordButton.tsx` — aufräumen

Die direkten `startForegroundService`/`stopForegroundService`-Aufrufe im `onStart`/`onStop` entfallen. Der Provider steuert den Service zentral anhand der Status-Kombination. Behebt nebenbei die Race, die entstand, wenn User während des Recordings disconnectet wurde.

## Edge-Cases

| Situation | Verhalten |
|---|---|
| App aus Recents geswiped, Connection aktiv | Service läuft weiter, Notification bleibt, BLE bleibt aktiv. |
| Tap auf "Trennen" in Notification | Plugin-Event → `disconnect()` → Status-Wechsel → `stopForegroundService` → Notification weg. |
| `POST_NOTIFICATIONS` verweigert | Service läuft trotzdem, stille Channel-Notification; einmaliger Log/Hinweis in App. |
| BLE bricht weg, Auto-Reconnect | `notificationState = 'reconnecting'`, Text mit letztem bekanntem Wert + `(letzter Wert)`. |
| Reconnect-Timeout | Status → `idle`/`error` → Notification verschwindet. |
| OS killt Prozess (LMK) | `START_NOT_STICKY` — Service bleibt tot. App-Öffnung triggert Auto-Connect-Flow. |
| App im Vordergrund | Notification bleibt sichtbar (Android-Standard bei ongoing). Erwünscht: User sieht Werte im Pulldown. |
| Recording startet bei verbunden | `state` wechselt zu `recording`, Titel wechselt, **kein erneutes `start`**. |

## Tests

### Vitest (TS)

`RadiacodeProvider.test.tsx` erweitern:

- Status-Wechsel `idle → connected` triggert `startForegroundService` genau einmal.
- Neue `measurement` triggert `updateForegroundService` mit korrekten Werten + State `'connected'`.
- `spectrumSession.active = true` → nächstes `update` hat `state='recording'`, **kein neues `start`**.
- `reconnecting=true` → `update` mit `state='reconnecting'`, letzter Measurement-Wert bleibt erhalten.
- Status → `idle` → `stopForegroundService`, keine weiteren `update`.
- `disconnectRequested`-Event → `disconnect()` wird aufgerufen.

`bleAdapter.capacitor.ts`: minimaler Test mit gemocktem `RadiacodeNotification`-Plugin zur Verifikation des Mappings.

### Manuell auf Gerät

- Connect → Notification erscheint mit Live-Werten.
- Home-Taste → andere App → Werte aktualisieren weiter.
- Tap → App kommt nach vorn, gleiche Seite wie vorher.
- Trennen-Button → Notification verschwindet, App zeigt "nicht verbunden".
- Recording starten → Titel wechselt zu "Strahlenmessung läuft".
- Gerät ausschalten → "Verbindung verloren…" → nach Timeout weg.
- App-Kill via Recents → Notification bleibt, über Trennen-Button schließbar.

## YAGNI — bewusst nicht im Scope

- iOS / Web-Notifications
- Deeplinking auf Dosimetrie-Seite
- Recording Start/Stop-Actions in der Notification
- Sticky-Restart-Logik nach OS-Kill
- Custom-Icon/Channel-Customization-UI
