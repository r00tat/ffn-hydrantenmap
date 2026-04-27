# Radiacode `radiacode.py` Port Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Vollständiger 1:1-Port der Python-Klasse `radiacode.RadiaCode` nach Kotlin, plus Migration des `RadiacodeForegroundService` auf den neuen Stack.

**Architecture:** `Transport`-Interface (von `BluetoothTransport` implementiert) + 1:1 `RadiaCode`-Klasse + typisierter `VsfrFormat` (sealed class) + `SpectrumDecoder`. Der Service nutzt nach der Migration `BluetoothTransport`+`RadiaCode` statt der alten `GattSession`/`writeAndWaitForAck`-Mechanik; `Framing.kt`/`GattSession.kt`/`Protocol.kt` werden gelöscht.

**Tech Stack:** Kotlin (JVM 21 für Build, Android-Target), JUnit 4, `androidx.annotation`, kein `kotlinx.coroutines`.

**Lean-Plan-Prinzip (CLAUDE.md User-Memory):** Keine Zwischen-Commits oder Checks zwischen Tasks. Ein Final-Commit am Ende, dann komplett `npm run check` + Gradle-Tests + Gradle-Build.

**Reference:** Design doc → [`2026-04-27-radiacode-radiacode-port-design.md`](./2026-04-27-radiacode-radiacode-port-design.md).
**Python-Vorlage:** [`radiacode-python/src/radiacode/radiacode.py`](../../radiacode-python/src/radiacode/radiacode.py), [`radiacode-python/src/radiacode/decoders/spectrum.py`](../../radiacode-python/src/radiacode/decoders/spectrum.py).

---

## Parallel-Schedule für Subagents

Tasks 1, 2, 3, 4 sind voneinander **unabhängig** und können parallel laufen. Tasks 5–8 sind sequenziell.

```
Phase 1 (parallel):  [Task 1: VsfrFormat]  [Task 2: Transport-IF]  [Task 3: SpectrumDecoder]  [Task 4: Exceptions]
Phase 2 (sequential): Task 5: RadiaCode → Task 6: Service-Migration → Task 7: Cleanup → Task 8: Checks + Commit
```

---

## Task 1: `VsfrFormat` sealed class + `Vsfr.format`-Umstellung

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/protocol/VsfrFormat.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/protocol/VsfrFormatTest.kt`
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/protocol/Vsfr.kt` — `format: String?` → `format: VsfrFormat?`, Mapping 1:1
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/protocol/VsfrTest.kt` — Schema-Konsistenz-Smoketest

**Step 1: Write `VsfrFormatTest`**

Test pro Variant:

- `U32`: `decode(0x00000001) == 1`, `decode(0xFFFFFFFF.toInt()) == 0xFFFFFFFFL.toInt()` (Int repräsentiert; Caller behandelt als Long bei Bedarf — siehe Python `<I>`-Verhalten, hier lassen wir Int passieren)
- `I32`: `decode(0xFFFFFFFF.toInt()) == -1`, `decode(0x80000000.toInt()) == Int.MIN_VALUE`
- `F32`: `decode(Float.fromBits(0x40490FDB).toRawBits()) == 3.1415927f` (Wert + reverse roundtrip)
- `ThreeXBool`: u32 = `0x01000000` (top byte = 0x01) → `true`; u32 = `0x00FFFFFF` → `false` (top byte = 0)
- `ThreeXByte`: u32 = `0xAB000000.toInt()` → `0xAB` (171); u32 = `0x00000000` → `0`
- `TwoXShort`: u32 = `0xFFFF0000.toInt()` (top short = 0xFFFF, signed = -1) → `-1`; u32 = `0x7FFF0000` → `0x7FFF` (32767)
- `TwoXUShort`: u32 = `0xFFFF0000.toInt()` → `0xFFFF` (65535); u32 = `0x80000000.toInt()` → `0x8000` (32768)

**WICHTIG zur Bit-Layout-Frage:** Python `struct.unpack('<3xB', struct.pack('<I', v))` liest die ersten 3 Bytes des little-endian-u32 als skip, dann das 4. Byte als unsigned byte. Bei little-endian `0xAB000000` = bytes `00 00 00 AB` → das 4. Byte ist `0xAB`. Das entspricht dem **High Byte** des Int-Werts. Ergo: `(u32 ushr 24) and 0xFF`. Analog: `2xH` → bytes `00 00 HH HH` → Top 16 Bit des Int = `(u32 ushr 16) and 0xFFFF`.

**Step 2: Write `VsfrFormat.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Typed equivalent of Python `_VSFR_FORMATS` strings.
 *
 * Each variant decodes a 32-bit raw value (little-endian on the wire,
 * already converted to a Kotlin `Int`) into a typed value.
 */
sealed class VsfrFormat {
    abstract fun decode(u32: Int): Any

    object U32 : VsfrFormat() {
        override fun decode(u32: Int): Int = u32  // unsigned interpretation left to caller
    }

    object I32 : VsfrFormat() {
        override fun decode(u32: Int): Int = u32  // signed
    }

    object F32 : VsfrFormat() {
        override fun decode(u32: Int): Float = Float.fromBits(u32)
    }

    /** Python "3x?": skip 3 bytes, read u8 as bool. Top byte of LE u32. */
    object ThreeXBool : VsfrFormat() {
        override fun decode(u32: Int): Boolean = ((u32 ushr 24) and 0xFF) != 0
    }

    /** Python "3xB": skip 3 bytes, read u8. Top byte of LE u32. */
    object ThreeXByte : VsfrFormat() {
        override fun decode(u32: Int): Int = (u32 ushr 24) and 0xFF
    }

    /** Python "2xh": skip 2 bytes, read i16. Top 2 bytes of LE u32, signed. */
    object TwoXShort : VsfrFormat() {
        override fun decode(u32: Int): Int {
            val raw = (u32 ushr 16) and 0xFFFF
            return (raw shl 16) shr 16  // sign-extend
        }
    }

    /** Python "2xH": skip 2 bytes, read u16. Top 2 bytes of LE u32, unsigned. */
    object TwoXUShort : VsfrFormat() {
        override fun decode(u32: Int): Int = (u32 ushr 16) and 0xFFFF
    }
}
```

**Step 3: Modify `Vsfr.kt` — Mapping `String?` → `VsfrFormat?`**

Tabellen-Mapping (1:1 aus altem File übernehmen):

| Alt | Neu |
|---|---|
| `"3xB"` | `VsfrFormat.ThreeXByte` |
| `"3x?"` | `VsfrFormat.ThreeXBool` |
| `"I"` | `VsfrFormat.U32` |
| `"i"` | `VsfrFormat.I32` |
| `"f"` | `VsfrFormat.F32` |
| `"2xH"` | `VsfrFormat.TwoXUShort` |
| `"2xh"` | `VsfrFormat.TwoXShort` |
| `null` | `null` |

Den großen Kommentarblock über `format` an die neue Realität anpassen (TODO-Hinweis löschen, weil materialisiert).

**Step 4: Write `VsfrTest.kt` — Schema-Konsistenz-Smoke**

```kotlin
class VsfrTest {
    @Test fun `every Vsfr with non-null format can decode 0 without throwing`() {
        for (v in Vsfr.values()) v.format?.decode(0)
    }
    @Test fun `every Vsfr with non-null format can decode -1 without throwing`() {
        for (v in Vsfr.values()) v.format?.decode(-1)
    }
}
```

**Step 5: Run tests**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest --tests '*VsfrFormatTest' --tests '*VsfrTest'
```

---

## Task 2: `Transport`-Interface + `BluetoothTransport : Transport`

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/Transport.kt`
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/BluetoothTransport.kt` — füge `: Transport` an die Klassendeklaration

**Step 1: Write `Transport.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer

/**
 * Common transport abstraction for radiacode protocol I/O.
 *
 * Implementations: [BluetoothTransport] (production), `FakeTransport` (tests).
 * Allows [at.ffnd.einsatzkarte.radiacode.RadiaCode] to be unit-tested without
 * a real BLE stack.
 *
 * `internal` because the only external consumer is [RadiaCode] which lives in
 * the same Gradle module.
 */
internal interface Transport {
    /**
     * Send [req] (a fully framed radiacode request including `<I>` length-prefix)
     * and synchronously wait for the matching response. Returns the response
     * body as a [BytesBuffer] positioned at offset 0 of the body (the 4-byte
     * length prefix has already been consumed by the transport).
     *
     * Concurrency: Implementations MUST serialize concurrent calls so that
     * one caller's response cannot be intercepted by another.
     *
     * @throws ConnectionClosed if the transport was closed or lost connection
     * @throws TransportTimeout if no complete response arrived within [timeoutMs]
     */
    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun execute(req: ByteArray, timeoutMs: Long = 10_000L): BytesBuffer

    /** Disconnects and releases resources. Idempotent. */
    fun close()
}
```

**Step 2: Modify `BluetoothTransport.kt`**

Eine einzige Edit:

```kotlin
class BluetoothTransport private constructor(
    private val io: BleIo,
    private val maxChunk: Int,
    private val defaultTimeoutMs: Long,
    connectTimeoutMs: Long,
) : Transport {
```

(Es gibt keine Verhaltensänderung — die Methodensignaturen `execute(req, timeoutMs)` und `close()` matchen das Interface bereits.)

**Step 3: Verifikation**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:compileDebugKotlin
```

Expected: BUILD SUCCESSFUL. Bestehende `BluetoothTransportTest` läuft unverändert weiter.

---

## Task 3: `SpectrumDecoder` Port von `decoders/spectrum.py`

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/decoders/SpectrumDecoder.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/decoders/SpectrumDecoderTest.kt`

**Step 1: Write `SpectrumDecoderTest.kt` (TDD)**

Test-Cluster:

1. **Header**: ein Frame mit `<Ifff>` = `(60, 1.0f, 2.0f, 3.0f)`, gefolgt von leeren counts → `Spectrum(duration=Duration.ofSeconds(60), a0=1.0f, a1=2.0f, a2=3.0f, counts=emptyList())`
2. **v0 — leere counts**: nach Header keine weiteren Bytes → `counts == emptyList<Int>()`
3. **v0 — drei counts**: 3 × `<I>` = `[100, 200, 300]` → `counts == listOf(100, 200, 300)`
4. **v1 — `vlen=0`**: u16 = `cnt=2, vlen=0` (= `0x0020`) → 2 × `0` in counts
5. **v1 — `vlen=1`**: u16 = `cnt=1, vlen=1` (= `0x0011`), payload `0x42` → counts == [0x42]; `last == 0x42`
6. **v1 — `vlen=2`**: u16 = `cnt=1, vlen=2`, payload signed `-1` (`0xFF`) nach last=10 → counts == [9]
7. **v1 — `vlen=3`**: u16 = `cnt=1, vlen=3`, payload `<h>=−256` (`0x00 0xFF`) nach last=300 → counts == [44]
8. **v1 — `vlen=4`** (24-bit signed delta): drei verschiedene Pattern (positiv, negativ, gemischt). Python: `a, b, c = br.unpack('<BBb')`; `v = last + ((c << 16) | (b << 8) | a)`. Beispiele:
   - `a=0x01, b=0x00, c=0x00` (= +1) nach last=0 → 1
   - `a=0x00, b=0x00, c=0xFF` (= -65536, weil `c` signed) nach last=70000 → 4464
   - `a=0xAB, b=0xCD, c=0x12` (= 0x12CDAB = +1232811) nach last=0 → 1232811
9. **v1 — `vlen=5`**: u16 = `cnt=1, vlen=5`, payload `<i>=−1000` nach last=2000 → 1000
10. **v1 — `vlen=6+` wirft**: `RadiaCodeException.UnsupportedSpectrumFormatVersion`? Nein — Python wirft generisch `Exception` mit dem `vlen` als Detail. Wir nehmen eine **eigene** `IllegalArgumentException` mit klarer Message. Test asserted darauf.
11. **format-version ungültig**: `formatVersion = 2` wirft `RadiaCodeException.UnsupportedSpectrumFormatVersion(2)`
12. **v1 — gemischter Run**: ein realistisches Sample mit mehreren u16-Header und gemischten vlen-Werten — dient als Integrationstest

**Step 2: Write `SpectrumDecoder.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.RadiaCodeException
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.types.Spectrum
import java.time.Duration

/**
 * Port of `radiacode-python/src/radiacode/decoders/spectrum.py`
 * (`decode_RC_VS_SPECTRUM`).
 *
 * Two on-the-wire encodings are supported (selected by the `formatVersion`
 * derived from the device configuration string):
 *  - **v0**: each count is a raw little-endian u32.
 *  - **v1**: run-length-encoded — a u16 header carries `cnt` (top 12 bits)
 *    and `vlen` (low 4 bits) per run; subsequent bytes contain the deltas.
 */
object SpectrumDecoder {
    fun decode(buf: BytesBuffer, formatVersion: Int): Spectrum {
        val durationSeconds = buf.u32Le()
        val a0 = buf.f32Le()
        val a1 = buf.f32Le()
        val a2 = buf.f32Le()
        val counts = when (formatVersion) {
            0 -> decodeCountsV0(buf)
            1 -> decodeCountsV1(buf)
            else -> throw RadiaCodeException.UnsupportedSpectrumFormatVersion(formatVersion)
        }
        return Spectrum(
            duration = Duration.ofSeconds(durationSeconds),
            a0 = a0, a1 = a1, a2 = a2,
            counts = counts,
        )
    }

    private fun decodeCountsV0(buf: BytesBuffer): List<Int> {
        val out = ArrayList<Int>()
        while (buf.size() > 0) {
            // Python uses '<I' (unsigned 32-bit). Spectrum counts realistically
            // fit in Int range; cast Long → Int matches Python's int behaviour.
            out.add(buf.u32Le().toInt())
        }
        return out
    }

    private fun decodeCountsV1(buf: BytesBuffer): List<Int> {
        val out = ArrayList<Int>()
        var last = 0
        while (buf.size() > 0) {
            val u16 = buf.u16Le()
            val cnt = (u16 ushr 4) and 0x0FFF
            val vlen = u16 and 0x0F
            repeat(cnt) {
                val v = when (vlen) {
                    0 -> 0
                    1 -> buf.u8()                                       // absolute u8, replaces last
                    2 -> last + buf.i8()                                // signed delta
                    3 -> last + buf.i16Le()                             // signed delta
                    4 -> {
                        val a = buf.u8()
                        val b = buf.u8()
                        val c = buf.i8()                                // signed top byte
                        last + ((c shl 16) or (b shl 8) or a)
                    }
                    5 -> last + buf.i32Le()                             // signed delta
                    else -> throw IllegalArgumentException(
                        "unsupported vlen=$vlen in decode_RC_VS_SPECTRUM v1"
                    )
                }
                last = v
                out.add(v)
            }
        }
        return out
    }
}
```

**Hinweis** zur `vlen=1`-Semantik: Python liest `<B>` ohne `last + …` — das ist eine **absolute** u8, nicht ein delta. Sie wird zu `last`. Test 5 verifiziert das.

**Step 3: Run tests**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest --tests '*SpectrumDecoderTest'
```

---

## Task 4: `RadiaCodeException` sealed class

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/RadiaCodeException.kt`

**Step 1: Write `RadiaCodeException.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode

/**
 * Typed replacement for the Python module's mix of `assert` failures and
 * generic `raise Exception`/`ValueError` calls.
 *
 * Exception categories mirror the Python sites 1:1:
 *  - [IncompatibleFirmware]      ← Python: `RadiaCode.__init__` firmware check
 *  - [HeaderMismatch]            ← Python: `assert req_header == resp_header`
 *  - [BadRetcode]                ← Python: `assert retcode == 1`
 *  - [SizeMismatch]              ← Python: `assert r.size() == flen`, `assert r.size() == 0`
 *  - [InvalidValidityFlags]      ← Python: `batch_read_vsfrs` validity-flags check
 *  - [UnsupportedSpectrumFormatVersion] ← Python: `decode_RC_VS_SPECTRUM` assert
 *  - [InvalidArgument]           ← Python: `ValueError` / `assert lang in {...}`
 */
sealed class RadiaCodeException(message: String) : RuntimeException(message) {
    class IncompatibleFirmware(version: String) :
        RadiaCodeException("Incompatible firmware $version, >=4.8 required. Upgrade device firmware or pass ignoreFirmwareCompatibilityCheck=true.")
    class HeaderMismatch(reqHex: String, respHex: String) :
        RadiaCodeException("req=$reqHex resp=$respHex")
    class BadRetcode(context: String, retcode: Long) :
        RadiaCodeException("$context: got retcode $retcode")
    class SizeMismatch(context: String, got: Int, expected: Int) :
        RadiaCodeException("$context: got size $got, expected $expected")
    class InvalidValidityFlags(got: Int, expected: Int) :
        RadiaCodeException("Unexpected validity flags, bad vsfr_id? ${got.toString(2)} != ${expected.toString(2)}")
    class UnsupportedSpectrumFormatVersion(v: Int) :
        RadiaCodeException("unsupported format_version=$v")
    class InvalidArgument(message: String) :
        RadiaCodeException(message)
}
```

**Step 2: Compile**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:compileDebugKotlin
```

---

## Task 5: `RadiaCode`-Klasse + Tests

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/RadiaCode.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/RadiaCodeTest.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/transport/FakeTransport.kt` (Test-Doppel)
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/FwVersion.kt` (Datenklasse)

**Step 1: Write `FakeTransport.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import java.util.ArrayDeque

/**
 * In-memory [Transport] for unit tests. Records every request and replies
 * with pre-enqueued response bodies (= what the wire delivers AFTER the
 * 4-byte length prefix is stripped by the real transport).
 *
 * The first 4 bytes of the response body MUST be the echo of the request
 * header (`<HBB>` = cmd_u16, reserved=0, seq) — [enqueueResponseEcho]
 * helps build that.
 */
class FakeTransport : Transport {
    val requests = mutableListOf<ByteArray>()
    private val responses = ArrayDeque<ByteArray>()
    var closed = false; private set

    /** Adds a complete response body verbatim (including 4-byte echo header). */
    fun enqueueResponse(body: ByteArray) { responses.add(body) }

    /**
     * Builds a response body from the 4-byte echo header of [requestForEcho]
     * (skipping the 4-byte length prefix at the start) plus [payload], and
     * enqueues it.
     */
    fun enqueueResponseEcho(requestForEcho: ByteArray, payload: ByteArray = ByteArray(0)) {
        val echoHeader = requestForEcho.copyOfRange(4, 8)
        responses.add(echoHeader + payload)
    }

    /** Convenience: enqueues an echo for the request that will be next sent. */
    fun enqueueResponseFor(cmd: Int, seq: Int, payload: ByteArray = ByteArray(0)) {
        val header = byteArrayOf(
            (cmd and 0xFF).toByte(),
            ((cmd ushr 8) and 0xFF).toByte(),
            0,
            seq.toByte(),
        )
        responses.add(header + payload)
    }

    override fun execute(req: ByteArray, timeoutMs: Long): BytesBuffer {
        requests += req
        check(responses.isNotEmpty()) { "FakeTransport: no response enqueued for request #${requests.size}" }
        return BytesBuffer(responses.removeFirst())
    }

    override fun close() { closed = true }
}
```

**Step 2: Write `FwVersion.kt`**

```kotlin
package at.ffnd.einsatzkarte.radiacode

data class FwVersion(val major: Int, val minor: Int, val date: String)
```

**Step 3: Write `RadiaCodeTest.kt` — Cluster für Cluster (TDD)**

Volle Coverage. Hilfs-Helper im Test-File:

```kotlin
private fun reqHeader(cmd: Int, seq: Int): ByteArray =
    byteArrayOf((cmd and 0xFF).toByte(), ((cmd ushr 8) and 0xFF).toByte(), 0, (0x80 or seq).toByte())

private fun u32leBytes(v: Long): ByteArray { /* 4-byte little-endian */ }
private fun u32leBytes(v: Int): ByteArray = u32leBytes(v.toLong() and 0xFFFFFFFFL)
private fun f32leBytes(v: Float): ByteArray { /* 4 bytes */ }

/** Baut das, was `FakeTransport.requests` für einen execute()-Call enthält. */
private fun expectedRequest(cmd: Int, seq: Int, args: ByteArray = ByteArray(0)): ByteArray {
    val header = reqHeader(cmd, seq)
    val payload = header + args
    return u32leBytes(payload.size) + payload
}
```

Test-Konstruktor-Hilfe — `RadiaCode` mit `FakeTransport` und vor-eingeqeueter Init-Sequenz:

```kotlin
private fun radiaCodeWith(
    transport: FakeTransport,
    spectrumFormatVersionConfigLine: String? = "SpecFormatVersion=1",
    bootMajor: Int = 4, bootMinor: Int = 8, targetMajor: Int = 4, targetMinor: Int = 8,
): RadiaCode {
    // Init schickt 5 execute()-Calls: SET_EXCHANGE, SET_TIME, WR_VIRT_SFR(DEVICE_TIME=0), GET_VERSION, RD_VIRT_STRING(CONFIGURATION).
    // Reihenfolge der Antworten matched die Reihenfolge der enqueues.
    transport.enqueueResponseFor(Command.SET_EXCHANGE.value, seq = 0)
    transport.enqueueResponseFor(Command.SET_TIME.value, seq = 1)
    // WR_VIRT_SFR DEVICE_TIME=0: Antwort `<I retcode=1> + size 0`
    transport.enqueueResponseFor(Command.WR_VIRT_SFR.value, seq = 2, payload = u32leBytes(1))
    // GET_VERSION: Antwort = boot_minor:HH boot_major:HH boot_date:<u8len + ascii> target_minor target_major target_date
    transport.enqueueResponseFor(
        Command.GET_VERSION.value, seq = 3,
        payload = /* u16 minor, u16 major, lenprefix-string, … */ …,
    )
    // RD_VIRT_STRING(CONFIGURATION): retcode=1, flen, dann cp1251-bytes der Config
    val configBytes = (spectrumFormatVersionConfigLine ?: "").toByteArray(Charset.forName("windows-1251"))
    transport.enqueueResponseFor(
        Command.RD_VIRT_STRING.value, seq = 4,
        payload = u32leBytes(1) + u32leBytes(configBytes.size) + configBytes,
    )
    return RadiaCode(transport)
}
```

Test-Liste (mind. ein Test pro Punkt):

| # | Cluster | Test-Case |
|---|---|---|
| 1 | Mechanik | `seq rolls over from 31 to 0` — 33 dummy-execute-Calls, prüfe seq=0,1,…,31,0 |
| 2 | Mechanik | `execute writes <I-len><cmd_u16><reserved=0><seq>` — Wire-Bytes exakt |
| 3 | Mechanik | `header mismatch throws HeaderMismatch` — Antwort mit falschem cmd → Exception |
| 4 | Init | `init runs SET_EXCHANGE → SET_TIME → DEVICE_TIME=0 → GET_VERSION → CONFIGURATION` — Reihenfolge prüfen |
| 5 | Init | `init parses SpecFormatVersion=1 from configuration` |
| 6 | Init | `init defaults SpecFormatVersion=0 if absent in configuration` |
| 7 | Init | `firmware <4.8 throws IncompatibleFirmware` |
| 8 | Init | `ignoreFirmwareCompatibilityCheck=true skips firmware check` |
| 9 | Init | `baseTime ≈ Instant.now()+128s` — innerhalb 1s-Toleranz |
| 10 | readRequest | `retcode=1 with correct flen passes` |
| 11 | readRequest | `retcode != 1 throws BadRetcode` |
| 12 | readRequest | `size != flen throws SizeMismatch` |
| 13 | readRequest | `HACK: trailing 0x00 with size==flen+1 is stripped` |
| 14 | writeRequest | `retcode=1 + size=0 passes` |
| 15 | writeRequest | `retcode != 1 throws BadRetcode` |
| 16 | writeRequest | `extra bytes in response throws SizeMismatch` |
| 17 | batchReadVsfrs | `empty list throws InvalidArgument` |
| 18 | batchReadVsfrs | `validity flags mismatch throws InvalidValidityFlags` |
| 19 | batchReadVsfrs | `mixed formats decode in order` — U32 + F32 + ThreeXBool + TwoXUShort |
| 20 | status | `returns "status flags: …"` |
| 21 | fwSignature | `returns formatted "Signature: …"` |
| 22 | fwVersion | `parses (boot, target) tuple with date strings, target date stripped of \x00` |
| 23 | hwSerialNumber | `8-byte serial → "AAAAAAAA-BBBBBBBB"` |
| 24 | hwSerialNumber | `16-byte serial → 4 groups joined by "-"` |
| 25 | configuration | `cp1251 bytes decoded — char with code >0x80` |
| 26 | textMessage | `ascii decoded` |
| 27 | serialNumber | `ascii decoded` |
| 28 | commands | `ascii decoded (SFR_FILE)` |
| 29 | setLocalTime | `wire bytes day/month/year-2000/0/sec/min/hour/0` |
| 30 | deviceTime | `WR_VIRT_SFR + DEVICE_TIME id + u32le(v)` |
| 31 | dataBuf | `delegates to DataBufDecoder` — Smoke mit einem Realtime-Record |
| 32 | spectrum | `delegates to SpectrumDecoder with stored formatVersion` |
| 33 | spectrumAccum | `uses VS.SPEC_ACCUM` |
| 34 | doseReset | `WR_VIRT_SFR + DOSE_RESET id` |
| 35 | spectrumReset | `WR_VIRT_STRING <II>(SPECTRUM_id, 0) + retcode=1` |
| 36 | spectrumReset | `retcode != 1 throws BadRetcode` |
| 37 | energyCalib | `parses 3 floats` |
| 38 | setEnergyCalib | `len != 3 throws InvalidArgument` |
| 39 | setEnergyCalib | `wire frame: WR_VIRT_STRING <II ENERGY_CALIB, 12> + 3 f32` |
| 40 | setLanguage | `lang="en" → 1`, `lang="ru" → 0` |
| 41 | setLanguage | `lang="de" throws InvalidArgument` |
| 42 | setDeviceOn | `true → 1`, `false → 0` |
| 43 | setSoundOn | `true → 1`, `false → 0` |
| 44 | setVibroOn | `true → 1`, `false → 0` (Python-Bug: schreibt SOUND_ON, nicht VIBRO_ON — wir kopieren das, mit deutlichem Kommentar) |
| 45 | setSoundCtrl | `OR der Flags` |
| 46 | setVibroCtrl | `OR ohne CTRL.CLICKS` |
| 47 | setVibroCtrl | `CTRL.CLICKS in list throws InvalidArgument` |
| 48 | setDisplayOffTime | `5→0, 10→1, 15→2, 30→3` |
| 49 | setDisplayOffTime | `seconds=20 throws InvalidArgument` |
| 50 | setDisplayBrightness | `0..9 ok` |
| 51 | setDisplayBrightness | `10 throws InvalidArgument` |
| 52 | setDisplayDirection | `wire = u32le(direction.value)` |
| 53 | getAlarmLimits | `8 IDs in batch, multipliers when DS_UNITS=true && CR_UNITS=true` |
| 54 | getAlarmLimits | `multipliers when DS_UNITS=false && CR_UNITS=false` |
| 55 | setAlarmLimits | `empty args throws InvalidArgument` |
| 56 | setAlarmLimits | `negative l1_count_rate throws InvalidArgument` |
| 57 | setAlarmLimits | `negative l1_dose_rate throws InvalidArgument` |
| 58 | setAlarmLimits | `negative l1_dose throws InvalidArgument` |
| 59 | setAlarmLimits | `doseUnitSv=true scales dose ×100` |
| 60 | setAlarmLimits | `countUnitCpm=true scales count ×1/6` |
| 61 | setAlarmLimits | `wire frame and validity-flag check` |
| 62 | close | `delegates to transport.close()` |
| 63 | spectrumChannelToEnergy | `a0 + a1*n + a2*n²` |

**Step 4: Write `RadiaCode.kt` — Implementation**

Strikter 1:1-Port von `radiacode.py`. Wichtige Punkte:

```kotlin
package at.ffnd.einsatzkarte.radiacode

import android.content.Context
import androidx.annotation.VisibleForTesting
import at.ffnd.einsatzkarte.radiacode.decoders.DataBufDecoder
import at.ffnd.einsatzkarte.radiacode.decoders.DataBufRecord
import at.ffnd.einsatzkarte.radiacode.decoders.SpectrumDecoder
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.protocol.Command
import at.ffnd.einsatzkarte.radiacode.protocol.Ctrl
import at.ffnd.einsatzkarte.radiacode.protocol.DisplayDirection
import at.ffnd.einsatzkarte.radiacode.protocol.Vs
import at.ffnd.einsatzkarte.radiacode.protocol.Vsfr
import at.ffnd.einsatzkarte.radiacode.transport.BluetoothTransport
import at.ffnd.einsatzkarte.radiacode.transport.Transport
import at.ffnd.einsatzkarte.radiacode.types.AlarmLimits
import at.ffnd.einsatzkarte.radiacode.types.Spectrum
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.Charset
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import kotlin.math.roundToInt

class RadiaCode private constructor(
    private val transport: Transport,
    ignoreFirmwareCompatibilityCheck: Boolean,
) {
    private var seq: Int = 0
    private val baseTime: Instant
    private var spectrumFormatVersion: Int = 0

    constructor(
        ctx: Context,
        bluetoothMac: String,
        ignoreFirmwareCompatibilityCheck: Boolean = false,
    ) : this(BluetoothTransport(ctx, bluetoothMac), ignoreFirmwareCompatibilityCheck)

    @VisibleForTesting
    internal constructor(
        transport: Transport,
        ignoreFirmwareCompatibilityCheck: Boolean = false,
    ) : this(transport, ignoreFirmwareCompatibilityCheck, _initBypass = Unit)

    // separat, damit der primary-Konstruktor nur die zwei Felder belegt — Init-Sequenz unten
    private constructor(
        transport: Transport,
        ignoreFirmwareCompatibilityCheck: Boolean,
        @Suppress("UNUSED_PARAMETER") _initBypass: Unit,
    ) : this(transport, ignoreFirmwareCompatibilityCheck) // Note: only one private constructor — siehe Implementation-Hinweis

    init {
        execute(Command.SET_EXCHANGE, byteArrayOf(0x01, 0xFF.toByte(), 0x12, 0xFF.toByte()))
        setLocalTime(LocalDateTime.now())
        deviceTime(0)
        baseTime = Instant.now().plusSeconds(128)
        val (_, target) = fwVersion()
        if (!ignoreFirmwareCompatibilityCheck && (target.major < 4 || (target.major == 4 && target.minor < 8))) {
            throw RadiaCodeException.IncompatibleFirmware("${target.major}.${target.minor}")
        }
        for (line in configuration().split('\n')) {
            if (line.startsWith("SpecFormatVersion")) {
                spectrumFormatVersion = line.split('=')[1].trim().toInt()
                break
            }
        }
    }
    // … alle Methoden
}
```

**Implementation-Hinweis zum Init:**
Kotlins `init`-Block kann nicht zwischen primary und secondary unterscheiden. Beste Lösung: einziger primary-Konstruktor, der **immer** die Init-Sequenz fährt. Die zwei „Aussen"-Konstruktoren delegieren nur den Transport-Bau:

```kotlin
class RadiaCode internal constructor(
    private val transport: Transport,
    ignoreFirmwareCompatibilityCheck: Boolean = false,
) {
    private var seq = 0
    private val baseTime: Instant
    private var spectrumFormatVersion = 0

    constructor(ctx: Context, bluetoothMac: String, ignoreFirmwareCompatibilityCheck: Boolean = false)
        : this(BluetoothTransport(ctx, bluetoothMac), ignoreFirmwareCompatibilityCheck)

    init { /* … wie oben … */ }
    // …
}
```

Die `internal`-Sichtbarkeit erlaubt Tests (gleiches Modul) den direkten Zugriff mit `Transport`-Instanz.

**Wichtige Methoden-Implementierungen** (Kurzform, Details aus `radiacode.py` 1:1):

```kotlin
fun execute(reqType: Command, args: ByteArray? = null): BytesBuffer {
    val reqSeqNo = 0x80 + seq
    seq = (seq + 1) % 32
    val header = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).apply {
        putShort(reqType.value.toShort())
        put(0)
        put(reqSeqNo.toByte())
    }.array()
    val request = header + (args ?: ByteArray(0))
    val full = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(request.size).array() + request
    val response = transport.execute(full)
    val respHeader = response.bytes(4)
    if (!header.contentEquals(respHeader)) {
        throw RadiaCodeException.HeaderMismatch(header.toHex(), respHeader.toHex())
    }
    return response
}

fun readRequest(commandId: Int): BytesBuffer {
    val r = execute(Command.RD_VIRT_STRING, u32le(commandId))
    val retcode = r.u32Le()
    val flen = r.u32Le().toInt()
    if (retcode != 1L) throw RadiaCodeException.BadRetcode("commandId=$commandId", retcode)
    // HACK: workaround for new firmware bug — trailing null byte
    val remaining = r.remaining()
    val data = if (remaining.size == flen + 1 && remaining[remaining.size - 1] == 0.toByte()) {
        remaining.copyOf(flen)
    } else if (remaining.size == flen) {
        remaining
    } else {
        throw RadiaCodeException.SizeMismatch("commandId=$commandId", remaining.size, flen)
    }
    return BytesBuffer(data)
}

fun readRequest(vs: Vs) = readRequest(vs.value)
fun readRequest(vsfr: Vsfr) = readRequest(vsfr.value)
```

`writeRequest`, `batchReadVsfrs`, `setLocalTime`, etc. ebenfalls 1:1 aus dem Python-Code übersetzt — siehe Python-Quelle als Referenz.

**Step 5: Run tests**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest --tests '*RadiaCodeTest'
```

---

## Task 6: `RadiacodeForegroundService`-Migration

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt`

**Step 1: Recherche — `MeasurementDecoder` / `Measurement` Caller**

```bash
cd capacitor/android && grep -rn "MeasurementDecoder\|class Measurement\|Measurement(" app/src/main/java
```

Wenn nur der Service `MeasurementDecoder.parse(...)` aufruft und `Measurement` als DTO an `RadiacodeNotificationPlugin.emit*` übergeben wird, ist die JSON-Shape im Plugin definiert. Der Plugin-Code (`RadiacodeNotificationPlugin.java`) muss gegen die DataBufRecord-Shapes laufen — d.h. wir bauen einen kleinen Adapter `DataBufRecord → Measurement` im Service oder migrieren Plugin-Calls direkt.

Entscheidung während Implementation: kleinster Footprint = `Measurement`-Datenklasse + Adapter behalten (rein als Service-internes Wire-Format zur JS-Schicht).

**Step 2: Edit `RadiacodeForegroundService.kt`**

**Entfernen:**

- Imports: `at.ffnd.einsatzkarte.radiacode.GattSession`, `Framing`, `Reassembler`, `parseResponse`, `Protocol`
- Felder: `session`, `ackLock`, `lastAckedSeq`, `seqIndex`, `reassembler`, `pollSeq`
- Funktionen: `runHandshake`, `writeAndWaitForAck`, `writeCommand`, plus den `SessionListener.onCharacteristicChanged`-Handler-Code der `parseResponse`/`MeasurementDecoder.parse` aufruft
- Imports von `Protocol.*`-Konstanten

**Hinzufügen:**

- Imports: `at.ffnd.einsatzkarte.radiacode.RadiaCode`, `at.ffnd.einsatzkarte.radiacode.transport.BluetoothTransport`, `at.ffnd.einsatzkarte.radiacode.decoders.DataBufRecord`, `at.ffnd.einsatzkarte.radiacode.decoders.RealTimeData`, `RareData`, etc.
- Feld: `private var radiaCode: RadiaCode? = null`
- `setupSession` (oder die Funktion, die heute `GattSession` baut): wird ersetzt durch `RadiaCode(applicationContext, address)`-Konstruktion auf einem Worker-Thread; auf Erfolg `radiaCode = rc`, dann `RadiacodeNotificationPlugin.emitConnectionState("connected")`, `startHighAccuracyLocation()`, `startPollLoop()`. Bei Exception (`DeviceNotFound`, `ConnectionClosed`, `RadiaCodeException`) → `emitConnectionState("disconnected")` + Logging
- `pollTick()`:

  ```kotlin
  private fun pollTick() {
      val rc = radiaCode ?: return
      try {
          val records = rc.dataBuf()
          for (record in records) onMeasurementReceived(record)
      } catch (cc: ConnectionClosed) {
          Log.w(TAG, "dataBuf failed — connection closed", cc)
          emitConnectionState("disconnected")
          teardownSession()
      } catch (t: Throwable) {
          Log.w(TAG, "Poll tick failed", t)
      }
  }
  ```

- `teardownSession()`: ersetzt `session?.release()` durch `radiaCode?.close(); radiaCode = null`
- `onMeasurementReceived(record: DataBufRecord)`: nimmt jetzt einen DataBufRecord; wandle in das alte `Measurement`-DTO via einer kleinen Mapper-Funktion `toMeasurement(record)`, dann an Plugin/TrackRecorder weiterreichen
- `MeasurementDecoder.parse` und `parseResponse`-Calls fallen weg, weil `dataBuf()` direkt typisierte Records liefert

**Step 3: Verifikation**

Compile passes:

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:compileDebugKotlin
```

(Manuelle Geräte-Tests laufen nach dem Final-Build in Task 8.)

---

## Task 7: Cleanup — alte Files löschen

**Files (löschen):**

- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Framing.kt`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/GattSession.kt`
- `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Protocol.kt`
- Falls Service nicht mehr referenziert: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt` und der zugehörige `MeasurementDecoder` (Datei oder Sektion)
- Falls vorhanden: `FramingTest.kt`, `GattSessionTest.kt`, `MeasurementTest.kt`, `MeasurementDecoderTest.kt`

**Step 1: Sichern, dass nichts mehr referenziert**

```bash
cd capacitor/android && grep -rn "GattSession\|Framing\|Reassembler\|parseResponse\|class Protocol\|class Measurement\|MeasurementDecoder" app/src
```

Erwartet: leer bzw. nur Kommentare / die zu löschenden Files selbst.

**Step 2: Delete**

```bash
cd capacitor/android/app && \
  rm -f src/main/java/at/ffnd/einsatzkarte/radiacode/Framing.kt \
        src/main/java/at/ffnd/einsatzkarte/radiacode/GattSession.kt \
        src/main/java/at/ffnd/einsatzkarte/radiacode/Protocol.kt
# optional, abhängig von Recherche in Task 6:
# rm -f src/main/java/at/ffnd/einsatzkarte/radiacode/Measurement.kt
# rm -f src/test/java/at/ffnd/einsatzkarte/radiacode/FramingTest.kt
# rm -f src/test/java/at/ffnd/einsatzkarte/radiacode/GattSessionTest.kt
```

**Step 3: Compile + Tests laufen lassen, um sicherzugehen, dass keine Regression**

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest
```

---

## Task 8: Final-Checks + Commit

**Step 1: Vollständiger Check-Lauf**

```bash
# 1. JS-Seite
cd /Users/paul/Documents/Feuerwehr/hydranten-map
git checkout -- next-env.d.ts
npx tsc --noEmit
npx eslint
npx vitest run

# 2. Android-Seite
cd capacitor/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

Alle müssen grün sein. Bei Fehlern: zurück zum entsprechenden Task, fixen.

**Step 2: Commit**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map
git add capacitor/android/app/src
git status   # sanity-check
git commit -m "feat(radiacode): RadiaCode-Klasse + Service-Migration (Port von radiacode.py)"
```

**Step 3: Manueller Smoke-Test am Gerät (außerhalb Plan-Scope, aber dokumentieren)**

1. Debug-APK installieren
2. Radiacode-Gerät pairen, Service connectet
3. Notification zeigt Live-Werte (RealTimeData)
4. Über mehrere Minuten: RareData kommt
5. Track wird in Firestore geschrieben
6. App in Hintergrund → vorne — Verbindung hält
7. Disconnect (Gerät aus) → ConnectionClosed wird sauber geloggt, Notification zeigt "disconnected"

---

## Rollback-Plan

Bei Problemen mit der Service-Migration nach dem Commit:

```bash
git revert HEAD
```

Der Commit umfasst alle Änderungen aus Tasks 1–7 — ein einzelner revert stellt den vorherigen Zustand vollständig her.

Falls ein Teil-Rollback nötig ist (z.B. nur Service zurückrollen, RadiaCode-Klasse behalten), muss manuell editiert werden — der Service-Code referenziert dann die alten Files, die wir gelöscht haben. Praktischer: vom feature-Branch aus die `feat/radiacode-status-mirroring-and-rare-records`-HEAD hard-reset auf den Commit vor diesem.
