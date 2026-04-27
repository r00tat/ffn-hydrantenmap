package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.types.DoseRateDB
import at.ffnd.einsatzkarte.radiacode.types.Event
import at.ffnd.einsatzkarte.radiacode.types.RareData
import at.ffnd.einsatzkarte.radiacode.types.RawData
import at.ffnd.einsatzkarte.radiacode.types.RealTimeData

/**
 * Sum type wrapping the per-record variants emitted by [DataBufDecoder].
 *
 * Mirrors the union return type of Python's `decode_VS_DATA_BUF`
 * (`list[RealTimeData | DoseRateDB | RareData | RawData | Event]`).
 *
 * Branches that Python silently consumes (e.g. `GRP_UserData`,
 * `GRP_AccelData`) do not have a variant here — the decoder advances
 * past their payload but emits no record.
 */
sealed class DataBufRecord {
    data class RealTime(val data: RealTimeData) : DataBufRecord()
    data class Raw(val data: RawData) : DataBufRecord()
    data class DoseRate(val data: DoseRateDB) : DataBufRecord()
    data class Rare(val data: RareData) : DataBufRecord()
    data class Evt(val data: Event) : DataBufRecord()
}
