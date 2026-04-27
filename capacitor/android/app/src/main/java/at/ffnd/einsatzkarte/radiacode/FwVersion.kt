package at.ffnd.einsatzkarte.radiacode

/**
 * Firmware version triple (major, minor, build-date string).
 *
 * Mirrors the Python `(vmaj, vmin, vdate)` tuple returned by
 * `RadiaCode.fw_version()`.
 */
data class FwVersion(val major: Int, val minor: Int, val date: String)
