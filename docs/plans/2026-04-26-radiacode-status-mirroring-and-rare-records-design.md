# Radiacode: Sauberes Status-Mirroring und Rare-Records-Diagnose

Datum: 2026-04-26
Branch: `feat/radiacode-status-mirroring-and-rare-records`

## Problem

Auf Android (Capacitor + Foreground-Service) gibt es zwei Beobachtungen, wenn die App startet **bevor** das Radiacode-Gerät an ist und sich später verbindet:

1. **UI zeigt „nicht verbunden"**, obwohl die native BLE-Verbindung tatsächlich steht. Der Disconnect-Button ist daher nicht erreichbar.
2. **Rare-Felder fehlen dauerhaft.** `dosisleistung` (doseRate) und `cps` werden korrekt angezeigt; `dose` (Dosis), `chargePct` (Akku), `temperatureC` und `durationSec` erscheinen nie. Erst nach explizitem Trennen + Verbinden tauchen sie auf.

## Root-Cause-Analyse

### Bug 1 — UI-Status nicht synchron mit Native

`RadiacodeProvider` ([src/components/providers/RadiacodeProvider.tsx](../../src/components/providers/RadiacodeProvider.tsx)) ruft beim Mount zwar `RadiacodeNotification.getState()`, **loggt das Ergebnis aber nur** und nutzt es nicht zur Synchronisation des React-States. Der Auto-Connect-Pfad triggert nur, wenn ein gespeichertes Default-Device existiert.

Capacitor-Plugin-Events (`measurement`, `connectionState`) sind „fire and forget"; Events, die emittet werden bevor JS subscribed, gehen verloren. Wenn der native Service vor dem JS-Subscribe `connectionState: "connected"` sendet, sieht der Provider das nie.

### Bug 2 — Rare-Records-Stille nach Late-Connect

Der Foreground-Service ([RadiacodeForegroundService.kt:451-512](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt)) führt beim `onConnected()`:

1. `deviceReady = false`
2. `runHandshake()`: queued `SET_EXCHANGE`, `SET_TIME`, `WR_VIRT_SFR(DEVICE_TIME, 0)` via `session.sendWrite(...)` (asynchron)
3. Setzt **sofort** `deviceReady = true`
4. `startPollLoop()` — pollt sofort `RD_VIRT_STRING(DATA_BUF)`

Hypothese: Der erste Poll wird vom Gerät verarbeitet, **bevor** der `DEVICE_TIME=0`-Cursor wirksam ist. Das Gerät liefert ab da nur Realtime-Records aus seinem laufenden Buffer. Bei einem echten Disconnect+Reconnect läuft das Timing anders, der Cursor greift, und Rare-Records fließen.

Diese Hypothese muss durch Logs bestätigt werden, bevor der Fix gebaut wird.

## Design

### Phase 1 — Sauberes Status-Mirroring

**Klare semantische Trennung:**

- `connect(device)` macht weiterhin echten BLE-Connect (inkl. Handshake auf Web-Pfad).
- **Neu:** `syncFromNative()` im Provider — fragt `RadiacodeNotification.getState()` ab und spiegelt das Ergebnis nur in den React-State. Kein BLE-Call, kein Handshake. Wenn `connected: true`, wird der Measurement-Listener registriert (`onNativeMeasurement`) und der Status auf `'connected'` gesetzt. Wenn `connected: false`, wird der Status auf `'idle'` gehalten.
- **Neu:** `adoptExistingConnection(device)` im Hook `useRadiacodeDevice` — instanziert einen `RadiacodeClient` für die bereits bestehende Verbindung und ruft nur `client.startPolling(...)`. Kein `adapter.connect()`, kein `client.connect()` (kein Handshake).

**Trigger für `syncFromNative()`:**

1. Beim Mount des Providers (ersetzt das bisherige Logging in [RadiacodeProvider.tsx:379-396](../../src/components/providers/RadiacodeProvider.tsx#L379-L396)).
2. Bei `visibilitychange` (App kommt aus dem Hintergrund).
3. Bei Klick auf neuen Refresh-Button.

**Refresh-Button:**

- Position: in [RadiacodeConnectionControls.tsx](../../src/components/pages/RadiacodeConnectionControls.tsx) neben Connect/Disconnect.
- Icon: `RefreshIcon` (MUI), Tooltip „Verbindungsstatus prüfen".
- Disabled während `connecting` / `reconnecting`. MUI-Tooltip mit `<span>`-Wrapper laut Projekt-Konvention.

### Phase 2 — Rare-Records-Diagnose und Fix

**Diagnostische Logs (immer aktiv, INFO-Level):**

- `MeasurementDecoder.parse()` ([Measurement.kt](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt)): Log mit Anzahl Realtime- und Rare-Records pro DATA_BUF-Antwort. So können wir im Logcat sehen, ob Rare-Records überhaupt im BLE-Stream auftauchen.
- `RadiacodeForegroundService.onMeasurementReceived()` ([RadiacodeForegroundService.kt](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt)): Log mit den Rare-Feldern (`dose`, `chargePct`, `temperatureC`, `durationSec`) — `null` oder Wert.

**Hypothese-basierter Fix (Poll erst nach Handshake-Settlement):**

`runHandshake()` queued Writes asynchron. Aktuell startet `startPollLoop()` sofort danach, was möglicherweise das `DEVICE_TIME=0`-Reset überfährt. Fix-Kandidat:

- Den Poll-Loop nicht direkt nach den `sendWrite`-Calls starten, sondern mit einem kleinen Delay (z.B. 200 ms) via `pollExecutor.schedule(...)`. Der erste Poll-Tick wartet damit auf das Settlement der Handshake-Writes auf dem Gerät.
- Alternativ: `seqIndex` des letzten `WR_VIRT_SFR`-Frames merken, in `onNotification` auf das ACK warten und erst dann `startPollLoop()` aufrufen. Sauberer, aber komplexer.

Wir starten mit dem Delay-Ansatz, da er klein und reversibel ist. Wenn die Logs zeigen, dass Rare-Records weiterhin nicht ankommen, gehen wir auf den ACK-Wartemechanismus.

**Caching der letzten Rare-Records:**

Selbst nach dem Fix kommen Rare-Records nur alle paar Sekunden. Damit der erste Measurement-Event nach Late-Connect / Adoption nicht „leer" ist, cached der Service den letzten gesehenen Rare-Record und hängt ihn (zusammen mit einem `cached: true`-Flag, optional) an spätere Events an, falls der aktuelle Tick keinen Rare-Record enthielt. Beim expliziten Disconnect wird der Cache geleert.

### Was wir NICHT ändern

- `connect()`/`connectRaw()` in `useRadiacodeDevice` und `RadiacodeProvider` bleiben funktional unverändert. Sie behalten ihre Semantik „echter BLE-Connect".
- Der Web-Pfad (Browser-BLE) ist unverändert.

## Komponenten-Übersicht

| Bereich | Datei | Änderung |
|---|---|---|
| Provider — Status-Sync | `src/components/providers/RadiacodeProvider.tsx` | Neue Methode `syncFromNative()` + Trigger (mount, visibilitychange, refresh). Mount-Logging entfernen. |
| Hook — Adoption | `src/hooks/radiacode/useRadiacodeDevice.ts` | Neue Methode `adoptExistingConnection(device)` ohne BLE-Connect. |
| UI — Refresh-Button | `src/components/pages/RadiacodeConnectionControls.tsx` | IconButton neben Connect/Disconnect, ruft `syncFromNative()`. |
| Native — Diagnose-Logs | `capacitor/android/.../Measurement.kt` | Log Anzahl Realtime/Rare. |
| Native — Diagnose-Logs | `capacitor/android/.../RadiacodeForegroundService.kt` | Log Rare-Felder bei `onMeasurementReceived`. |
| Native — Poll-Delay | `capacitor/android/.../RadiacodeForegroundService.kt` | Poll-Loop mit 200 ms Initial-Delay nach `runHandshake()`. |
| Native — Rare-Cache | `capacitor/android/.../RadiacodeForegroundService.kt` | In-Memory-Cache der letzten Rare-Felder, in `emitMeasurement` als Fallback verwenden. |
| Tests | `RadiacodeProvider.test.tsx`, `RadiacodeConnectionControls.test.tsx` | Vitest für Sync-Pfad und Refresh-Button. |

## Datenfluss (nach Phase 1)

```
App-Start
  └─> RadiacodeProvider mount
        └─> syncFromNative()
              └─> RadiacodeNotification.getState()
                    ├─ connected=false → status='idle' (alles bleibt wie heute)
                    └─ connected=true  → status='connected'
                                          └─> adoptExistingConnection({id, name})
                                                └─> client.startPolling()  // nur Listener
                                                      └─> onNativeMeasurement → setMeasurement
```

## Tests

**Vitest (TS):**

- `RadiacodeProvider`: Mock `RadiacodeNotification.getState` → `connected: true, deviceAddress: 'aa:bb'`. Erwartung: nach Mount ist `status === 'connected'`, `device.id === 'aa:bb'`. **Kein** Aufruf von `adapter.connect`.
- `RadiacodeProvider`: Mock `getState` → `connected: false`. Erwartung: `status === 'idle'`. Kein Auto-Connect, falls kein Default-Device.
- `RadiacodeConnectionControls`: Refresh-Button rendert, Click triggert `syncFromNative`. Disabled während `connecting`.

**Manuelle Verifikation:**

- App auf Android-Gerät installieren, Logcat-Filter auf Tag `RadiacodeFGS`/`Measurement`.
- Szenario A: App starten → Gerät einschalten → 30 s warten → prüfen, ob Rare-Felder im UI auftauchen und im Logcat Rare-Records geloggt werden.
- Szenario B: Gerät zuerst, dann App starten → prüfen, dass UI direkt „verbunden" zeigt und alle Felder sofort gefüllt sind.
- Szenario C: App im Hintergrund / Vordergrund — Status bleibt korrekt.

## Risiken

- Der Poll-Delay-Fix ist hypothesengeleitet. Wenn die Logs zeigen, dass Rare-Records auch ohne Delay nicht kommen, müssen wir einen ACK-Wartemechanismus oder ein anderes Reset-Kommando finden.
- `adoptExistingConnection` darf den vorhandenen nativen Service nicht stören. Da auf nativem Pfad `client.connect()` und `client.startPolling()` keine BLE-Writes machen (siehe [client.ts:129-143](../../src/hooks/radiacode/client.ts#L129-L143)), ist das Risiko gering.
