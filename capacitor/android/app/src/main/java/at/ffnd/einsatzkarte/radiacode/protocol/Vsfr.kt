package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Virtual SFR identifiers (Python `VSFR` in radiacode/types.py).
 *
 * The optional [format] column corresponds to the Python `struct` format
 * string from `_VSFR_FORMATS` in the same Python module. `null` for entries
 * with no registered format. The Python strings are translated 1:1 into
 * typed [VsfrFormat] variants so the schema lives in one place and decoding
 * is type-safe.
 *
 * NOTE: `SYS_FW_VER_BT` keeps the Python literal `0xFFFF010` (7 hex digits) as
 * written in the source — do NOT pad to `0xFFFFF010`.
 */
enum class Vsfr(val value: Int, val format: VsfrFormat?) {
    DEVICE_CTRL(0x0500, VsfrFormat.ThreeXByte),
    DEVICE_LANG(0x0502, VsfrFormat.ThreeXByte),
    DEVICE_ON(0x0503, VsfrFormat.ThreeXBool),
    DEVICE_TIME(0x0504, VsfrFormat.U32),

    DISP_CTRL(0x0510, VsfrFormat.ThreeXByte),
    DISP_BRT(0x0511, VsfrFormat.ThreeXByte),
    DISP_CONTR(0x0512, VsfrFormat.ThreeXByte),
    DISP_OFF_TIME(0x0513, VsfrFormat.U32),
    DISP_ON(0x0514, VsfrFormat.ThreeXBool),
    DISP_DIR(0x0515, VsfrFormat.ThreeXByte),
    DISP_BACKLT_ON(0x0516, VsfrFormat.ThreeXBool),

    SOUND_CTRL(0x0520, VsfrFormat.TwoXUShort),
    SOUND_VOL(0x0521, VsfrFormat.ThreeXByte),
    SOUND_ON(0x0522, VsfrFormat.ThreeXBool),
    SOUND_BUTTON(0x0523, null),

    VIBRO_CTRL(0x0530, VsfrFormat.ThreeXByte),
    VIBRO_ON(0x0531, VsfrFormat.ThreeXBool),

    LEDS_CTRL(0x0540, null),
    LED0_BRT(0x0541, null),
    LED1_BRT(0x0542, null),
    LED2_BRT(0x0543, null),
    LED3_BRT(0x0544, null),
    LEDS_ON(0x0545, null),

    ALARM_MODE(0x05E0, VsfrFormat.ThreeXByte),
    PLAY_SIGNAL(0x05E1, VsfrFormat.ThreeXByte),

    MS_CTRL(0x0600, null),
    MS_MODE(0x0601, null),
    MS_SUB_MODE(0x0602, null),
    MS_RUN(0x0603, VsfrFormat.ThreeXBool),

    BLE_TX_PWR(0x0700, VsfrFormat.ThreeXByte),

    DR_LEV1_uR_h(0x8000, VsfrFormat.U32),
    DR_LEV2_uR_h(0x8001, VsfrFormat.U32),
    DS_LEV1_100uR(0x8002, VsfrFormat.U32),
    DS_LEV2_100uR(0x8003, VsfrFormat.U32),
    DS_UNITS(0x8004, VsfrFormat.ThreeXBool),
    CPS_FILTER(0x8005, VsfrFormat.ThreeXByte),
    RAW_FILTER(0x8006, null),
    DOSE_RESET(0x8007, VsfrFormat.ThreeXBool),
    CR_LEV1_cp10s(0x8008, VsfrFormat.U32),
    CR_LEV2_cp10s(0x8009, VsfrFormat.U32),

    USE_nSv_h(0x800C, VsfrFormat.ThreeXBool),

    CHN_TO_keV_A0(0x8010, VsfrFormat.F32),
    CHN_TO_keV_A1(0x8011, VsfrFormat.F32),
    CHN_TO_keV_A2(0x8012, VsfrFormat.F32),
    CR_UNITS(0x8013, VsfrFormat.ThreeXBool),
    DS_LEV1_uR(0x8014, VsfrFormat.U32),
    DS_LEV2_uR(0x8015, VsfrFormat.U32),

    CPS(0x8020, VsfrFormat.U32),
    DR_uR_h(0x8021, VsfrFormat.U32),
    DS_uR(0x8022, VsfrFormat.U32),

    TEMP_degC(0x8024, VsfrFormat.F32),
    ACC_X(0x8025, VsfrFormat.TwoXShort),
    ACC_Y(0x8026, VsfrFormat.TwoXShort),
    ACC_Z(0x8027, VsfrFormat.TwoXShort),
    OPT(0x8028, VsfrFormat.TwoXUShort),

    RAW_TEMP_degC(0x8033, VsfrFormat.F32),
    TEMP_UP_degC(0x8034, VsfrFormat.F32),
    TEMP_DN_degC(0x8035, VsfrFormat.F32),

    VBIAS_mV(0xC000, VsfrFormat.TwoXUShort),
    COMP_LEV(0xC001, VsfrFormat.TwoXShort),
    CALIB_MODE(0xC002, VsfrFormat.ThreeXBool),
    DPOT_RDAC(0xC004, VsfrFormat.ThreeXByte),
    DPOT_RDAC_EEPROM(0xC005, VsfrFormat.ThreeXByte),
    DPOT_TOLER(0xC006, VsfrFormat.ThreeXByte),

    SYS_MCU_ID0(0xFFFF0000.toInt(), VsfrFormat.U32),
    SYS_MCU_ID1(0xFFFF0001.toInt(), VsfrFormat.U32),
    SYS_MCU_ID2(0xFFFF0002.toInt(), VsfrFormat.U32),

    SYS_DEVICE_ID(0xFFFF0005.toInt(), VsfrFormat.U32),
    SYS_SIGNATURE(0xFFFF0006.toInt(), VsfrFormat.U32),
    SYS_RX_SIZE(0xFFFF0007.toInt(), VsfrFormat.TwoXUShort),
    SYS_TX_SIZE(0xFFFF0008.toInt(), VsfrFormat.TwoXUShort),
    SYS_BOOT_VERSION(0xFFFF0009.toInt(), VsfrFormat.U32),
    SYS_TARGET_VERSION(0xFFFF000A.toInt(), VsfrFormat.U32),
    SYS_STATUS(0xFFFF000B.toInt(), VsfrFormat.U32),
    SYS_MCU_VREF(0xFFFF000C.toInt(), VsfrFormat.I32),
    SYS_MCU_TEMP(0xFFFF000D.toInt(), VsfrFormat.I32),
    SYS_FW_VER_BT(0xFFFF010, null),
}
