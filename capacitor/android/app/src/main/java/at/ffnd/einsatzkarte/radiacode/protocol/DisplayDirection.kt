package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Display orientation (Python `DisplayDirection` in radiacode/types.py).
 */
enum class DisplayDirection(val value: Int) {
    AUTO(0),
    RIGHT(1),
    LEFT(2),
}
