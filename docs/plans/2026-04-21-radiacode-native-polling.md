# Radiacode Native Polling (Phase 2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Final
> `npm run check` nur am Ende. Wenige Commits (eine logische Gruppe pro
> Commit, ~3–5 Commits total).

**Goal:** Radiacode-BLE-Session + Messwert-Polling laufen auch bei
gesperrtem Bildschirm / Hintergrund-App zuverlässig weiter. Phase 1 hat den
`PARTIAL_WAKE_LOCK` + UI-Indikator gebracht — empirisch bestätigt (Feldtest
2026-04-21), dass Chromium trotz WakeLock `setTimeout` im WebView drosselt
und die BLE-Verbindung nach ~2 min idle disconnect'et. Sobald die App wieder
im Vordergrund ist, greift der bestehende Auto-Reconnect sofort. Der Fix
muss den Polling-Takt aus dem WebView herausziehen.

**Architektur-Entscheidung:** Native Ownership des BLE-Links beim
`RadiacodeForegroundService`. Kotlin implementiert genug vom
Radiacode-Protokoll, um `DATA_BUF` zu pollen und Messwerte zu dekodieren;
das Ergebnis wird via Capacitor-Plugin-Event an den WebView geschickt.
Spektrum- und Settings-Befehle bleiben im TS-Client — sie werden nur im
Vordergrund benutzt, wo JS ohnehin läuft, und brauchen den nativen Pfad
nicht. Wenn beides gleichzeitig aktiv wäre, gäbe es zwei `BluetoothGatt`-
Clients auf demselben Gerät → Konflikt. Daher übernimmt der native Pfad
die Session **exklusiv**, sobald der Foreground Service läuft; der TS-Client
wird in diesem Modus zum Passthrough (sendet Commands via Plugin statt
direkt über `@capacitor-community/bluetooth-le`).

**Scope-Begrenzung (lean):**

- Nativ **nur**: Framing/Queue, `SET_EXCHANGE`, `SET_TIME`, `RD_VIRT_STRING(DATA_BUF)`-Polling, Measurement-Decoder, BluetoothGatt-Lifecycle inkl. Reconnect-Backoff. Kein Port von Spektrum, Settings, Device-Info, Dose-Reset usw.
- Spektrum/Settings laufen weiter über den bestehenden TS-Client, aber über einen **Plugin-Bridge**-Pfad: TS sendet Write-Payloads per `RadiacodeNative.write(bytes)`, empfängt Notifications per Event. Der TS-Protokoll-Code (`protocol.ts`) bleibt unverändert — nur der Transport tauscht.
- Die Polling-Logik in `client.ts` wird deaktiviert, wenn der native Pfad aktiv ist. Messwerte kommen dann aus einem Plugin-Event (`measurement`), nicht aus dem TS-Poll-Loop.

**Risiken & Fallbacks:**

- **Zwei BLE-Clients kollidieren:** Wenn der native Code die Session öffnet und `@capacitor-community/bluetooth-le` parallel `connect()` aufruft, gibt Android einen Fehler. → Der BLE-Adapter muss auf Android so abgeändert werden, dass er bei aktivem Native-Pfad **nicht selbst connected**, sondern den Zustand vom Plugin bezieht.
- **Notification-Fan-out:** Jede eingehende GATT-Notification muss an zwei Ziele: den nativen Polling-Decoder und den TS-Passthrough-Empfänger (für Spektrum/Settings-Antworten). Lösung: nativ alle Notifications ins Plugin-Event `notification` pushen; der TS-`protocol.ts`-Reassembler frisst sie wie gehabt, der native Decoder verarbeitet parallel nur seine eigene Poll-Antwort (per Sequence-Nummer-Match).

**Tech Stack:** Kotlin 1.9+ (Android), Capacitor 8 Plugin-API,
TypeScript, Vitest, React, MUI. Kein JUnit-Setup im Android-Projekt —
Kotlin-Code wird über die TS-Integrationstests indirekt verifiziert,
manuelle Verifikation auf Gerät ist Pflicht.

**Kontext für Agent:**

- Root: `/Users/paul/Documents/Feuerwehr/hydranten-map`
- Parent-Branch: `feat/radiacode-via-bluetooth`
- Arbeite in Worktree `.worktrees/radiacode-native-polling` (bereits
  angelegt, `.env.local` kopiert). `npm install` ist **nicht** nötig,
  solange keine neuen TS-Deps dazukommen — das Parent-Worktree hat schon
  `node_modules` via symlink'd pnpm-cache? Nein → falls `npx`/`vitest`
  nicht findet, einmal `npm install`.
- Vor jedem Commit: `git checkout -- next-env.d.ts`.
- Commit-Messages: Conventional Commits
  (`feat(radiacode-native): …`).
- Relevante Dateien:
  - `src/hooks/radiacode/protocol.ts` (Framing/Decoder — Referenz zum Portieren)
  - `src/hooks/radiacode/client.ts` (TS-Client — muss konditional den Native-Pfad benutzen)
  - `src/hooks/radiacode/bleAdapter.capacitor.ts` (BLE-Adapter — muss auf Native-Pfad umschalten)
  - `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.java` (bestehend — wird erweitert um BluetoothGatt-Ownership, ggf. zu Kotlin migriert)
  - `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java` (bestehend — wird erweitert um Plugin-Methoden/Events für den nativen Pfad)

---

## Task 1: Kotlin — Protokoll-Core + BluetoothGatt-Session

**Ein Commit.** Gesamte native Infrastruktur in einem Rutsch. Kein
Teil-Merge sinnvoll, da sich die Komponenten gegenseitig brauchen.

**Files (alle neu, Kotlin):**

- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Protocol.kt`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Framing.kt`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/GattSession.kt`

Bestehend, zu Kotlin migriert + erweitert:

- `RadiacodeForegroundService.java` → `RadiacodeForegroundService.kt`

**Protocol.kt — Konstanten:**

Aus `src/hooks/radiacode/protocol.ts` portieren:

- Service-UUID `e63215e5-7003-49d8-96b0-b024798fb901`
- Write-Char `…e6` / Notify-Char `…e7`
- `COMMAND.RD_VIRT_STRING = 0x02`, `COMMAND.SET_EXCHANGE = 0x07`,
  `COMMAND.SET_TIME = 0x05`, `COMMAND.WR_VIRT_SFR = 0x09`
- `VS.DATA_BUF = 0x0000000b`, `VSFR.DEVICE_TIME = 0x00000080`

Nur diese Konstanten — keine Settings/Spektrum-Konstanten.

**Framing.kt — Write-Chunking + Reassembly:**

TS-Referenz in `protocol.ts`: `encodeRequest`, `ResponseReassembler`.

- `encodeRequest(seq: Int, command: Int, args: ByteArray): ByteArray` — Header `[len_u32_le][seq_u8][cmd_u8][args…]` und Chunking auf MTU-19 Bytes.
- Klasse `Reassembler` mit `onChunk(bytes: ByteArray): ByteArray?` — gibt kompletten Response-Payload zurück, sobald Längen-Prefix erfüllt.
- Unit-Test **nicht nötig** — indirekt über Feldtest verifiziert, und TS hat Äquivalent-Tests.

**Measurement.kt — Rare-Data-Decoder:**

TS-Referenz: `extractLatestMeasurement` in `client.ts`.

- Eingabe: `ByteArray` (kompletter `RD_VIRT_STRING(DATA_BUF)`-Response).
- Parse: Paket-Stream, suche nach `RareData`-Paket (Type `0x80 0x01`), extrahiere `timestamp`, `doserate_uR_h`, `cps`, `dose_uR`.
- Ausgabe: Nullable `Measurement(timestampMs: Long, dosisleistungUSvH: Double, cps: Int, doseUSv: Double)`.
- Wichtig: `timestampMs = System.currentTimeMillis()` (nicht der Gerätetimer — Phase 1 verwendet auch `Date.now()` beim Client).

**GattSession.kt — BLE-Lifecycle:**

- Klasse `GattSession(ctx: Context, deviceAddress: String, listener: SessionListener)` mit Methoden `connect()`, `disconnect()`, `sendWrite(bytes: ByteArray)`.
- `SessionListener`: `onConnected()`, `onDisconnected()`, `onNotification(bytes: ByteArray)`.
- Intern: `BluetoothGatt`-Client, MTU-Request 250, Service-Discovery, Notify-Subscribe auf `…e7`, Write-Queue für `…e6` (Write-Without-Response aber seriell — pro ACK nächsten Chunk).
- **Auto-Reconnect:** bei `onConnectionStateChange(status != 0 || newState == DISCONNECTED)` → exponentielles Backoff (1s, 2s, 4s, 8s, max 30s), unbegrenzt solange Service aktiv. Bei jedem neuen Connect: Session-Handshake (`SET_EXCHANGE`, `SET_TIME`, `WR_VIRT_SFR(DEVICE_TIME=0)`) neu ausführen und dann Polling wiederaufnehmen.

**RadiacodeForegroundService.kt — Ownership + Polling:**

Ersetzt die bestehende Java-Datei (`git mv` → umbenennen, Inhalt ersetzen). Bestehende Aktionen (`ACTION_START`, `ACTION_UPDATE`, `ACTION_STOP`, `ACTION_DISCONNECT_REQUESTED`) bleiben erhalten. Neu:

- `ACTION_BLE_CONNECT` mit Extra `EXTRA_DEVICE_ADDRESS` — ruft `GattSession.connect()`, startet Polling-Loop via `ScheduledExecutorService.scheduleAtFixedRate(…, 500 ms)`. Jeder Tick: `encodeRequest(seq++, RD_VIRT_STRING, u32le(DATA_BUF))` → `gatt.sendWrite`. Die Antwort läuft durch den `Reassembler`; matched die Sequence → `Measurement.parse` → Plugin-Event `measurement`.
- `ACTION_BLE_WRITE` mit Extra `EXTRA_PAYLOAD` (bytes) — Passthrough vom TS-Client für Spektrum/Settings. Einfach `gatt.sendWrite(payload)` ausführen.
- `ACTION_BLE_DISCONNECT` — `GattSession.disconnect()`, Polling-Executor shutdown.
- WakeLock-Verhalten aus Phase 1 bleibt.

Alle Notifications werden 1:1 per Plugin-Event `notification` (Parameter `bytes: base64`) an den WebView weitergeleitet, zusätzlich vom Polling-Decoder konsumiert.

**Verification (innerhalb des Commits):**

Build grün:

```bash
cd capacitor && npm run sync && cd android && ./gradlew assembleDebug --no-daemon
```

---

## Task 2: Capacitor-Plugin-Erweiterung + TS-Bridge

**Ein Commit.** Java-Plugin-Seite + TS-Adapter gehören zusammen.

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java` (bleibt Java — minimale Erweiterung)
- Create: `src/hooks/radiacode/nativeBridge.ts`
- Modify: `src/hooks/radiacode/bleAdapter.capacitor.ts`
- Modify: `src/hooks/radiacode/client.ts`

**Plugin-Methoden:**

- `@PluginMethod connectNative(call)` — liest `deviceAddress`, schickt `ACTION_BLE_CONNECT` an den Service.
- `@PluginMethod writeNative(call)` — liest `payload` (base64), schickt `ACTION_BLE_WRITE`.
- `@PluginMethod disconnectNative(call)` — `ACTION_BLE_DISCONNECT`.
- Plugin-Events registriert durch den Service via statische Methode `RadiacodeNotificationPlugin.emitMeasurement(m)` / `emitNotification(bytes)` / `emitConnectionState(state)`.

**nativeBridge.ts:**

Wrapper um den Plugin. Exportiert typisierte Funktionen:

```ts
export async function nativeConnect(deviceAddress: string): Promise<void>;
export async function nativeWrite(payload: Uint8Array): Promise<void>;
export async function nativeDisconnect(): Promise<void>;
export function onNativeMeasurement(h: (m: RadiacodeMeasurement) => void): Unsubscribe;
export function onNativeNotification(h: (bytes: Uint8Array) => void): Unsubscribe;
export function onNativeConnectionState(h: (s: 'connected' | 'disconnected' | 'reconnecting') => void): Unsubscribe;
export function isNativeAvailable(): boolean; // true nur auf Android via Capacitor
```

**bleAdapter.capacitor.ts-Änderung:**

Wenn `isNativeAvailable()`: `connect()` ruft `nativeConnect()` statt `BleClient.connect()`, `write()` ruft `nativeWrite()`, `onNotification()` registriert sich auf `onNativeNotification()`. Der vorhandene Web-Adapter bleibt unverändert.

**client.ts-Änderung:**

In `startPolling`: prüfe `isNativeAvailable()`. Falls ja → subscribe auf
`onNativeMeasurement(onMeasurement)` statt eigenen `setTimeout`-Loop. Bei
`stopPolling`: Unsubscribe. Das ist die **Kern-Entkopplung**: der
TS-Polling-Loop existiert nur noch als Fallback für Web/iOS.

Die Session-Init (`SET_EXCHANGE`, `SET_TIME`, `WR_VIRT_SFR(DEVICE_TIME)`)
wird auf Android ebenfalls übersprungen — der native Service hat das schon
beim Connect gemacht.

---

## Task 3: Tests + manuelle Verifikation

**Ein Commit.** TS-Tests für den neuen Bridge-Pfad + Update der bestehenden
Tests, falls sie durch Signatur-Änderungen brechen.

**Files:**

- Modify: `src/hooks/radiacode/client.test.ts` — sicherstellen, dass der Web-Fallback weiterhin funktioniert, plus ein neuer Test, der via `vi.mock('./nativeBridge')` den Android-Pfad simuliert und prüft, dass `startPolling` keinen `setTimeout` startet, sondern auf die Bridge-Events subscribed.
- Modify: `src/components/providers/RadiacodeProvider.test.tsx` — falls nötig (vermutlich nicht, da Provider über den Adapter geht).

**Manuelle Verifikation** (bleibt Pflicht, **kein Commit wenn rot**):

1. Debug-APK bauen + installieren: `cd capacitor && npm run build:debug && adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
2. Radiacode verbinden (Dosimetrie-Seite reicht — kein Track nötig).
3. Bildschirm sperren, **5 Minuten warten**.
4. Entsperren, App wieder öffnen.
5. Prüfen:
   - Kein „Letzte Messung vor …"-Warnhinweis (oder Wert <5s).
   - BLE-Verbindung noch aktiv (Dosimetrie zeigt aktuelle CPS).
   - `adb logcat | grep RadiacodeFg` zeigt kontinuierliches Polling (alle ~500 ms ein Log-Zeile).

Falls 5-min-Test grün: weiter auf 30 min. Falls auch grün: Done.

Ergebnis-Notiz reicht als Kommentar im Merge-Commit, eigener Results-Doc
ist nicht nötig (lean).

---

## Task 4: Check + Merge

**Ein Commit** (Merge-Commit in Parent via `--no-ff`).

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/radiacode-native-polling
git checkout -- next-env.d.ts
NO_COLOR=1 npm run check
```

Expected: **PASS**. Bei Rot — Ursache fixen, keinen Commit mit Fehlern.

Dann:

```bash
git push -u origin feat/radiacode-native-polling
cd /Users/paul/Documents/Feuerwehr/hydranten-map
git checkout feat/radiacode-via-bluetooth
git merge --no-ff feat/radiacode-native-polling \
  -m "feat(radiacode): natives polling im foreground service"
git push
git worktree remove .worktrees/radiacode-native-polling
git branch -d feat/radiacode-native-polling
```

---

## Definition of Done

- [ ] Kotlin `GattSession` + Polling-Executor im Foreground Service.
- [ ] Plugin-Methoden `connectNative`/`writeNative`/`disconnectNative` + Events `measurement`/`notification`/`connectionState`.
- [ ] TS-Bridge `nativeBridge.ts`; `bleAdapter.capacitor.ts` + `client.ts` routen auf Android über die Bridge.
- [ ] `npm run check` grün.
- [ ] Manueller 5-min-Lock-Test zeigt durchgängige Samples.
- [ ] Gemerged in `feat/radiacode-via-bluetooth`, Worktree entfernt.

## Out of Scope

- Port von Settings/Spektrum-/Device-Info-Commands nach Kotlin (bleibt TS).
- iOS-Support für den Native-Pfad (iOS-Capacitor-Plugin hat eigene
  Hintergrund-Mechanik; würde ein Swift-Pendant brauchen — separater Plan).
- Strukturelle Migration aller Java-Dateien nach Kotlin (nur
  `RadiacodeForegroundService` wird migriert, weil Co-Location mit neuen
  Kotlin-Modulen sinnvoll ist).
