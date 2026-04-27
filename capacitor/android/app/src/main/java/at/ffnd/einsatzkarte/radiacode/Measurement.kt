package at.ffnd.einsatzkarte.radiacode

/**
 * Wire-Format zwischen [RadiacodeForegroundService][at.ffnd.einsatzkarte.RadiacodeForegroundService]
 * und der JS-Seite (`RadiacodeNotificationPlugin.emitMeasurement`). Wird im
 * Service per [MeasurementMapper] aus den `DataBufRecord`-Records von
 * [RadiaCode.dataBuf] befüllt; die JS-Seite mappt das Event in
 * `RadiacodeMeasurement` (siehe `nativeBridge.ts`).
 *
 * Einheiten:
 *  - `dosisleistungUSvH` — µSv/h (`realtime.doseRate * 10_000`, doseRate ist Sv/h)
 *  - `cps` — counts per second (Float, hier als Double)
 *  - `doseUSv` — µSv (`rare.dose * 1_000`, dose ist mSv)
 *  - `temperatureC` — °C
 *  - `chargePct` — Akku-Ladestand 0..100
 *  - `dosisleistungErrPct`, `cpsErrPct` — Mess-Unsicherheiten in Prozent
 *  - `timestampMs` — `System.currentTimeMillis()` zum Zeitpunkt des Mappings
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
