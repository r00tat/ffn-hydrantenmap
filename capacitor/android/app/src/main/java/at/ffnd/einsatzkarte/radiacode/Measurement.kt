package at.ffnd.einsatzkarte.radiacode

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Portierter Measurement-Decoder aus src/hooks/radiacode/client.ts
 * (`extractLatestMeasurement`). Verarbeitet den Payload einer
 * `RD_VIRT_STRING(DATA_BUF)`-Antwort und extrahiert den jüngsten
 * Realtime-/Rare-Record.
 *
 * Einheiten wie im TS-Client:
 *  - dosisleistungUSvH = realtime.doseRate * 10_000  (doseRate ist Sv/h)
 *  - doseUSv           = rare.dose_raw_mSv * 1_000
 *  - timestampMs       = System.currentTimeMillis()
 */
data class Measurement(
    val timestampMs: Long,
    val dosisleistungUSvH: Double,
    val cps: Double,
    val doseUSv: Double?,
    val durationSec: Int?,
    val temperatureC: Double?,
    val chargePct: Double?,
    val dosisleistungErrPct: Double?,
    val cpsErrPct: Double?,
)

object MeasurementDecoder {
    private const val DOSE_RATE_TO_USVH = 10_000.0
    private const val DOSE_RAW_TO_USV = 1_000.0

    /**
     * Parst einen kompletten `RD_VIRT_STRING(DATA_BUF)`-Response (ohne Header,
     * also ab `data` aus [ParsedResponse]). Body-Layout:
     *   `<retcode:u32><flen:u32><records…>`
     */
    fun parse(data: ByteArray): Measurement? {
        if (data.size < 8) return null
        val records = decodeRecords(data, 8)

        // Diagnose-Log: Rare-Records sollen regelmäßig auftauchen, sobald das
        // Gerät verbunden ist. Wenn `rare=0` über lange Zeit dauerhaft bleibt,
        // liefert das Gerät keine Akku-/Dosis-/Temperatur-Snapshots aus —
        // das deutet auf ein Handshake-/DEVICE_TIME-Cursor-Problem hin.
        val realtimeCount = records.count { it is Record.Realtime }
        val rareCount = records.count { it is Record.Rare }
        android.util.Log.d(
            "MeasurementDecoder",
            "parse — realtime=$realtimeCount rare=$rareCount totalRecords=${records.size}",
        )

        val realtime = records.lastOrNull { it is Record.Realtime } as? Record.Realtime
            ?: return null
        val rare = records.lastOrNull { it is Record.Rare } as? Record.Rare

        return Measurement(
            timestampMs = System.currentTimeMillis(),
            dosisleistungUSvH = realtime.doseRate * DOSE_RATE_TO_USVH,
            cps = realtime.countRate.toDouble(),
            doseUSv = rare?.let { it.dose * DOSE_RAW_TO_USV },
            durationSec = rare?.duration,
            temperatureC = rare?.temperatureC,
            chargePct = rare?.chargePct,
            dosisleistungErrPct = realtime.doseRateErrPct,
            cpsErrPct = realtime.countRateErrPct,
        )
    }

    private sealed class Record {
        data class Realtime(
            val countRate: Float,
            val doseRate: Double,
            val countRateErrPct: Double,
            val doseRateErrPct: Double,
        ) : Record()

        data class Rare(
            val duration: Int,
            val dose: Double,
            val temperatureC: Double,
            val chargePct: Double,
        ) : Record()

        object Other : Record()
    }

    private fun decodeRecords(data: ByteArray, startOffset: Int): List<Record> {
        val out = ArrayList<Record>()
        val bb = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        var off = startOffset
        // Diagnose: alle (eid,gid)-Kombinationen, die wir im Stream sehen.
        // Hilft zu erkennen, ob das Gerät einen unbekannten Record-Type schickt
        // (worauf der Decoder im else-Branch abbricht und damit alle dahinter
        // liegenden gid=3-Rare-Records verloren gehen würden).
        val seenTypes = ArrayList<String>()
        // Sequenznummer-Verifikation analog radiacode-py: jeder Record führt
        // einen byte-Counter mit, der pro Record um 1 steigt. Wenn der Counter
        // springt, sind wir in unsicherem Territorium gelandet (z.B. weil
        // ein Längen-Mismatch den Cursor verschoben hat) — sauber abbrechen,
        // statt Müll zu parsen.
        var nextSeq: Int? = null
        while (data.size - off >= 7) {
            // seq@off, eid@off+1, gid@off+2, tsOffset@off+3 (i32)
            val seq = data[off].toInt() and 0xff
            val eid = data[off + 1].toInt() and 0xff
            val gid = data[off + 2].toInt() and 0xff
            if (nextSeq != null && nextSeq != seq) {
                android.util.Log.w(
                    "MeasurementDecoder",
                    "decode break — seq jump expected=$nextSeq got=$seq eid=$eid gid=$gid",
                )
                break
            }
            nextSeq = (seq + 1) and 0xff
            seenTypes.add("$eid:$gid")
            off += 7
            when {
                eid == 0 && gid == 0 -> {
                    if (data.size - off < 15) break
                    val countRate = bb.getFloat(off)
                    val doseRate = bb.getFloat(off + 4)
                    val cpsErr = (bb.getShort(off + 8).toInt() and 0xffff) / 10.0
                    val drErr = (bb.getShort(off + 10).toInt() and 0xffff) / 10.0
                    out.add(
                        Record.Realtime(
                            countRate = countRate,
                            doseRate = doseRate.toDouble(),
                            countRateErrPct = cpsErr,
                            doseRateErrPct = drErr,
                        )
                    )
                    off += 15
                }
                eid == 0 && gid == 1 -> {
                    if (data.size - off < 8) break
                    off += 8
                    out.add(Record.Other)
                }
                eid == 0 && gid == 2 -> {
                    if (data.size - off < 16) break
                    off += 16
                    out.add(Record.Other)
                }
                eid == 0 && gid == 3 -> {
                    if (data.size - off < 14) break
                    val duration = bb.getInt(off)
                    val dose = bb.getFloat(off + 4)
                    val temperatureRaw = bb.getShort(off + 8).toInt() and 0xffff
                    val chargeRaw = bb.getShort(off + 10).toInt() and 0xffff
                    out.add(
                        Record.Rare(
                            duration = duration,
                            dose = dose.toDouble(),
                            temperatureC = (temperatureRaw - 2000) / 100.0,
                            chargePct = chargeRaw / 100.0,
                        )
                    )
                    off += 14
                }
                eid == 0 && gid == 4 -> {
                    // GRP_UserData (radiacode-py): <I f f H H> = 16 bytes
                    if (data.size - off < 16) break
                    off += 16
                    out.add(Record.Other)
                }
                eid == 0 && gid == 5 -> {
                    // GRP_SheduleData: <I f f H H> = 16 bytes
                    if (data.size - off < 16) break
                    off += 16
                    out.add(Record.Other)
                }
                eid == 0 && gid == 6 -> {
                    // GRP_AccelData: <H H H> = 6 bytes
                    if (data.size - off < 6) break
                    off += 6
                    out.add(Record.Other)
                }
                eid == 0 && gid == 7 -> {
                    if (data.size - off < 4) break
                    off += 4
                    out.add(Record.Other)
                }
                eid == 0 && gid == 8 -> {
                    // GRP_RawCountRate: <f H> = 6 bytes
                    if (data.size - off < 6) break
                    off += 6
                    out.add(Record.Other)
                }
                eid == 0 && gid == 9 -> {
                    // GRP_RawDoseRate: <f H> = 6 bytes
                    if (data.size - off < 6) break
                    off += 6
                    out.add(Record.Other)
                }
                eid == 1 && (gid == 1 || gid == 2 || gid == 3) -> {
                    if (data.size - off < 6) break
                    val samplesNum = bb.getShort(off).toInt() and 0xffff
                    val perSample = when (gid) {
                        1 -> 8
                        2 -> 16
                        else -> 14
                    }
                    val payloadLen = 6 + samplesNum * perSample
                    if (data.size - off < payloadLen) break
                    off += payloadLen
                    out.add(Record.Other)
                }
                else -> {
                    android.util.Log.w(
                        "MeasurementDecoder",
                        "decode break — unbekannter record-type eid=$eid gid=$gid; " +
                            "vorher gesehen: ${seenTypes.joinToString(",")}",
                    )
                    break
                }
            }
        }
        android.util.Log.d(
            "MeasurementDecoder",
            "records — ${seenTypes.joinToString(",")}",
        )
        return out
    }
}
