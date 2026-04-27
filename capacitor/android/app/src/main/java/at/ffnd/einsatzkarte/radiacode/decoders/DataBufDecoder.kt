package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.types.DoseRateDB
import at.ffnd.einsatzkarte.radiacode.types.Event
import at.ffnd.einsatzkarte.radiacode.types.EventId
import at.ffnd.einsatzkarte.radiacode.types.RareData
import at.ffnd.einsatzkarte.radiacode.types.RawData
import at.ffnd.einsatzkarte.radiacode.types.RealTimeData
import java.time.Instant

/**
 * Port of `radiacode-python/src/radiacode/decoders/databuf.py`
 * (`decode_VS_DATA_BUF`).
 *
 * Decodes a sequence of fixed-header (`<BBBi>`: seq, eid, gid, ts_offset)
 * records from a [BytesBuffer]. Each record's `ts_offset` is interpreted
 * as a signed 32-bit count of 10ms ticks relative to [Instant], so a
 * negative offset yields a timestamp in the past.
 *
 * Behaviour deviation from Python (intentional, design decision):
 * Python only catches `ValueError` in the `(0,4)` branch. We extend that
 * pattern to all branches — under-reads (`IllegalStateException`) and
 * unknown EventIds (`IllegalArgumentException`) inside any per-branch
 * read are caught when [decode]'s `ignoreErrors` is true and the loop
 * breaks cleanly with the records collected so far. With `ignoreErrors`
 * = false the exceptions propagate.
 *
 * Sequence-jumps and unknown `(eid, gid)` combinations never throw —
 * they always break the loop (matching Python's `print + break`).
 */
object DataBufDecoder {

    // Sample sizes for the (eid=1, gid=1..3) record families. The record formats
    // themselves are unknown (Python source: "# ???"), but the per-sample byte
    // counts are observed and used here only to advance the buffer cursor.
    private const val EID1_GID1_BYTES_PER_SAMPLE = 8
    private const val EID1_GID2_BYTES_PER_SAMPLE = 16
    private const val EID1_GID3_BYTES_PER_SAMPLE = 14

    /**
     * Decode `DATA_BUF` records from [buffer].
     *
     * @param buffer source positioned at the first record header.
     * @param baseTime reference timestamp for the `ts_offset` ticks.
     * @param ignoreErrors when true, errors break the loop and return the
     *   records collected so far; when false, under-read and invalid
     *   EventId errors are rethrown.
     * @param logger receives a single line for each non-fatal anomaly
     *   (sequence jump, unknown record type, swallowed under-read). The
     *   default routes to `android.util.Log.w("DataBufDecoder", …)`.
     *   Pass a no-op or capturing lambda in unit tests.
     */
    fun decode(
        buffer: BytesBuffer,
        baseTime: Instant,
        ignoreErrors: Boolean = true,
        logger: (String) -> Unit = { msg -> android.util.Log.w("DataBufDecoder", msg) },
    ): List<DataBufRecord> {
        val out = mutableListOf<DataBufRecord>()
        var nextSeq: Int? = null

        while (buffer.size() >= 7) {
            // Header is guaranteed to fit because of the size() >= 7 guard.
            val seq = buffer.u8()
            val eid = buffer.u8()
            val gid = buffer.u8()
            val tsOffset = buffer.i32Le()

            // 10ms ticks; signed offset → can move backwards in time.
            val dt = baseTime.plusMillis(tsOffset.toLong() * 10L)

            if (nextSeq != null && nextSeq != seq) {
                if (!ignoreErrors) {
                    logger(
                        "seq jump while processing eid=$eid gid=$gid, " +
                            "expect:$nextSeq got:$seq remaining=${buffer.size()}",
                    )
                }
                break
            }
            nextSeq = (seq + 1) and 0xFF

            try {
                when {
                    eid == 0 && gid == 0 -> {
                        // GRP_RealTimeData: <ffHHHB> (15 bytes)
                        val countRate = buffer.f32Le()
                        val doseRate = buffer.f32Le()
                        val countRateErr = buffer.u16Le()
                        val doseRateErr = buffer.u16Le()
                        val flags = buffer.u16Le()
                        val rtFlags = buffer.u8()
                        out.add(
                            DataBufRecord.RealTime(
                                RealTimeData(
                                    dt = dt,
                                    countRate = countRate,
                                    countRateErr = countRateErr / 10.0,
                                    doseRate = doseRate,
                                    doseRateErr = doseRateErr / 10.0,
                                    flags = flags,
                                    realTimeFlags = rtFlags,
                                ),
                            ),
                        )
                    }
                    eid == 0 && gid == 1 -> {
                        // GRP_RawData: <ff> (8 bytes)
                        val countRate = buffer.f32Le()
                        val doseRate = buffer.f32Le()
                        out.add(
                            DataBufRecord.Raw(
                                RawData(dt = dt, countRate = countRate, doseRate = doseRate),
                            ),
                        )
                    }
                    eid == 0 && gid == 2 -> {
                        // GRP_DoseRateDB: <IffHH> (16 bytes)
                        val count = buffer.u32Le()
                        val countRate = buffer.f32Le()
                        val doseRate = buffer.f32Le()
                        val doseRateErr = buffer.u16Le()
                        val flags = buffer.u16Le()
                        out.add(
                            DataBufRecord.DoseRate(
                                DoseRateDB(
                                    dt = dt,
                                    count = count,
                                    countRate = countRate,
                                    doseRate = doseRate,
                                    doseRateErr = doseRateErr / 10.0,
                                    flags = flags,
                                ),
                            ),
                        )
                    }
                    eid == 0 && gid == 3 -> {
                        // GRP_RareData: <IfHHH> (14 bytes)
                        val duration = buffer.u32Le()
                        val dose = buffer.f32Le()
                        val temperatureRaw = buffer.u16Le()
                        val chargeRaw = buffer.u16Le()
                        val flags = buffer.u16Le()
                        out.add(
                            DataBufRecord.Rare(
                                RareData(
                                    dt = dt,
                                    duration = duration,
                                    dose = dose,
                                    temperature = (temperatureRaw - 2000) / 100.0,
                                    chargeLevel = chargeRaw / 100.0,
                                    flags = flags,
                                ),
                            ),
                        )
                    }
                    eid == 0 && gid == 4 -> {
                        // GRP_UserData: <IffHH> (16 bytes); no record. Under-read here is
                        // diagnosed by the outer catch ladder ("under-read while decoding
                        // eid=0 gid=4 …"), matching Python's silent skip semantics.
                        buffer.u32Le() // count
                        buffer.f32Le() // count_rate
                        buffer.f32Le() // dose_rate
                        buffer.u16Le() // dose_rate_err
                        buffer.u16Le() // flags
                    }
                    eid == 0 && gid == 5 -> {
                        // GRP_SheduleData: <IffHH> (16 bytes); no record.
                        buffer.u32Le()
                        buffer.f32Le()
                        buffer.f32Le()
                        buffer.u16Le()
                        buffer.u16Le()
                    }
                    eid == 0 && gid == 6 -> {
                        // GRP_AccelData: <HHH> (6 bytes); no record.
                        buffer.u16Le()
                        buffer.u16Le()
                        buffer.u16Le()
                    }
                    eid == 0 && gid == 7 -> {
                        // GRP_Event: <BBH> (4 bytes)
                        val eventValue = buffer.u8()
                        val eventParam1 = buffer.u8()
                        val flags = buffer.u16Le()
                        out.add(
                            DataBufRecord.Evt(
                                Event(
                                    dt = dt,
                                    event = EventId.fromValue(eventValue),
                                    eventParam1 = eventParam1,
                                    flags = flags,
                                ),
                            ),
                        )
                    }
                    eid == 0 && gid == 8 -> {
                        // GRP_RawCountRate: <fH> (6 bytes); no record.
                        buffer.f32Le()
                        buffer.u16Le()
                    }
                    eid == 0 && gid == 9 -> {
                        // GRP_RawDoseRate: <fH> (6 bytes); no record.
                        buffer.f32Le()
                        buffer.u16Le()
                    }
                    eid == 1 && gid == 1 -> {
                        // ??? <HI> + samples_num * EID1_GID1_BYTES_PER_SAMPLE; no record.
                        val samplesNum = buffer.u16Le()
                        buffer.u32Le() // sample_time_ms
                        buffer.skip(samplesNum * EID1_GID1_BYTES_PER_SAMPLE)
                    }
                    eid == 1 && gid == 2 -> {
                        // ??? <HI> + samples_num * EID1_GID2_BYTES_PER_SAMPLE; no record.
                        val samplesNum = buffer.u16Le()
                        buffer.u32Le()
                        buffer.skip(samplesNum * EID1_GID2_BYTES_PER_SAMPLE)
                    }
                    eid == 1 && gid == 3 -> {
                        // ??? <HI> + samples_num * EID1_GID3_BYTES_PER_SAMPLE; no record.
                        val samplesNum = buffer.u16Le()
                        buffer.u32Le()
                        buffer.skip(samplesNum * EID1_GID3_BYTES_PER_SAMPLE)
                    }
                    else -> {
                        if (!ignoreErrors) {
                            logger("Unknown eid:$eid gid:$gid")
                        }
                        break
                    }
                }
            } catch (e: IllegalStateException) {
                // Under-read inside a per-branch payload decode.
                if (ignoreErrors) {
                    logger("under-read while decoding eid=$eid gid=$gid: ${e.message}")
                    break
                } else {
                    throw e
                }
            } catch (e: IllegalArgumentException) {
                // Invalid EventId from EventId.fromValue.
                if (ignoreErrors) {
                    logger("invalid value while decoding eid=$eid gid=$gid: ${e.message}")
                    break
                } else {
                    throw e
                }
            }
        }

        return out
    }
}
