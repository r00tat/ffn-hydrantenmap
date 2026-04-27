# Radiacode DATA_BUF Decoder Port (Python → Kotlin)

**Datum:** 2026-04-27
**Branch:** `feat/radiacode-status-mirroring-and-rare-records`
**Status:** Design

## Ziel

Das Decoding der Radiacode-Pakete in der Capacitor-Android-App auf eine
saubere Basis stellen. Quelle ist die Python-Referenzimplementierung in
`radiacode-python/src/radiacode/`. Portiert werden:

1. `types.py` — vollständig (alle Enums + Dataclasses + `_VSFR_FORMATS`)
2. `bytes_buffer.py` — als eigenständiger Helfer mit typisierten Reads
3. `decoders/databuf.py` — als kompletter `DataBufDecoder`

Der bestehende `MeasurementDecoder` bleibt parallel bestehen und wird
nicht angefasst (Risiko-Minimierung — der laufende Polling-Pfad in
`GattSession`/`RadiacodeForegroundService` bleibt unverändert).

## Nicht-Ziele

- Migration der Aufrufer (`MeasurementDecoder.parse(...)`-Konsumenten)
  bleibt einem späteren Schritt vorbehalten.
- Spektrum-Decoder (`SPECTRUM`-VS) wird nicht in diesem Schritt portiert.
- VSFR-Format-String-Parser (Python-`struct`-Notation) wird **nicht**
  reimplementiert — die Format-Strings werden als reine Strings am
  `Vsfr`-Enum geführt.

## Architektur

### Paketstruktur

```
at.ffnd.einsatzkarte.radiacode/
  Measurement.kt              ← Bestand, unverändert
  MeasurementDecoder.kt       ← Bestand, unverändert
  Protocol.kt                 ← Bestand, unverändert
  GattSession.kt              ← Bestand, unverändert
  Framing.kt                  ← Bestand, unverändert

  protocol/
    BytesBuffer.kt
    Command.kt        ← enum class (port von COMMAND)
    Vs.kt             ← enum class (port von VS)
    Vsfr.kt           ← enum class mit format: String? (port von VSFR + _VSFR_FORMATS)
    Ctrl.kt           ← enum class, bit flags (port von CTRL)
    DisplayDirection.kt ← enum class

  types/
    RealTimeData.kt
    RawData.kt
    DoseRateDB.kt
    RareData.kt
    Event.kt
    EventId.kt        ← enum class mit fromValue(Int)
    Spectrum.kt
    AlarmLimits.kt

  decoders/
    DataBufDecoder.kt
    DataBufRecord.kt  ← sealed class als Dispatch-Rückgabetyp
```

### Komponenten

#### `BytesBuffer` (Kotlin)

Mini-Helfer zum sequenziellen Lesen aus einem `ByteArray`. Statt
Python-`struct`-Format-Strings: typisierte Methoden, alle little-endian
(das Radiacode-Protokoll ist durchgängig LE).

```kotlin
class BytesBuffer(private val data: ByteArray) {
    private var pos = 0

    fun size(): Int                    // verbleibende Bytes
    fun remaining(): ByteArray         // Slice ab pos

    fun u8(): Int                      // unsigned 8 bit
    fun i8(): Int                      // signed 8 bit
    fun u16Le(): Int                   // unsigned 16 bit LE
    fun i16Le(): Int                   // signed 16 bit LE
    fun u32Le(): Long                  // unsigned 32 bit LE (als Long, weil UInt in API noch nicht überall)
    fun i32Le(): Int                   // signed 32 bit LE
    fun f32Le(): Float                 // 32 bit float LE
    fun f64Le(): Double                // 64 bit float LE
    fun bool(): Boolean                // 1 byte boolean (0 = false, sonst true)

    fun skip(n: Int)                   // n Bytes überspringen
    fun bytes(n: Int): ByteArray       // n Bytes als Kopie
    fun unpackString(): String         // <B s>: 1-byte-Länge + ASCII-String
}
```

Under-Read wirft `IllegalStateException` mit Format-Beschreibung
(Pendant zu Pythons `ValueError`).

#### `DataBufRecord` (sealed class)

```kotlin
sealed class DataBufRecord {
    data class RealTime(val data: RealTimeData) : DataBufRecord()
    data class Raw(val data: RawData) : DataBufRecord()
    data class DoseRate(val data: DoseRateDB) : DataBufRecord()
    data class Rare(val data: RareData) : DataBufRecord()
    data class Evt(val data: Event) : DataBufRecord()
}
```

#### `DataBufDecoder`

```kotlin
object DataBufDecoder {
    fun decode(
        buffer: BytesBuffer,
        baseTime: Instant,
        ignoreErrors: Boolean = true,
    ): List<DataBufRecord>
}
```

1:1-Port von `decode_VS_DATA_BUF`. Iteriert solange `buffer.size() >= 7`,
liest Header `(seq:u8, eid:u8, gid:u8, tsOffset:i32)`, dispatcht über
`(eid, gid)`. Skalierung wie im Python:

| Feld                     | Skalierung                  |
| ------------------------ | --------------------------- |
| `tsOffset` → `dt`        | `baseTime + tsOffset * 10ms` |
| `count_rate_err`         | `/ 10`                      |
| `dose_rate_err`          | `/ 10`                      |
| `temperature` (Rare)     | `(raw - 2000) / 100`        |
| `charge_level` (Rare)    | `raw / 100`                 |

Sequenz-Tracking: `nextSeq = (seq + 1) and 0xFF`. Bei Sprung break
(wie Python). Wraparound 255 → 0 ist korrekt (`& 0xFF`).

Branches `eid=0/gid=4..6,8,9` und `eid=1/gid=1..3` werden konsumiert
(Bytes vorgespult), liefern aber **keinen** Record — wie im Python.

Unbekannte `(eid, gid)` → break (wie Python).

### Datenfluss

```
RD_VIRT_STRING(DATA_BUF) Response
  │
  ▼
ByteArray (Body, Header bereits abgeschält)
  │
  ▼
BytesBuffer
  │
  ▼  DataBufDecoder.decode(buf, baseTime)
  │
  ▼
List<DataBufRecord>
```

Aufrufer (später) kann per `filterIsInstance<DataBufRecord.RealTime>()`
auf den gewünschten Record-Typ filtern.

### Fehlerverhalten

| Situation                          | `ignoreErrors=true` (default) | `ignoreErrors=false` |
| ---------------------------------- | ----------------------------- | -------------------- |
| Buffer leer / < 7 Byte             | leere Liste                   | leere Liste          |
| Sequenz-Sprung                     | break, bisher Decodiertes     | break, log warn      |
| Unbekannter `(eid, gid)`           | break, bisher Decodiertes     | break, log warn      |
| Under-Read in `BytesBuffer.unpack` | break (per try/catch)         | rethrow              |
| `eid=0/gid=4` Under-Read           | warn-log + break (wie Python) | rethrow              |

Logging via `android.util.Log` mit Tag `DataBufDecoder` — Konsistenz mit
bestehendem `MeasurementDecoder`.

## Tests (TDD-Reihenfolge)

Tests werden **vor** der Implementierung geschrieben. Ablauf pro Schritt:
Test schreiben → `./gradlew :app:test` (rot) → Implementierung → grün.

### `BytesBufferTest`

- `size()` auf leerem Buffer → 0
- `size()` nach mehreren Reads
- `u8()`, `i8()` mit Min/Max-Werten (0xFF → 255 / -1)
- `u16Le()`, `i16Le()` mit `0xFFFF` (65535 / -1)
- `u32Le()`, `i32Le()` mit `0xFFFF_FFFF` (4294967295L / -1)
- `f32Le()` mit IEEE-754-Bitmuster (z.B. `0x40490FDB` → ~3.14159)
- `f64Le()` mit IEEE-754-Bitmuster
- `bool()`: `0x00` → false, `0x01` → true, `0x7F` → true
- `skip(n)` ändert `size()`, ändert nicht den Bytestrom
- `bytes(n)` gibt Kopie zurück (Mutation der Kopie verändert Buffer nicht)
- `unpackString()`: leerer String (`<00>`), 5-Zeichen ASCII, voller Buffer
- Under-Read: `u32Le()` auf 3-Byte-Buffer → `IllegalStateException`
- Under-Read in `unpackString()` (Length-Byte sagt 5, nur 3 Bytes da)
- `remaining()` nach mehreren Reads liefert genau die Restbytes

### Type-Tests (kompakt)

- `EventIdTest`: `EventId.fromValue(0..22)` → korrektes Enum,
  `fromValue(99)` → null oder Exception (entscheiden — Python wirft
  `ValueError`, also: throw)
- `EventIdTest`: alle 23 Werte stimmen mit Python überein (Tabelle)
- `VsfrTest`: alle Werte aus `_VSFR_FORMATS` haben das richtige
  `format` (Tabelle), Einträge ohne Format haben `null`
- `VsTest`, `CommandTest`, `CtrlTest`, `DisplayDirectionTest`:
  Wert-Tabelle vergleichen

### `DataBufDecoderTest`

Helper im Test: `fun rec(seq, eid, gid, tsOffset, payload): ByteArray`
baut einen Record per `ByteBuffer` zusammen.

Cases:

1. Leerer Buffer → `[]`
2. Buffer mit 5 Bytes (< 7) → `[]`
3. **GRP_RealTimeData** (`eid=0,gid=0`): bekannte Bytes →
   `RealTimeData` mit `count_rate=42.5f`, `dose_rate=0.0001f`,
   `count_rate_err=12.3` (raw 123 /10), `dose_rate_err=4.5`,
   `flags=0x1234`, `real_time_flags=0x56`, `dt=baseTime + 100ms` (tsOffset=10)
4. **GRP_RawData** (`eid=0,gid=1`): → `RawData` mit count_rate, dose_rate
5. **GRP_DoseRateDB** (`eid=0,gid=2`): → `DoseRateDB`
6. **GRP_RareData** (`eid=0,gid=3`): temperatur-Rohwert 4500 → 25.0,
   charge-Rohwert 8750 → 87.5
7. **GRP_UserData** (`eid=0,gid=4`): konsumiert 16 Byte, kein Record erzeugt
8. **GRP_SheduleData** (`eid=0,gid=5`): konsumiert 16 Byte, kein Record
9. **GRP_AccelData** (`eid=0,gid=6`): konsumiert 6 Byte, kein Record
10. **GRP_Event** (`eid=0,gid=7`): event=5 → `Event` mit `EventId.USER_EVENT`
11. **GRP_Event** (`eid=0,gid=7`): alle 23 EventIds (parametrisiert)
12. **GRP_RawCountRate** (`eid=0,gid=8`): konsumiert 6 Byte, kein Record
13. **GRP_RawDoseRate** (`eid=0,gid=9`): konsumiert 6 Byte, kein Record
14. **`eid=1,gid=1`**: variable Länge `samples_num=2` → 6 + 2*8 = 22 Byte verbraucht
15. **`eid=1,gid=2`**: `samples_num=3` → 6 + 3*16 = 54 Byte verbraucht
16. **`eid=1,gid=3`**: `samples_num=1` → 6 + 1*14 = 20 Byte verbraucht
17. Drei aufeinanderfolgende Records mit Sequenzen 0,1,2 → alle 3 dekodiert
18. Sequenz-Wraparound: 254, 255, 0 → alle 3 dekodiert (kein falscher Sprung)
19. Sequenz-Sprung 0, 2 (1 fehlt), `ignoreErrors=true` → 1 Record + break, kein Throw
20. Sequenz-Sprung mit `ignoreErrors=false` → 1 Record + break (kein Throw,
    Python-Original macht nur print + break — keine Exception)
21. Unbekannter `(eid=2, gid=0)` mit `ignoreErrors=true` → break, vorherige Records erhalten
22. Unbekannter `(eid=2, gid=0)` mit `ignoreErrors=false` → break + log warn
23. Truncated record (Header + nur 5 Byte für GRP_RealTimeData statt 15) →
    break ohne Crash
24. `tsOffset = 100` → `dt = baseTime + 1000ms`
25. `tsOffset = -50` → `dt = baseTime - 500ms` (signed!)

### Coverage-Ziel

100% Lines + 100% Branches im Decoder + BytesBuffer. Verifikation
zunächst manuell über `when`-Arm-Mapping zu Test-Cases. Optional später
Jacoco einbinden (eigener Branch).

## Build / CI

- JUnit4 (`junit:junit:$junitVersion`) ist bereits konfiguriert
- Tests laufen über `cd capacitor/android && ./gradlew :app:testDebugUnitTest`
- Keine neuen Dependencies notwendig
- Keine Kotlin-Coroutines/Android-SDK-APIs in Decoder/Types/BytesBuffer
  (außer `android.util.Log` im Decoder — testbar via JUnit, weil die
  bestehenden Tests im selben Stil laufen)

## Migration-Pfad (zukünftig, nicht in diesem Schritt)

1. `MeasurementDecoder.parse()` als Adapter umbauen, der intern
   `DataBufDecoder.decode()` aufruft und das Ergebnis auf den
   bestehenden `Measurement`-Typ projiziert
2. Alten internen `decodeRecords` aus `MeasurementDecoder` entfernen
3. `Protocol.kt` durch die neuen Enums (`Command`, `Vs`, `Vsfr`, `Ctrl`)
   ersetzen, alte `object`-Konstanten deprecaten

## Risiken

- **Spec-Drift Python ↔ Kotlin:** Wenn `radiacode-python` upstream
  geändert wird, läuft unsere Kopie auseinander. Mitigation: Die
  Format-Strings in den Tests als Konstanten festziehen, damit jede
  Spec-Änderung beim Test-Update sichtbar wird.
- **`android.util.Log` im Unit-Test:** In bestehenden Tests im
  `track/`-Subpackage wird `android.util.Log` nicht verwendet. Falls
  JUnit ohne Robolectric `Log.d` mit `RuntimeException("not mocked")`
  zurückweist, ziehen wir das Logging hinter ein injizierbares
  `Logger`-Interface (Default: `android.util.Log`-Wrapper, im Test:
  Capture-Logger).
- **Signed/unsigned `u32`:** Python-`I` ist unsigned 32 bit. Kotlin
  hat `Int` (signed) — ich verwende `Long` als Trägertyp für `u32Le()`.
  Im Decoder selber wird `count` (u32) als `Long` durchgereicht und in
  `DoseRateDB`/etc. als `Long` gespeichert. **Achtung:** das ist eine
  Spec-Abweichung gegenüber dem bestehenden `MeasurementDecoder`, der
  `Int` verwendet. Wir akzeptieren die Abweichung, weil der neue
  Decoder eigene Datentypen nutzt.

## Offene Punkte

- Soll `EventId.fromValue(unknown)` werfen oder `null` liefern? Python
  wirft `ValueError`. Vorschlag: werfen, aber im Decoder per
  try/catch in den `ignoreErrors`-Pfad einschleusen (analog zu
  `eid=0/gid=4` im Python-Original).
