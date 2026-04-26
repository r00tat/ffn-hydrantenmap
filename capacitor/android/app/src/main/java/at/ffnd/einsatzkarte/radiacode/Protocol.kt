package at.ffnd.einsatzkarte.radiacode

/**
 * Protokoll-Konstanten portiert aus src/hooks/radiacode/protocol.ts.
 * Nur das Minimum, das der native Polling-Pfad braucht — alles andere
 * (Settings, Spektrum, Device-Info) bleibt im TS-Client und läuft als
 * Passthrough über [GattSession.sendWrite].
 */
object Protocol {
    const val SERVICE_UUID = "e63215e5-7003-49d8-96b0-b024798fb901"
    const val WRITE_CHAR_UUID = "e63215e6-7003-49d8-96b0-b024798fb901"
    const val NOTIFY_CHAR_UUID = "e63215e7-7003-49d8-96b0-b024798fb901"

    object Command {
        const val SET_EXCHANGE = 0x0007
        const val RD_VIRT_SFR = 0x0824
        const val WR_VIRT_SFR = 0x0825
        const val RD_VIRT_STRING = 0x0826
        const val SET_TIME = 0x0a04
    }

    object Vs {
        const val CONFIGURATION = 0x002
        const val DATA_BUF = 0x100
    }

    object Vsfr {
        const val DEVICE_TIME = 0x0504
    }

    const val MAX_WRITE_CHUNK = 18
    const val SEQ_MODULO = 32
    const val REQUESTED_MTU = 250
}
