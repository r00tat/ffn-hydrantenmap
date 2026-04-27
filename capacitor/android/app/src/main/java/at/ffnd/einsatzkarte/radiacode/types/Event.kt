package at.ffnd.einsatzkarte.radiacode.types

import java.time.Instant

/**
 * Device event record.
 *
 * Mirrors Python `Event` from radiacode/types.py.
 */
data class Event(
    val dt: Instant,
    val event: EventId,
    val eventParam1: Int,
    val flags: Int,
)
