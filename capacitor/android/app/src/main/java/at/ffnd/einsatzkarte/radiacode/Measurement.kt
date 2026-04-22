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
        while (data.size - off >= 7) {
            // seq@off, eid@off+1, gid@off+2, tsOffset@off+3 (i32)
            val eid = data[off + 1].toInt() and 0xff
            val gid = data[off + 2].toInt() and 0xff
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
                eid == 0 && gid == 7 -> {
                    if (data.size - off < 4) break
                    off += 4
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
                else -> break
            }
        }
        return out
    }
}
