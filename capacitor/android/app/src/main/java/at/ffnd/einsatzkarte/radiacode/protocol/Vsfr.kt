package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Virtual SFR identifiers (Python `VSFR` in radiacode/types.py).
 *
 * The optional [format] column is the Python `struct` format string from
 * `_VSFR_FORMATS` in the same Python module. `null` for entries with no
 * registered format. Format strings use Python `struct` semantics, e.g.
 * `"3xB"` = skip 3 bytes, then unsigned byte.
 *
 * The [format] property has no consumer in this module yet — it is kept as
 * opaque metadata to make a future VSFR read/write path easier to implement
 * faithfully. **Do not write a runtime parser for these strings.** When a
 * consumer materializes, replace [format] with typed reader/writer fields so
 * the schema lives in one place.
 *
 * NOTE: `SYS_FW_VER_BT` keeps the Python literal `0xFFFF010` (7 hex digits) as
 * written in the source — do NOT pad to `0xFFFFF010`.
 */
enum class Vsfr(val value: Int, val format: String?) {
    DEVICE_CTRL(0x0500, "3xB"),
    DEVICE_LANG(0x0502, "3xB"),
    DEVICE_ON(0x0503, "3x?"),
    DEVICE_TIME(0x0504, "I"),

    DISP_CTRL(0x0510, "3xB"),
    DISP_BRT(0x0511, "3xB"),
    DISP_CONTR(0x0512, "3xB"),
    DISP_OFF_TIME(0x0513, "I"),
    DISP_ON(0x0514, "3x?"),
    DISP_DIR(0x0515, "3xB"),
    DISP_BACKLT_ON(0x0516, "3x?"),

    SOUND_CTRL(0x0520, "2xH"),
    SOUND_VOL(0x0521, "3xB"),
    SOUND_ON(0x0522, "3x?"),
    SOUND_BUTTON(0x0523, null),

    VIBRO_CTRL(0x0530, "3xB"),
    VIBRO_ON(0x0531, "3x?"),

    LEDS_CTRL(0x0540, null),
    LED0_BRT(0x0541, null),
    LED1_BRT(0x0542, null),
    LED2_BRT(0x0543, null),
    LED3_BRT(0x0544, null),
    LEDS_ON(0x0545, null),

    ALARM_MODE(0x05E0, "3xB"),
    PLAY_SIGNAL(0x05E1, "3xB"),

    MS_CTRL(0x0600, null),
    MS_MODE(0x0601, null),
    MS_SUB_MODE(0x0602, null),
    MS_RUN(0x0603, "3x?"),

    BLE_TX_PWR(0x0700, "3xB"),

    DR_LEV1_uR_h(0x8000, "I"),
    DR_LEV2_uR_h(0x8001, "I"),
    DS_LEV1_100uR(0x8002, "I"),
    DS_LEV2_100uR(0x8003, "I"),
    DS_UNITS(0x8004, "3x?"),
    CPS_FILTER(0x8005, "3xB"),
    RAW_FILTER(0x8006, null),
    DOSE_RESET(0x8007, "3x?"),
    CR_LEV1_cp10s(0x8008, "I"),
    CR_LEV2_cp10s(0x8009, "I"),

    USE_nSv_h(0x800C, "3x?"),

    CHN_TO_keV_A0(0x8010, "f"),
    CHN_TO_keV_A1(0x8011, "f"),
    CHN_TO_keV_A2(0x8012, "f"),
    CR_UNITS(0x8013, "3x?"),
    DS_LEV1_uR(0x8014, "I"),
    DS_LEV2_uR(0x8015, "I"),

    CPS(0x8020, "I"),
    DR_uR_h(0x8021, "I"),
    DS_uR(0x8022, "I"),

    TEMP_degC(0x8024, "f"),
    ACC_X(0x8025, "2xh"),
    ACC_Y(0x8026, "2xh"),
    ACC_Z(0x8027, "2xh"),
    OPT(0x8028, "2xH"),

    RAW_TEMP_degC(0x8033, "f"),
    TEMP_UP_degC(0x8034, "f"),
    TEMP_DN_degC(0x8035, "f"),

    VBIAS_mV(0xC000, "2xH"),
    COMP_LEV(0xC001, "2xh"),
    CALIB_MODE(0xC002, "3x?"),
    DPOT_RDAC(0xC004, "3xB"),
    DPOT_RDAC_EEPROM(0xC005, "3xB"),
    DPOT_TOLER(0xC006, "3xB"),

    SYS_MCU_ID0(0xFFFF0000.toInt(), "I"),
    SYS_MCU_ID1(0xFFFF0001.toInt(), "I"),
    SYS_MCU_ID2(0xFFFF0002.toInt(), "I"),

    SYS_DEVICE_ID(0xFFFF0005.toInt(), "I"),
    SYS_SIGNATURE(0xFFFF0006.toInt(), "I"),
    SYS_RX_SIZE(0xFFFF0007.toInt(), "2xH"),
    SYS_TX_SIZE(0xFFFF0008.toInt(), "2xH"),
    SYS_BOOT_VERSION(0xFFFF0009.toInt(), "I"),
    SYS_TARGET_VERSION(0xFFFF000A.toInt(), "I"),
    SYS_STATUS(0xFFFF000B.toInt(), "I"),
    SYS_MCU_VREF(0xFFFF000C.toInt(), "i"),
    SYS_MCU_TEMP(0xFFFF000D.toInt(), "i"),
    SYS_FW_VER_BT(0xFFFF010, null),
}
