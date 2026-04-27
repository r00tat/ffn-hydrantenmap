package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Wire-protocol command opcodes (Python `COMMAND` in radiacode/types.py).
 */
enum class Command(val value: Int) {
    GET_STATUS(0x0005),
    SET_EXCHANGE(0x0007),
    GET_VERSION(0x000A),
    GET_SERIAL(0x000B),
    FW_IMAGE_GET_INFO(0x0012),
    FW_SIGNATURE(0x0101),
    RD_HW_CONFIG(0x0807),
    RD_VIRT_SFR(0x0824),
    WR_VIRT_SFR(0x0825),
    RD_VIRT_STRING(0x0826),
    WR_VIRT_STRING(0x0827),
    RD_VIRT_SFR_BATCH(0x082A),
    WR_VIRT_SFR_BATCH(0x082B),
    RD_FLASH(0x081C),
    SET_TIME(0x0A04),
}
