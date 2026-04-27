package at.ffnd.einsatzkarte.radiacode

import at.ffnd.einsatzkarte.radiacode.decoders.DataBufRecord

/**
 * Maps a polling result from [RadiaCode.dataBuf] into the legacy
 * [Measurement] DTO that the JS-Plugin (`RadiacodeNotificationPlugin`) and
 * [at.ffnd.einsatzkarte.radiacode.track.TrackRecorder] consume.
 *
 * Behaviour mirrors the previous `MeasurementDecoder.parse` semantics:
 *  - Picks the **latest** RealTime record from the batch — without one, the
 *    poll tick produces no measurement at all.
 *  - Optionally augments with the **latest** Rare record (battery/dose/temp).
 *
 * Unit conversions match the existing TS client (`extractLatestMeasurement`)
 * and the legacy decoder:
 *  - dose-rate (Sv/h on the wire) → µSv/h via ×10_000
 *  - rare.dose (mSv on the wire) → µSv via ×1_000
 *  - countRateErr / doseRateErr already come pre-divided as percentages from [DataBufDecoder]
 */
object MeasurementMapper {
    private const val DOSE_RATE_TO_USVH = 10_000.0
    private const val DOSE_RAW_TO_USV = 1_000.0

    fun map(records: List<DataBufRecord>): Measurement? {
        val realtime = records.asReversed()
            .firstNotNullOfOrNull { (it as? DataBufRecord.RealTime)?.data }
            ?: return null
        val rare = records.asReversed()
            .firstNotNullOfOrNull { (it as? DataBufRecord.Rare)?.data }

        return Measurement(
            timestampMs = System.currentTimeMillis(),
            dosisleistungUSvH = realtime.doseRate * DOSE_RATE_TO_USVH,
            cps = realtime.countRate.toDouble(),
            doseUSv = rare?.let { it.dose * DOSE_RAW_TO_USV },
            durationSec = rare?.duration?.toInt(),
            temperatureC = rare?.temperature,
            chargePct = rare?.chargeLevel,
            dosisleistungErrPct = realtime.doseRateErr,
            cpsErrPct = realtime.countRateErr,
        )
    }
}
