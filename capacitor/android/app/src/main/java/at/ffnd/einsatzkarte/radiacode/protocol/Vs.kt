package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Virtual-string identifiers (Python `VS` in radiacode/types.py).
 */
enum class Vs(val value: Int) {
    CONFIGURATION(2),
    FW_DESCRIPTOR(3),
    SERIAL_NUMBER(8),
    TEXT_MESSAGE(0xF),
    MEM_SNAPSHOT(0xE0),
    DATA_BUF(0x100),
    SFR_FILE(0x101),
    SPECTRUM(0x200),
    ENERGY_CALIB(0x202),
    SPEC_ACCUM(0x205),
    SPEC_DIFF(0x206),
    SPEC_RESET(0x207),
}
