# Radiacode BluetoothTransport (Python → Kotlin)

**Datum:** 2026-04-27
**Branch:** `feat/radiacode-status-mirroring-and-rare-records`
**Status:** Design
**Vorgänger:** [`2026-04-27-radiacode-databuf-decoder-port-design.md`](./2026-04-27-radiacode-databuf-decoder-port-design.md)

## Ziel

Kotlin-Port der Python-Klasse `radiacode.transports.bluetooth.Bluetooth` als
eigenständige Transport-Klasse. Sie hält die GATT-Session selbst, spiegelt
die Python-API 1:1 und löst dabei das Concurrency-Problem der bestehenden
Implementierung: parallele `execute()`-Aufrufe können sich nicht mehr
gegenseitig die Antwort wegnehmen.

`GattSession` bleibt **unverändert**. Der `RadiacodeForegroundService` wird
in diesem Schritt **nicht migriert** — der neue Transport existiert
parallel.

## Nicht-Ziele

- Migration von `RadiacodeForegroundService.runHandshake` /
  `writeAndWaitForAck` auf den neuen Transport.
- Refactor von `GattSession` (kommt in einem späteren Schritt).
- Auto-Reconnect / Backoff: bei Disconnect ist die Transport-Instanz tot
  (1:1 Python). Aufrufer erzeugt bei Bedarf eine neue Instanz.
- Spektrum-Decoding (lebt im DataBufDecoder bzw. im TS-Client).

## Concurrency-Problem (Motivation)

Die bestehende Implementierung im `RadiacodeForegroundService` nutzt eine
**globale** `ackLock` + `lastAckedSeq`-Variable. Wenn zwei Caller
gleichzeitig in `writeAndWaitForAck` warten, sehen beide die gleiche
Variable — der erste eintreffende ACK weckt beide, einer bekommt fälschlich
„seine" Antwort. Plus: der `Reassembler` ist single-instance, und überlappende
Antworten würden sich im Buffer interleaven.

Die Python-Klasse hat dieses Problem nicht, weil sie strikt synchron ist:
`execute()` blockiert bis zur Antwort, und solange läuft kein zweiter Call.
Die GIL serialisiert implizit.

In Kotlin lösen wir das mit `ReentrantLock.withLock` um den gesamten
`execute()`-Body — pro Aufruf wird der interne Reassembler-State
zurückgesetzt, kein State-Leak zwischen Calls.

## Architektur

### Paketstruktur

```
at.ffnd.einsatzkarte.radiacode/
  transport/
    BluetoothTransport.kt     ← public Klasse, spiegelt Python API
    BleIo.kt                  ← internal interface
    AndroidBleIo.kt           ← internal Android-spezifische Implementation
    Exceptions.kt             ← DeviceNotFound, ConnectionClosed, TransportTimeout
```

### Public API (1:1 Python)

```kotlin
class BluetoothTransport(
    ctx: Context,
    deviceAddress: String,
    maxChunk: Int = 18,
    defaultTimeoutMs: Long = 10_000L,
    connectTimeoutMs: Long = 15_000L,
) {
    // = Python __init__: blockiert bis Verbindung steht & Notifications subscribed.
    // wirft DeviceNotFound bei MAC-Fehler, fehlender Service-UUID oder Connect-Timeout.

    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun execute(req: ByteArray, timeoutMs: Long = defaultTimeoutMs): BytesBuffer
    // = Python execute(req): chunked write + sync wait auf Reassembly-Ergebnis.

    fun close()
    // = Python close(): disconnect + cleanup; weckt wartende execute()-Caller.
}
```

### Mapping Python → Kotlin

| Python                                       | Kotlin                                                    |
|----------------------------------------------|-----------------------------------------------------------|
| `Peripheral(mac)`                            | `BluetoothManager.adapter.getRemoteDevice(mac).connectGatt(...)` |
| `BTLEDisconnectError` beim Connect           | `DeviceNotFound`                                          |
| `getServiceByUUID(...)`                      | `gatt.getService(SERVICE_UUID)` in `onServicesDiscovered` |
| `getCharacteristics(...)`                    | `service.getCharacteristic(WRITE_UUID/NOTIFY_UUID)`       |
| `writeCharacteristic(notify_fd+1, b'\x01\x00')` | CCCD descriptor write `ENABLE_NOTIFICATION_VALUE`     |
| `handleNotification(chandle, data)`          | private `handleNotification(bytes)`, gerufen aus `BluetoothGattCallback.onCharacteristicChanged` |
| `_resp_buffer / _resp_size`                  | `assembling: ByteArray? / remaining: Int / writeOff: Int` |
| `execute(req)` — chunked write               | `for (off in 0 until req.size step maxChunk) ...`         |
| `execute(req)` — `waitForNotifications` loop | `Condition.awaitNanos(remaining)`                         |
| `_closing` flag                              | `@Volatile var closing: Boolean`                          |
| `close()` + `time.sleep(0.1)`                | `gatt.disconnect(); gatt.close()` + `signalAll()` — kein Sleep |
| `DeviceNotFound`, `ConnectionClosed`         | gleichnamige Exception-Klassen                            |
| `TimeoutError`                               | `TransportTimeout`                                        |

### Was zusätzlich zur Python-Vorlage hinzukommt

Notwendige Erweiterungen, weil Android nicht 1:1 wie bluepy funktioniert:

- **`ReentrantLock` um `execute()`** — serialisiert parallele Caller.
- **MTU-Request** (`requestMtu(250)`) vor `discoverServices()` — Android-spezifisch.
- **Synchrone Connect-Sequenz im `init`-Block** — Android-GATT ist
  callback-basiert, wir blockieren via `Condition` bis CCCD-Write
  abgeschlossen ist (oder Timeout).

### Test-Hook: internes `BleIo`-Interface

Damit Tests ohne Robolectric auskommen, trennen wir die BLE-I/O-Schicht
hinter einem `internal` Interface. Die öffentliche API bleibt 1:1
Python-spiegelnd; das Interface ist außerhalb des Pakets unsichtbar.

```kotlin
internal interface BleIo {
    fun connect(
        notificationListener: (ByteArray) -> Unit,
        connectionLostListener: () -> Unit,
        connectTimeoutMs: Long,
    )                                                  // wirft DeviceNotFound
    fun write(bytes: ByteArray)                        // wirft ConnectionClosed
    fun close()
}

internal class AndroidBleIo(
    private val ctx: Context,
    private val deviceAddress: String,
) : BleIo {
    // Hier lebt der gesamte Android-Stack: BluetoothManager, BluetoothGatt,
    // BluetoothGattCallback, MTU-Request, Service-Discovery, CCCD-Write.
    // Wird nur am echten Gerät verifiziert.
}
```

`BluetoothTransport` hat zwei Konstruktoren:

```kotlin
class BluetoothTransport private constructor(
    private val io: BleIo,
    private val maxChunk: Int,
    private val defaultTimeoutMs: Long,
    connectTimeoutMs: Long,
) {
    // Production: erzeugt internes AndroidBleIo
    constructor(
        ctx: Context, deviceAddress: String,
        maxChunk: Int = 18, defaultTimeoutMs: Long = 10_000L,
        connectTimeoutMs: Long = 15_000L,
    ) : this(AndroidBleIo(ctx, deviceAddress), maxChunk, defaultTimeoutMs, connectTimeoutMs)

    // Test: nimmt FakeBleIo direkt
    @VisibleForTesting
    internal constructor(
        io: BleIo, maxChunk: Int = 18, defaultTimeoutMs: Long = 10_000L,
        connectTimeoutMs: Long = 1_000L,
    ) : this(io, maxChunk, defaultTimeoutMs, connectTimeoutMs)
}
```

### Datenfluss

```
   Aufrufer ──connect()──▶ BluetoothTransport ──connect()──▶ BleIo
                                │                              │
              execute(req) ────▶│ ReentrantLock                │
                                │ Reassembler reset            │
                                │ for chunk in req: ──write()──▶│
                                │ awaitNanos auf Condition     │
                                                               │
                                ◀────notification(bytes)───────│
                                │ handleNotification ──▶
                                │ Reassembly                   │
                                │ if complete: signalAll       │
              ◀── BytesBuffer───│
```

### Fehlerverhalten

| Situation                                    | Verhalten                                  |
|----------------------------------------------|--------------------------------------------|
| Konstruktor: ungültige MAC                   | `DeviceNotFound`                           |
| Konstruktor: Connect-Timeout                 | `DeviceNotFound`                           |
| Konstruktor: Service nicht gefunden          | `DeviceNotFound`                           |
| `execute()` nach `close()`                   | `ConnectionClosed`                         |
| `close()` während `execute()` wartet         | `ConnectionClosed`                         |
| Disconnect während `execute()` wartet        | `ConnectionClosed`                         |
| `execute()`-Timeout (kein Response in `timeoutMs`) | `TransportTimeout`                  |
| Notification mit < 4 Byte als 1. Chunk       | ignoriert (Reassembler bleibt im 0-Zustand) |
| Notification mit deklarierter Länge ≤ 0      | ignoriert                                  |
| Notification mit mehr Bytes als deklariert   | auf deklarierte Länge gekappt              |

Logging via `android.util.Log` mit Tag `RadiacodeBT`. Konsistenz mit
`GattSession` (Tag `RadiacodeGatt`) und `MeasurementDecoder`.

## Tests (TDD-Reihenfolge)

Tests werden **vor** der Implementierung geschrieben. Nur die Protokoll-
Logik wird unit-getestet — `AndroidBleIo` läuft nur am echten Gerät.

Test-Doppel: `FakeBleIo` implementiert `BleIo`, speichert
`writtenChunks` für Assertions, hat `injectNotification(bytes)` zum
Steuern eingehender Daten und `simulateDisconnect()`.

### `BluetoothTransportTest`

1. **Connect**: Konstruktor ruft `io.connect(...)` und blockiert bis
   `notificationListener` registriert ist (Fake signalisiert sofort).
2. **Connect-Timeout**: `FakeBleIo` signalisiert nicht → `DeviceNotFound`
   nach `connectTimeoutMs`.
3. **Chunked Write**: `execute(40-Byte-Frame)` → drei `io.write`-Calls
   mit Längen 18, 18, 4.
4. **Single-Notification-Response**: `[len_le32=8, ...8 bytes payload]`
   → `BytesBuffer` mit den 8 Payload-Bytes (ohne Längen-Prefix).
5. **Multi-Notification-Reassembly**: 3 Chunks, die zusammen einen Frame
   ergeben → `BytesBuffer` mit allen Payload-Bytes konkateniert.
6. **Timeout**: keine Notification → `TransportTimeout` nach `timeoutMs`.
7. **`close()` während `execute()` wartet**: zweiter Thread ruft
   `close()` → `execute()` wirft `ConnectionClosed`.
8. **`execute()` nach `close()`**: → `ConnectionClosed`.
9. **Disconnect während `execute()` wartet**: `FakeBleIo` ruft
   `connectionLostListener` → `execute()` wirft `ConnectionClosed`.
10. **Concurrent execute()**: zwei Threads rufen gleichzeitig `execute()`.
    Erster bekommt seine Response, zweiter wartet bis erster fertig ist
    und bekommt dann seine Response. Reihenfolge der Notifications
    matcht Reihenfolge der Calls.
11. **Reset zwischen Calls**: nach Call A landet eine späte
    „Geister"-Notification (z.B. Push-Event) nach `signalAll`. Call B
    soll davon nicht beeinflusst werden — der Reassembler-State wird zu
    Beginn von Call B reset.
12. **< 4 Byte als 1. Notification-Chunk**: Reassembler bleibt im
    0-Zustand, `execute()` wartet weiter.
13. **Negative deklarierte Länge**: ignoriert.
14. **Notification mit mehr Bytes als deklariert**: Frame wird auf die
    deklarierte Länge gekappt, Rest verworfen.
15. **Default Timeout-Wert**: `execute()` ohne `timeoutMs`-Argument
    nutzt `defaultTimeoutMs` (10s) — Test mit kurz konfiguriertem
    Default verifiziert das.
16. **`execute()` mit leerem Request**: → keine `io.write`-Calls,
    Verhalten: wartet trotzdem auf Response (Python-1:1: `range(0, 0, 18)`
    iteriert nicht). Edge-Case dokumentiert.

### Coverage-Ziel

100% Lines/Branches in `BluetoothTransport`. `AndroidBleIo` und die
Android-spezifischen Klassen sind ausgeschlossen.

## Build / CI

- JUnit4 ist bereits konfiguriert.
- Tests laufen über `cd capacitor/android && ./gradlew :app:testDebugUnitTest`.
- Keine neuen Dependencies. `BluetoothGatt` und `BluetoothManager` sind
  Teil des Android-SDK; `kotlinx.coroutines` wird **nicht** eingeführt.
- `androidx.annotation:annotation` für `@VisibleForTesting` ist in den
  bereits vorhandenen androidx-Dependencies enthalten (transitiv).

## Migration-Pfad (zukünftig, nicht in diesem Schritt)

1. `RadiacodeForegroundService.runHandshake` auf `transport.execute(...)`
   umstellen — der `writeAndWaitForAck`-Code wird obsolet.
2. Polling-Loop in `pollTick` auf `transport.execute(...)` umstellen.
3. `GattSession` entfernen oder als dünnen Adapter behalten, der intern
   den Transport nutzt.

## Risiken

- **Android-GATT Asynchronität in `init {}`-Block**: Wir blockieren den
  aufrufenden Thread bis CCCD-Write abgeschlossen ist. Das darf nicht
  vom Main-Thread aus aufgerufen werden — Aufrufer-Pflicht. Wird in
  KDoc-Comment dokumentiert.
- **`AndroidBleIo` ohne Unit-Test**: Bewusste Entscheidung. Risiko durch
  manuelle Verifikation am Gerät und durch dünne Klasse minimiert.
- **`BleIo` als `internal`**: Wenn der `RadiacodeForegroundService` später
  die Klasse nutzt, ist er im selben Modul — Visibility passt. Falls wir
  je einen Test in einem anderen Modul brauchen, müssen wir `BleIo`
  auf `public` heben.

## Offene Punkte

- **Reassembler-Reset bei späten Notifications**: Wenn Call A schon
  `signalAll` bekommen hat und der Caller bereits zurück ist, kann eine
  weitere Notification reinkommen, bevor Call B startet. Der Test 11
  deckt das ab — Reset zu Beginn von Call B.
- **Frame-Mapping für seq-Tracking**: Da Mutex die Calls serialisiert,
  brauchen wir kein seq-Matching. Falls das Gerät spontane Push-Events
  schickt während kein `execute()` läuft, gehen die in den Reassembler
  und werden beim nächsten Call resettet. Akzeptabel — Python hat das
  Problem auch und löst es ebenso.
