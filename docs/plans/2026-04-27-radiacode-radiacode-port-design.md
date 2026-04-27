# Radiacode `radiacode.py` (Python → Kotlin) + Service-Migration

**Datum:** 2026-04-27
**Branch:** `feat/radiacode-status-mirroring-and-rare-records`
**Status:** Design
**Vorgänger:** [`2026-04-27-radiacode-bluetooth-transport-design.md`](./2026-04-27-radiacode-bluetooth-transport-design.md)

## Ziel

Vollständiger 1:1-Port der Python-Klasse `radiacode.RadiaCode` als Kotlin-Klasse,
inklusive aller Public-Methoden (Settings, Spectrum, Alarm-Limits, Batch-VSFR-
Reads). Im selben Schritt: Migration des `RadiacodeForegroundService` auf den
neuen Stack (`BluetoothTransport` + `RadiaCode`), wodurch die buggy
`writeAndWaitForAck`-Mechanik (globaler `ackLock`/`lastAckedSeq`) entfällt.

Die im Vorschritt geschaffenen Bausteine (`BluetoothTransport`, `BytesBuffer`,
`Command`/`Vs`/`Vsfr`/`Ctrl`/`DisplayDirection`-Enums, alle `types/`-Datenklassen,
`DataBufDecoder`) werden direkt benutzt.

## Nicht-Ziele

- USB-Transport: Android-Apps connecten ausschließlich über BLE.
- `RadiaCode`-Klasse als Public-Library-API exponieren — bleibt in derselben
  Modul-Visibility wie der Service.

## Geklärte Fragen

| Frage | Entscheidung |
|---|---|
| Scope der zu portierenden Methoden | Vollständiger 1:1-Port aller Python-Methoden |
| Migration des ForegroundService | Im selben Schritt — `RadiaCode`-Klasse parallel ungenutzt liegen zu lassen wäre toter Code |
| Test-Tiefe | Volle Coverage — Test pro Public-Methode, Wire-Level-Asserts gegen `FakeTransport` |
| Architektur | `Transport`-Interface + typisierter `VsfrFormat` (sealed class) — schließt den bestehenden TODO im `Vsfr.kt`-File |

## Architektur

### Paketstruktur

```
at.ffnd.einsatzkarte.radiacode/
  RadiaCode.kt                          ← NEU, public Klasse, 1:1 Python-Port
  RadiaCodeException.kt                 ← NEU, typisierte Exceptions (ersetzen Python-Asserts)
  transport/
    Transport.kt                        ← NEU, internal interface
    BluetoothTransport.kt               ← bestehend, implementiert jetzt Transport
    BleIo.kt, AndroidBleIo.kt, Exceptions.kt  ← unverändert
  protocol/
    Command.kt, Vs.kt, Ctrl.kt, DisplayDirection.kt, BytesBuffer.kt  ← unverändert
    Vsfr.kt                             ← geändert: format: String? → format: VsfrFormat?
    VsfrFormat.kt                       ← NEU, sealed class mit decode(u32: Int)
  decoders/
    DataBufDecoder.kt, DataBufRecord.kt  ← unverändert
    SpectrumDecoder.kt                  ← NEU, Port von decoders/spectrum.py
  types/                                ← alle unverändert
```

**Wegfallend** (Service nutzt nach Migration den neuen Stack):

- `radiacode/Framing.kt` (Reassembler/Framing/parseResponse)
- `radiacode/GattSession.kt`
- `radiacode/Protocol.kt` (alle Konstanten existieren bereits typisiert in `protocol/`)
- `radiacode/Measurement.kt` und `MeasurementDecoder` — sofern keine externen
  Caller bleiben (während Implementation prüfen)

### Public API von `RadiaCode` (1:1 Python)

```kotlin
class RadiaCode private constructor(
    private val transport: Transport,
    ignoreFirmwareCompatibilityCheck: Boolean,
) {
    // Production-Konstruktor: erzeugt internes BluetoothTransport.
    constructor(
        ctx: Context,
        bluetoothMac: String,
        ignoreFirmwareCompatibilityCheck: Boolean = false,
    )

    // Test-Hook: nimmt Transport direkt.
    @VisibleForTesting
    internal constructor(
        transport: Transport,
        ignoreFirmwareCompatibilityCheck: Boolean = false,
    )

    fun baseTime(): Instant
    fun close()

    // Low-level Protocol Helpers
    fun execute(reqType: Command, args: ByteArray? = null): BytesBuffer
    fun readRequest(commandId: Int): BytesBuffer            // Overloads: (Vs), (Vsfr)
    fun writeRequest(commandId: Int, data: ByteArray? = null) // Overload: (Vsfr, ByteArray?)
    fun batchReadVsfrs(vsfrIds: List<Vsfr>): List<Any>      // Mixed Int/Float/Boolean per VsfrFormat
    fun status(): String
    fun setLocalTime(dt: LocalDateTime)
    fun fwSignature(): String
    fun fwVersion(): Pair<FwVersion, FwVersion>             // (boot, target)
    fun hwSerialNumber(): String                            // hex-Gruppen mit "-"
    fun configuration(): String                             // cp1251-decoded
    fun textMessage(): String                               // ascii
    fun serialNumber(): String                              // ascii
    fun commands(): String                                  // ascii (SFR_FILE)
    fun deviceTime(v: Int)                                  // Initial 0
    fun dataBuf(): List<DataBufRecord>                      // → DataBufDecoder
    fun spectrum(): Spectrum                                // → SpectrumDecoder
    fun spectrumAccum(): Spectrum                           // → SpectrumDecoder
    fun doseReset()
    fun spectrumReset()
    fun energyCalib(): List<Float>
    fun setEnergyCalib(coef: List<Float>)
    fun setLanguage(lang: String = "ru")
    fun setDeviceOn(on: Boolean)
    fun setSoundOn(on: Boolean)
    fun setVibroOn(on: Boolean)
    fun setSoundCtrl(ctrls: List<Ctrl>)
    fun setVibroCtrl(ctrls: List<Ctrl>)
    fun setDisplayOffTime(seconds: Int)
    fun setDisplayBrightness(brightness: Int)
    fun setDisplayDirection(direction: DisplayDirection)
    fun getAlarmLimits(): AlarmLimits
    fun setAlarmLimits(
        l1CountRate: Double? = null, l2CountRate: Double? = null,
        l1DoseRate: Double? = null,  l2DoseRate: Double? = null,
        l1Dose: Double? = null,      l2Dose: Double? = null,
        doseUnitSv: Boolean? = null, countUnitCpm: Boolean? = null,
    ): Boolean

    companion object {
        fun spectrumChannelToEnergy(channel: Int, a0: Float, a1: Float, a2: Float): Float
    }
}

data class FwVersion(val major: Int, val minor: Int, val date: String)
```

**Sequenz-Verwaltung:** `seq` ist privater Counter `0..31`,
`req_seq_no = 0x80 + seq` exakt wie Python. `execute()` baut Header `<HBB>`
(cmd_u16, reserved=0, seq), prepended `<I>` Längen-Prefix, ruft
`transport.execute()`, vergleicht 4-Byte Echo-Header, gibt `BytesBuffer` mit
Body zurück.

**`_spectrum_format_version`:** wird im Init aus `configuration()` gescannt
(`SpecFormatVersion=…`-Zeile), Fallback `0`.

### Neue interne Komponenten

#### `Transport` interface

```kotlin
internal interface Transport {
    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun execute(req: ByteArray, timeoutMs: Long = 10_000L): BytesBuffer
    fun close()
}
```

`BluetoothTransport` bekommt `: Transport`. Keine Verhaltensänderung — nur
Interface-Implementation.

#### `VsfrFormat` sealed class

```kotlin
sealed class VsfrFormat {
    abstract fun decode(u32: Int): Any  // Int / Float / Boolean

    object U32        : VsfrFormat()  // "I"   → Int (für relevante Bereiche darstellbar)
    object I32        : VsfrFormat()  // "i"   → Int (signed)
    object F32        : VsfrFormat()  // "f"   → Float (Float.fromBits)
    object ThreeXBool : VsfrFormat()  // "3x?" → Boolean (top byte des u32)
    object ThreeXByte : VsfrFormat()  // "3xB" → Int 0..255 (top byte)
    object TwoXShort  : VsfrFormat()  // "2xh" → Int (signed top short)
    object TwoXUShort : VsfrFormat()  // "2xH" → Int 0..65535 (unsigned top short)
}
```

`Vsfr.format` wird von `String?` auf `VsfrFormat?` umgestellt. Die Mapping-
Tabelle bleibt 1:1.

#### `SpectrumDecoder`

```kotlin
object SpectrumDecoder {
    fun decode(buf: BytesBuffer, formatVersion: Int): Spectrum
}
```

Port von `decode_RC_VS_SPECTRUM`: liest `<Ifff>` (duration_seconds + a0/a1/a2),
dann zählt-decodiert per v0 (rohe `u32`-Folge) oder v1 (RLE mit `vlen`-Encoding
0..5). `formatVersion ∉ {0, 1}` → `RadiaCodeException.UnsupportedSpectrumFormatVersion`.

#### `RadiaCodeException`

```kotlin
sealed class RadiaCodeException(message: String) : RuntimeException(message) {
    class IncompatibleFirmware(version: String) : RadiaCodeException(...)
    class HeaderMismatch(req: String, resp: String) : RadiaCodeException(...)
    class BadRetcode(context: String, retcode: Long) : RadiaCodeException(...)
    class SizeMismatch(context: String, got: Int, expected: Int) : RadiaCodeException(...)
    class InvalidValidityFlags(got: Int, expected: Int) : RadiaCodeException(...)
    class UnsupportedSpectrumFormatVersion(v: Int) : RadiaCodeException(...)
    class InvalidArgument(message: String) : RadiaCodeException(message)
}
```

Ersetzt jeden Python-`assert`/`raise` 1:1.

### Datenflüsse

#### Init-Sequenz (Konstruktor)

```
RadiaCode(ctx, mac, ignore=false)
    └─ BluetoothTransport(ctx, mac)            // Bluetooth-Verbindung
    └─ execute(SET_EXCHANGE, b"\x01\xff\x12\xff")
    └─ setLocalTime(LocalDateTime.now())
    └─ deviceTime(0)
    └─ baseTime = Instant.now() + 128s         // gespeichert für DataBufDecoder
    └─ fwVersion() → check vmaj < 4 || (vmaj==4 && vmin<8) → IncompatibleFirmware
    └─ for line in configuration().split("\n"):
         if startsWith("SpecFormatVersion"): _spectrumFormatVersion = parseInt(...)
```

#### `execute(reqType, args)` — Wire-Level

```
seq = (this.seq) % 32; this.seq++
reqSeqNo = 0x80 + seq                                // "ack"-Marker fürs Gerät
reqHeader = u16le(reqType.value) || 0x00 || u8(reqSeqNo)
request   = reqHeader || (args ?: empty)
fullReq   = u32le(request.size) || request
response  = transport.execute(fullReq)               // BytesBuffer mit Body (ohne 4B-Prefix)
respHeader = response.bytes(4)                       // erste 4 Body-Bytes = Echo des reqHeader
if (respHeader != reqHeader) throw HeaderMismatch
return response                                       // Position bei 4
```

#### `batchReadVsfrs`

Build payload: `u32le(n) || u32le(id1) || … || u32le(idN)`, send via
`RD_VIRT_SFR_BATCH`. Parse:

1. `validityFlags = response.u32Le()` — muss `(1<<n)-1` sein, sonst `InvalidValidityFlags`.
2. Read `n` u32-Werte sequentiell.
3. Für jeden Wert: `vsfr.format!!.decode(rawU32)` → typisiertes Result.
   `List<Any>` zurück (analog Python `tuple[int|float]`).

#### `dataBuf` und `spectrum`

```kotlin
fun dataBuf(): List<DataBufRecord> =
    DataBufDecoder.decode(readRequest(Vs.DATA_BUF.value), baseTime)

fun spectrum(): Spectrum =
    SpectrumDecoder.decode(readRequest(Vs.SPECTRUM.value), spectrumFormatVersion)
```

Beide sind dünne Pass-throughs. `baseTime` ist der im Init eingefrorene `Instant`.

#### String-Charsets

| Methode | Charset |
|---|---|
| `configuration()` | `Charset.forName("windows-1251")` |
| `textMessage()`, `serialNumber()`, `commands()` | `Charsets.US_ASCII` |
| `fwSignature()`, `fwVersion()` (date-Strings) | bleiben über `BytesBuffer.unpackString()` (ascii) |

## Service-Migration (`RadiacodeForegroundService.kt`)

**Vorher** (~860 Zeilen, davon ~250 für Handshake/Polling/ACK-Mechanik):

```kotlin
private var session: GattSession? = null
private val ackLock = Object()
@Volatile private var lastAckedSeq: Int = -1
private val seqIndex = AtomicInteger(0)
private val reassembler = Reassembler()
private var pollSeq: Int = -1
private fun runHandshake() { writeAndWaitForAck(...) × 5 }
private fun writeAndWaitForAck(cmd, args, timeoutMs): Boolean { … }
private fun pollTick() { writeCommand(RD_VIRT_STRING, u32le(DATA_BUF)) }
private fun writeCommand(cmd, args): Int { … }
// + onCharacteristicChanged-Listener mit Reassembler+parseResponse+MeasurementDecoder.parse
```

**Nachher**:

```kotlin
private var radiaCode: RadiaCode? = null

private fun connectAndStart(address: String) {
    val rc = RadiaCode(applicationContext, address)
    radiaCode = rc
    deviceReady = true
    RadiacodeNotificationPlugin.emitConnectionState("connected")
    startHighAccuracyLocation()
    startPollLoop()
}

private fun pollTick() {
    val rc = radiaCode ?: return
    try {
        val records = rc.dataBuf()
        records.forEach { onMeasurementReceived(it) }
    } catch (t: Throwable) {
        Log.w(TAG, "Poll tick failed", t)
    }
}

private fun teardownSession() {
    stopPollLoop()
    radiaCode?.close(); radiaCode = null
    trackRecorder?.stop(); trackRecorder = null
}
```

**Anpassung von `onMeasurementReceived`:** nimmt jetzt `DataBufRecord`
(`DoseRateDB | RareData | RealTimeData | RawData | Event`) statt der alten
`Measurement`-DTO. Das Mapping vom DataBufRecord auf die JSON-Struktur, die
das `RadiacodeNotificationPlugin` an die TS-Seite emittiert, wird hier (in
einer kleinen Mapper-Funktion) geschrieben.

**`MeasurementDecoder` und `Measurement`:** werden gelöscht, sofern keine
anderen Caller (zu prüfen mit `grep MeasurementDecoder|Measurement` während
Implementation). Falls die TS-Seite eine spezifische JSON-Form erwartet,
behalten wir die `Measurement`-Datenklasse als reines Wire-Format zwischen
Service und Plugin und mappen `DataBufRecord → Measurement` im Service.

**Threading:** `pollTick()` läuft auf dem `pollExecutor` (single-thread).
`connectAndStart` darf nicht vom Main-Thread laufen — bekommt deshalb seinen
eigenen Worker-Executor (analog zum bestehenden `setupSession`-Code).

## Tests (volle Coverage)

### Test-Doppel: `FakeTransport`

```kotlin
class FakeTransport : Transport {
    val requests = mutableListOf<ByteArray>()
    private val responses = ArrayDeque<ByteArray>()       // bytes WITHOUT len-prefix
    fun enqueueResponse(bytes: ByteArray) { responses.add(bytes) }
    fun enqueueResponseEcho(req: ByteArray, body: ByteArray) {
        // Hilfsmethode: nimmt den 4-byte ReqHeader des req und prepended ihn an body.
    }
    override fun execute(req: ByteArray, timeoutMs: Long): BytesBuffer { … }
    override fun close() { closed = true }
    var closed = false; private set
}
```

### Test-Klassen

**`RadiaCodeTest`** (volle Coverage — Test pro Public-Methode + Edge-Cases):

| Cluster | Tests |
|---|---|
| Mechanik | seq-rollover bei 32, header-format `<HBB>`, length-prefix `<I>`, header-mismatch wirft `HeaderMismatch` |
| Init | `init` ruft SET_EXCHANGE/SET_TIME/WR_VIRT_SFR(DEVICE_TIME=0)/GET_VERSION/configuration in Reihenfolge; SpecFormatVersion-Parsing aus dem Config-String; Firmware <4.8 wirft `IncompatibleFirmware`; `ignoreFirmwareCompatibilityCheck=true` skipt den Check; baseTime = ~now+128s |
| `readRequest` | retcode=1 mit korrekter flen passiert; retcode≠1 wirft `BadRetcode`; size-mismatch wirft `SizeMismatch`; HACK trailing-null-byte wird gestrippt (Test mit `flen+1 == size && data[-1]==0x00`) |
| `writeRequest` | retcode=1 + size=0 passiert; retcode≠1 wirft; übrig gebliebene Bytes werfen |
| `batchReadVsfrs` | leere Liste wirft; validity-flags falsch wirft; gemischte Formate (U32+F32+ThreeXBool+TwoXUShort) decodieren korrekt; Reihenfolge der Werte == Reihenfolge der IDs |
| `status`, `fwSignature`, `fwVersion`, `hwSerialNumber` | Wire-Format-Coverage; `hwSerialNumber` mit 8 und 16 Bytes; `fwVersion` mit ggf. `\x00`-Suffix im date-String wird gestrippt |
| `configuration`, `textMessage`, `serialNumber`, `commands` | korrekter VS-ID, korrekte charset-Decodierung — `configuration` mit cp1251-Bytes verifiziert |
| `setLocalTime` | Byte-Layout `<BBBBBBBB>` exakt: day, month, year-2000, 0, second, minute, hour, 0 |
| `deviceTime` | sendet WR_VIRT_SFR mit DEVICE_TIME-id + u32le(v) |
| `dataBuf` | delegiert an `DataBufDecoder.decode` mit baseTime — Smoke mit einem Realtime-Record |
| `spectrum`, `spectrumAccum` | delegieren an `SpectrumDecoder.decode` mit `_spectrumFormatVersion` |
| `doseReset` | sendet WR_VIRT_SFR mit DOSE_RESET-id |
| `spectrumReset` | WR_VIRT_STRING mit `<II>(SPECTRUM_id, 0)` und retcode=1 |
| `energyCalib` | liest 3×f32; `setEnergyCalib` mit len!=3 wirft; korrektes Wire-Format `<IIII fff>` |
| Setter (Sound/Vibro/Display/Sprache) | je Setter ein Test — verifiziert WR_VIRT_SFR mit korrekter VSFR-id und Payload |
| `setLanguage` | `lang ∉ {"ru","en"}` wirft; "en" → 1, "ru" → 0 |
| `setDisplayOffTime` | seconds ∉ {5,10,15,30} wirft; Mapping korrekt (5→0, 10→1, 15→2, 30→3) |
| `setDisplayBrightness` | Bereich 0..9; außerhalb wirft |
| `setSoundCtrl` / `setVibroCtrl` | Flags-OR; `CTRL.CLICKS` in vibro wirft |
| `getAlarmLimits` | sendet RD_VIRT_SFR_BATCH mit 8 IDs; Multiplikatoren bei DS_UNITS=true (uSv) und CR_UNITS=true (cpm) |
| `setAlarmLimits` | (i) leere Argumentliste wirft; (ii) negative Werte werfen je Argument; (iii) doseUnitSv=true skaliert ×100; (iv) countUnitCpm=true skaliert ×1/6; (v) Wire-Format `<I {n}I {n}I>` korrekt; (vi) Rückgabewert true bei expected_valid==response |
| `close` | delegiert an transport.close() |
| `spectrumChannelToEnergy` | Companion-Funktion: a0+a1·n+a2·n² |

**`SpectrumDecoderTest`**:

- `<Ifff>`-Header korrekt (duration als `Duration.ofSeconds`)
- v0: leere counts; einzelnes count; viele counts
- v1: `vlen=0` → 0; `vlen=1` → u8 absolute; `vlen=2` → s8 delta zu last;
  `vlen=3` → s16 delta; `vlen=4` → 24-bit signed delta (a,b,c-Mix);
  `vlen=5` → s32 delta; `vlen=6+` → wirft
- formatVersion ∉ {0,1} wirft `UnsupportedSpectrumFormatVersion`

**`VsfrFormatTest`**:

- jeder Variant (U32/I32/F32/ThreeXBool/ThreeXByte/TwoXShort/TwoXUShort):
  Decode-Korrektheit gegen bekannte Bit-Pattern, inkl. negativer Werte für
  signed Varianten

**`VsfrTest`**:

- Smoke-Test, der für jeden VSFR-Eintrag mit non-null format prüft, dass
  `decode(0)` keine Exception wirft (Schema-Konsistenz nach String→sealed-class-Migration)

### Service-Migration

Der Service hat heute **keine** Unit-Tests (Android-Lifecycle, BLE-Hardware).
Bleibt so. Verifikation der Migration: manueller Smoke-Test am echten Gerät:

1. App starten, Radiacode pairen, Service connectet
2. Notification zeigt Live-Werte (RealTimeData)
3. Über mehrere Minuten: RareData kommt (entspricht gid=3 Records); Track wird in Firestore geschrieben
4. App in Hintergrund → vorne — Verbindung hält
5. Disconnect (Gerät aus) → `ConnectionClosed` wird sauber geloggt, kein Crash, Notification zeigt "disconnected"

## Risiken & Offene Punkte

| Risiko | Mitigation |
|---|---|
| `MeasurementDecoder`/`Measurement`-DTO hat externe Caller (TS-Plugin) | Während Implementation `grep` über `capacitor/`, `src/`. Falls JSON-Shape stabil bleiben muss: kleine `DataBufRecord → Measurement`-Mapper-Funktion behalten |
| `connectAndStart` blockiert (Init-Handshake) — darf nicht auf Main-Thread laufen | KDoc + Service nutzt schon `Executors.newSingleThreadExecutor()` für `setupSession`; Pattern fortführen |
| `_spectrumFormatVersion` aus configuration parsen schlägt fehl, wenn Zeile nicht im Output | Python: bleibt 0. Wir kopieren das. Test deckt beide Fälle ab |
| Python `tuple[int\|float]` als Rückgabetyp von `batchReadVsfrs` — Kotlin hat keine Union-Types | `List<Any>`. Caller (`getAlarmLimits`) castet typsicher pro Index. Dokumentiert |
| `cp1251` Charset nicht in allen JVMs garantiert | `Charset.forName("windows-1251")` — Android unterstützt das |
| Spectrum v1 `vlen=4`: Python liest `<BBb>` (3 Bytes, letzter signed) — 24-bit signed delta. Off-by-bit-Risiko beim Port | Test mit positiven, negativen und 0-Werten |
| Service-Migration löscht `Framing`/`GattSession` — falls noch ungesehene Caller | Vor dem Löschen `grep`. Wenn offen: Datei umbenennen statt löschen, Tests laufen lassen |
| Alle Methoden parallel testen ist viel Code (>50 Tests) | OK — der Witz an „volle Coverage" ist genau das. Helper-Funktionen `encodeReqHeader(cmd, seq)` / `bodyOf(...)` reduzieren Boilerplate |

## Build / Migration-Reihenfolge

1. `Vsfr.kt` umstellen auf `VsfrFormat`-sealed-class + `VsfrFormat.kt` neu (TDD: `VsfrFormatTest` zuerst)
2. `Transport`-interface + `BluetoothTransport : Transport` (kein Verhalten ändern)
3. `SpectrumDecoder.kt` + Tests (TDD)
4. `RadiaCodeException.kt`
5. `RadiaCode.kt` + Tests (TDD, Cluster-für-Cluster)
6. Service-Migration: `RadiacodeForegroundService` umstellen
7. Cleanup: `Framing.kt`, `GattSession.kt`, `Protocol.kt`, ggf. `Measurement.kt`/`MeasurementDecoder.kt` löschen
8. Final-Checks:

   ```bash
   npx tsc --noEmit
   npx eslint
   npx vitest run
   cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest
   cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
   ```

Alle Schritte 1–7 ohne Zwischen-Commits/Checks (Lean-Plan-Prinzip).

## Coverage-Ziel

100% Lines/Branches in `RadiaCode.kt`, `SpectrumDecoder.kt`, `VsfrFormat.kt`.
`AndroidBleIo` und Service bleiben ausgeschlossen (Hardware-/Lifecycle-
abhängig).
