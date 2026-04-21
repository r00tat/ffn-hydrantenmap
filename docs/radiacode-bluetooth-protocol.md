# Radiacode Bluetooth-Protokoll

Technische Referenz für das BLE-Protokoll der Radiacode-Geräte (RC-101/102/103).
Dokumentiert das vollständige Kommando-/Registerset aus [cdump/radiacode](https://github.com/cdump/radiacode)
und kennzeichnet, welche Teile in dieser App bereits implementiert sind und welche nicht.

**Letzte Aktualisierung:** 2026-04-21

**Quellen:**

- [cdump/radiacode](https://github.com/cdump/radiacode) — Python-Referenzimplementierung
- [2026-04-21-radiacode-protocol-findings.md](./plans/2026-04-21-radiacode-protocol-findings.md) — BLE-Trace-Analyse der offiziellen RC-103-App
- [src/hooks/radiacode/](../src/hooks/radiacode/) — TS-Implementierung in diesem Projekt

**Legende:**

- ✅ = in dieser App bereits implementiert und aktiv genutzt
- 🟡 = im Code als Konstante vorhanden, aber nicht aktiv aufgerufen
- ❌ = noch nicht implementiert

## GATT-Profil

Service `e63215e5-7003-49d8-96b0-b024798fb901`:

| Characteristic (letztes UUID-Byte) |   Handle | Rolle                                        |
| ---------------------------------- | -------: | -------------------------------------------- |
| `…e6` (Write)                      | `0x000e` | Write-Without-Response (Client → Gerät)      |
| `…e7` (Notify)                     | `0x0010` | Indikationen (Gerät → Client), CCCD `0x0011` |

Notifications werden durch Write `\x01\x00` auf CCCD `0x0011` scharfgeschaltet.

**ATT-MTU:** 20 Bytes (Default, kein MTU-Exchange). Writes müssen in 18-Byte-Chunks
aufgeteilt werden, Notifications in 20-Byte-Chunks reassembliert werden.

Implementiert in [bleAdapter.capacitor.ts](../src/hooks/radiacode/bleAdapter.capacitor.ts)
und [bleAdapter.web.ts](../src/hooks/radiacode/bleAdapter.web.ts).

## Frame-Format

### Request (Client → Gerät)

```
+---------------------+-----------+------+----------+-----------+
| len [4 B LE]        | cmd [2 LE]| 0x00 | 0x80+seq | args...   |
+---------------------+-----------+------+----------+-----------+
```

- `len` zählt nur die Bytes **nach** sich selbst (Header + Args), nicht inklusive.
- `seq` läuft 0…31 und wird mit `0x80` ge-ORed: `0x80, 0x81, …, 0x9f, 0x80, …`
- Antwort echot den gesamten 4-Byte-Header zurück (cmd + seq).

### Response (Gerät → Client)

```
+---------------------+-----------+------+------------+-----------+
| plen [4 B LE]       | cmd [2 LE]| 0x00 | seq (echo) | data...   |
+---------------------+-----------+------+------------+-----------+
```

- `plen` steht im ersten Notification-Chunk — danach reassemblieren bis `plen` Bytes gesammelt.
- `cmd` und `seq` müssen mit dem Request übereinstimmen.

Implementiert in [protocol.ts](../src/hooks/radiacode/protocol.ts): `buildRequest()`,
`splitForWrite()`, `ResponseReassembler`, `parseResponse()`.

## Commands

Definiert in [protocol.ts](../src/hooks/radiacode/protocol.ts) als `COMMAND`-Objekt.

| Hex    | Name                | Bedeutung                                             | Status  |
| ------ | ------------------- | ----------------------------------------------------- | :-----: |
| 0x0005 | `GET_STATUS`        | Status-Flags lesen                                    |   🟡    |
| 0x0007 | `SET_EXCHANGE`      | Initial-Handshake mit Magic `01 ff 12 ff`             | ✅ Init |
| 0x000A | `GET_VERSION`       | Boot- und Target-FW-Version                           |   ❌    |
| 0x000B | `GET_SERIAL`        | HW-Seriennummer (12 Byte)                             |   ❌    |
| 0x0012 | `FW_IMAGE_GET_INFO` | Firmware-Image-Offset/Size/Signature                  |   ❌    |
| 0x0101 | `FW_SIGNATURE`      | FW-CRC, Dateiname, Modellname                         |   🟡    |
| 0x0807 | `RD_HW_CONFIG`      | Hardware-Konfig (15 B)                                |   ❌    |
| 0x081C | `RD_FLASH`          | Flash-Block lesen                                     |   ❌    |
| 0x0824 | `RD_VIRT_SFR`       | Einzelnes VSFR lesen (`<I vsfr_id>`)                  |   ✅    |
| 0x0825 | `WR_VIRT_SFR`       | Einzelnes VSFR schreiben (`<I vsfr_id><data>`)        |   ✅    |
| 0x0826 | `RD_VIRT_STRING`    | Virtual-String lesen (`<I vs_id>`)                    |   ✅    |
| 0x0827 | `WR_VIRT_STRING`    | Virtual-String schreiben                              |   ❌    |
| 0x082A | `RD_VIRT_SFR_BATCH` | Mehrere VSFRs in einem Call lesen                     |   ❌    |
| 0x082B | `WR_VIRT_SFR_BATCH` | Mehrere VSFRs in einem Call schreiben                 |   ❌    |
| 0x0A04 | `SET_TIME`          | Datum/Zeit setzen (`<BBBBBBBB>` d,m,y-2000,0,s,m,h,0) | ✅ Init |

**In [client.ts](../src/hooks/radiacode/client.ts) aktiv verwendet:**

- `SET_EXCHANGE` (im `connect()`)
- `SET_TIME` (im `connect()` und nach Reconnect)
- `RD_VIRT_STRING` (DATA_BUF-Polling, Spektrum lesen)
- `WR_VIRT_SFR` (DEVICE_TIME = 0, SPEC_RESET)

## VSFRs (Virtual Special Function Registers)

Einzelne Register, lesbar via `RD_VIRT_SFR`, schreibbar via `WR_VIRT_SFR`.
In [protocol.ts](../src/hooks/radiacode/protocol.ts) als `VSFR` definiert (nur
die genutzten); vollständige Liste aus der Python-Referenz:

### Geräte-Kontrolle

| VSFR          | Hex    | Typ  | Bedeutung                                  | Status  |
| ------------- | ------ | ---- | ------------------------------------------ | :-----: |
| `DEVICE_CTRL` | 0x0500 | u8   | Geräte-Control-Flags                       |   ❌    |
| `DEVICE_LANG` | 0x0502 | bool | Sprache: 0 = RU, 1 = EN                    |   ❌    |
| `DEVICE_ON`   | 0x0503 | bool | Gerät ein/aus                              |   ❌    |
| `DEVICE_TIME` | 0x0504 | u32  | Zeit-Offset (wird beim Init auf 0 gesetzt) | ✅ Init |

### Display

| VSFR             | Hex    | Typ  | Bedeutung                         | Status |
| ---------------- | ------ | ---- | --------------------------------- | :----: |
| `DISP_CTRL`      | 0x0510 | u8   | Display-Control-Flags             |   ❌   |
| `DISP_BRT`       | 0x0511 | u8   | Helligkeit 0–9                    |   ❌   |
| `DISP_CONTR`     | 0x0512 | u8   | Kontrast                          |   ❌   |
| `DISP_OFF_TIME`  | 0x0513 | u32  | Auto-Aus: 5/10/15/30 Sekunden     |   ❌   |
| `DISP_ON`        | 0x0514 | bool | Display ein/aus                   |   ❌   |
| `DISP_DIR`       | 0x0515 | u8   | Rotation: 0=AUTO, 1=RIGHT, 2=LEFT |   ❌   |
| `DISP_BACKLT_ON` | 0x0516 | bool | Backlight ein/aus                 |   ❌   |

### Audio & Vibration

| VSFR           | Hex    | Typ  | Bedeutung                                | Status |
| -------------- | ------ | ---- | ---------------------------------------- | :----: |
| `SOUND_CTRL`   | 0x0520 | u16  | Sound-Trigger-Flags (siehe `CTRL` unten) |   ❌   |
| `SOUND_VOL`    | 0x0521 | u8   | Lautstärke                               |   ❌   |
| `SOUND_ON`     | 0x0522 | bool | Sound ein/aus                            |   ❌   |
| `SOUND_BUTTON` | 0x0523 | u8   | Tastenklick-Ton                          |   ❌   |
| `VIBRO_CTRL`   | 0x0530 | u8   | Vibro-Trigger-Flags (`CTRL` ohne CLICKS) |   ❌   |
| `VIBRO_ON`     | 0x0531 | bool | Vibration ein/aus                        |   ❌   |

### LEDs

| VSFR        | Hex    | Typ  | Bedeutung         | Status |
| ----------- | ------ | ---- | ----------------- | :----: |
| `LEDS_CTRL` | 0x0540 | u8   | LED-Control-Flags |   ❌   |
| `LED0_BRT`  | 0x0541 | u8   | LED 0 Helligkeit  |   ❌   |
| `LED1_BRT`  | 0x0542 | u8   | LED 1 Helligkeit  |   ❌   |
| `LED2_BRT`  | 0x0543 | u8   | LED 2 Helligkeit  |   ❌   |
| `LED3_BRT`  | 0x0544 | u8   | LED 3 Helligkeit  |   ❌   |
| `LEDS_ON`   | 0x0545 | bool | LEDs ein/aus      |   ❌   |

### Alarm & Signal

| VSFR          | Hex    | Typ | Bedeutung                                      | Status |
| ------------- | ------ | --- | ---------------------------------------------- | :----: |
| `ALARM_MODE`  | 0x05E0 | u8  | Alarm-Modus                                    |   ❌   |
| `PLAY_SIGNAL` | 0x05E1 | u8  | Signalton abspielen (zum Gerät orten nützlich) |   ❌   |

### Mess-Modus

| VSFR          | Hex    | Typ  | Bedeutung         | Status |
| ------------- | ------ | ---- | ----------------- | :----: |
| `MS_CTRL`     | 0x0600 | —    | Mess-Mode-Control |   ❌   |
| `MS_MODE`     | 0x0601 | —    | Modus             |   ❌   |
| `MS_SUB_MODE` | 0x0602 | —    | Submode           |   ❌   |
| `MS_RUN`      | 0x0603 | bool | Messung aktiv     |   ❌   |

### BLE

| VSFR         | Hex    | Typ | Bedeutung         | Status |
| ------------ | ------ | --- | ----------------- | :----: |
| `BLE_TX_PWR` | 0x0700 | u8  | BLE-Sendeleistung |   ❌   |

### Alarm-Schwellen & Einheiten

| VSFR            | Hex    | Typ  | Bedeutung                                             | Status  |
| --------------- | ------ | ---- | ----------------------------------------------------- | :-----: |
| `DR_LEV1_uR_h`  | 0x8000 | u32  | Dosisleistungs-Alarm Stufe 1 (µR/h)                   |   ❌    |
| `DR_LEV2_uR_h`  | 0x8001 | u32  | Dosisleistungs-Alarm Stufe 2 (µR/h)                   |   ❌    |
| `DS_LEV1_100uR` | 0x8002 | u32  | Dosis-Alarm Stufe 1 (100 µR, veraltet → `DS_LEV1_uR`) |   ❌    |
| `DS_LEV2_100uR` | 0x8003 | u32  | Dosis-Alarm Stufe 2 (100 µR, veraltet → `DS_LEV2_uR`) |   ❌    |
| `DS_UNITS`      | 0x8004 | bool | Einheit Dosis: 0 = R, 1 = Sv (×100 Konversion)        |   ❌    |
| `CPS_FILTER`    | 0x8005 | u8   | CPS-Filter                                            |   ❌    |
| `RAW_FILTER`    | 0x8006 | u32  | Roh-Filter aus (Init schreibt 0)                      | ✅ Init |
| `DOSE_RESET`    | 0x8007 | bool | Gesamtdosis auf 0 setzen                              |   ❌    |
| `CR_LEV1_cp10s` | 0x8008 | u32  | Zählraten-Alarm Stufe 1 (counts / 10 s)               |   ❌    |
| `CR_LEV2_cp10s` | 0x8009 | u32  | Zählraten-Alarm Stufe 2                               |   ❌    |
| `USE_nSv_h`     | 0x800C | bool | Anzeige in nSv/h statt µSv/h                          |   ❌    |
| `CHN_TO_keV_A0` | 0x8010 | f32  | Energie-Kalibrierung a0                               |   ❌    |
| `CHN_TO_keV_A1` | 0x8011 | f32  | Energie-Kalibrierung a1                               |   ❌    |
| `CHN_TO_keV_A2` | 0x8012 | f32  | Energie-Kalibrierung a2                               |   ❌    |
| `CR_UNITS`      | 0x8013 | bool | Einheit Zählrate: 0 = cps, 1 = cpm                    |   ❌    |
| `DS_LEV1_uR`    | 0x8014 | u32  | Dosis-Alarm Stufe 1 (µR)                              |   ❌    |
| `DS_LEV2_uR`    | 0x8015 | u32  | Dosis-Alarm Stufe 2 (µR)                              |   ❌    |

### Live-Messwerte (direkt lesbar, Alternative zum DATA_BUF)

| VSFR      | Hex    | Typ | Bedeutung                     | Status |
| --------- | ------ | --- | ----------------------------- | :----: |
| `CPS`     | 0x8020 | u32 | Aktuelle Zählrate             |   ❌   |
| `DR_uR_h` | 0x8021 | u32 | Aktuelle Dosisleistung (µR/h) |   ❌   |
| `DS_uR`   | 0x8022 | u32 | Akkumulierte Gesamtdosis (µR) |   ❌   |

### Sensoren

| VSFR            | Hex    | Typ | Bedeutung                         |           Status           |
| --------------- | ------ | --- | --------------------------------- | :------------------------: |
| `TEMP_degC`     | 0x8024 | f32 | Gerätetemperatur                  | ❌ (wir nutzen `RareData`) |
| `ACC_X`         | 0x8025 | s16 | Beschleunigung X                  |             ❌             |
| `ACC_Y`         | 0x8026 | s16 | Beschleunigung Y                  |             ❌             |
| `ACC_Z`         | 0x8027 | s16 | Beschleunigung Z                  |             ❌             |
| `OPT`           | 0x8028 | u16 | Optischer Sensor (Umgebungslicht) |             ❌             |
| `RAW_TEMP_degC` | 0x8033 | f32 | Roh-Temperatur                    |             ❌             |
| `TEMP_UP_degC`  | 0x8034 | f32 | Temperatur oben                   |             ❌             |
| `TEMP_DN_degC`  | 0x8035 | f32 | Temperatur unten                  |             ❌             |

### Analog / Kalibrierung

| VSFR               | Hex    | Typ  | Bedeutung                   | Status |
| ------------------ | ------ | ---- | --------------------------- | :----: |
| `VBIAS_mV`         | 0xC000 | u16  | Detektor-Bias-Spannung (mV) |   ❌   |
| `COMP_LEV`         | 0xC001 | s16  | Komparator-Level            |   ❌   |
| `CALIB_MODE`       | 0xC002 | bool | Kalibriermodus              |   ❌   |
| `DPOT_RDAC`        | 0xC004 | u8   | Digital-Poti RDAC           |   ❌   |
| `DPOT_RDAC_EEPROM` | 0xC005 | u8   | RDAC im EEPROM              |   ❌   |
| `DPOT_TOLER`       | 0xC006 | u8   | Poti-Toleranz               |   ❌   |

### System-Info

| VSFR                 | Hex        | Typ | Bedeutung          | Status |
| -------------------- | ---------- | --- | ------------------ | :----: |
| `SYS_MCU_ID0..2`     | 0xFFFF0000 | u32 | MCU-ID             |   ❌   |
| `SYS_DEVICE_ID`      | 0xFFFF0005 | u32 | Gerät-ID           |   ❌   |
| `SYS_SIGNATURE`      | 0xFFFF0006 | u32 | Signatur           |   ❌   |
| `SYS_RX_SIZE`        | 0xFFFF0007 | u16 | RX-Buffergröße     |   ❌   |
| `SYS_TX_SIZE`        | 0xFFFF0008 | u16 | TX-Buffergröße     |   ❌   |
| `SYS_BOOT_VERSION`   | 0xFFFF0009 | u32 | Bootloader-Version |   ❌   |
| `SYS_TARGET_VERSION` | 0xFFFF000A | u32 | Target-FW-Version  |   ❌   |
| `SYS_STATUS`         | 0xFFFF000B | u32 | System-Status      |   ❌   |
| `SYS_MCU_VREF`       | 0xFFFF000C | s32 | Referenzspannung   |   ❌   |
| `SYS_MCU_TEMP`       | 0xFFFF000D | s32 | MCU-Temperatur     |   ❌   |
| `SYS_FW_VER_BT`      | 0xFFFF0010 | —   | BLE-FW-Version     |   ❌   |

## VS (Virtual Strings)

Blob-Reads/Writes via `RD_VIRT_STRING` / `WR_VIRT_STRING`.
Antwortlayout: `<I retcode=1> <I flen> <flen B payload>`.

| VS-ID           | Hex   | Bedeutung                                                   |          Status          |
| --------------- | ----- | ----------------------------------------------------------- | :----------------------: |
| `CONFIGURATION` | 0x002 | Konfig-Text (CP1251, enthält u.a. `SpecFormatVersion`)      | 🟡 (Konstante vorhanden) |
| `FW_DESCRIPTOR` | 0x003 | FW-Beschreibung                                             |            ❌            |
| `SERIAL_NUMBER` | 0x008 | ASCII-Seriennummer                                          |            🟡            |
| `TEXT_MESSAGE`  | 0x00F | ASCII-Text-Message vom Gerät                                |            🟡            |
| `MEM_SNAPSHOT`  | 0x0E0 | Memory-Snapshot                                             |            ❌            |
| `DATA_BUF`      | 0x100 | Live-Datenpuffer (RealTime/Raw/Rare/Event-Records)          |        ✅ Polling        |
| `SFR_FILE`      | 0x101 | Selbst-Dokumentation aller SFRs (ASCII)                     |            🟡            |
| `SPECTRUM`      | 0x200 | Aktuelles Spektrum (Session seit Reset)                     |            ✅            |
| `ENERGY_CALIB`  | 0x202 | Energie-Kalibrierung `<f a0><f a1><f a2>`                   |            🟡            |
| `SPEC_ACCUM`    | 0x205 | Akkumuliertes Spektrum (Lifetime)                           |            🟡            |
| `SPEC_DIFF`     | 0x206 | Differenz-Spektrum (in Python noch unvollständig dekodiert) |            ❌            |
| `SPEC_RESET`    | 0x207 | Spektrum-Reset-Blob                                         |            ❌            |

**Spektrum-Reset** wird stattdessen via `WR_VIRT_SFR` auf `VSFR.SPEC_RESET` (0x0803)
ausgelöst — in [client.ts:181-187](../src/hooks/radiacode/client.ts#L181-L187)
als `specReset()` implementiert.

## CTRL-Flags für `SOUND_CTRL` / `VIBRO_CTRL`

Bitmaske, die festlegt, welche Ereignisse Ton bzw. Vibration auslösen:

| Flag                     | Bit  | Bedeutung                     |
| ------------------------ | ---- | ----------------------------- |
| `BUTTONS`                | 0x01 | Tastendrucke                  |
| `CLICKS`                 | 0x02 | Zählklicks (nur SOUND)        |
| `DOSE_RATE_ALARM_1`      | 0x04 | Dosisleistungs-Alarm Stufe 1  |
| `DOSE_RATE_ALARM_2`      | 0x08 | Dosisleistungs-Alarm Stufe 2  |
| `DOSE_RATE_OUT_OF_SCALE` | 0x10 | Dosisleistung außerhalb Skala |
| `DOSE_ALARM_1`           | 0x20 | Dosis-Alarm Stufe 1           |
| `DOSE_ALARM_2`           | 0x40 | Dosis-Alarm Stufe 2           |
| `DOSE_OUT_OF_SCALE`      | 0x80 | Dosis außerhalb Skala         |

Status: ❌ nicht implementiert.

## DATA_BUF-Records

Ausgelesen via `RD_VIRT_STRING(VS.DATA_BUF)`. Antwort:
`<I retcode=1> <I flen> <flen B records>`.

Jeder Record beginnt mit einem 7-Byte-Header: `<B seq> <B eid> <B gid> <i ts_offset>`
(Offset in Einheiten von 10 ms, relativ zu `base_time = device_local_time + 128 s`).

Dekodierung in [protocol.ts:222-324](../src/hooks/radiacode/protocol.ts#L222-L324)
als `decodeDataBufRecords()`.

| (eid, gid) | Name             | Nutzlast                                                       |                   Status                    |
| ---------- | ---------------- | -------------------------------------------------------------- | :-----------------------------------------: |
| (0, 0)     | **RealTimeData** | `<f cr><f dr><H cr_err><H dr_err><H flags><B rt_flags>` (15 B) |            ✅ decoded + genutzt             |
| (0, 1)     | **RawData**      | `<f cr><f dr>` (8 B)                                           |         🟡 decoded, nicht angezeigt         |
| (0, 2)     | DoseRateDB       | `<I count><f cr><f dr><H dr_err><H flags>` (16 B)              |         🟡 decoded, nicht angezeigt         |
| (0, 3)     | **RareData**     | `<I duration><f dose><H temp><H charge><H flags>` (14 B)       |  ✅ decoded + genutzt (dose, temp, charge)  |
| (0, 7)     | Event            | `<B event><B param1><H flags>` (4 B)                           | 🟡 als Rohbyte decoded, nicht interpretiert |
| (1, 1/2/3) | Histogramm       | `<H samples><I smpl_ms>` + samples × (8/16/14 B)               |        🟡 als `unknown` übersprungen        |

**Im `RadiacodeMeasurement`-Interface
([types.ts:15-22](../src/hooks/radiacode/types.ts#L15-L22)) verfügbar:**

- ✅ `dosisleistung` (µSv/h, aus RealTime)
- ✅ `cps` (aus RealTime)
- ✅ `dose` (µSv, aus RareData)
- ✅ `temperatureC` (aus RareData)
- ✅ `chargePct` (aus RareData)
- ❌ `countRateErrPct`, `doseRateErrPct` (werden decoded, aber nicht weitergereicht)
- ❌ `flags`, `realTimeFlags` (decoded, nicht genutzt)

## Event-Typen (bei `(eid=0, gid=7)`-Records)

23 Event-IDs aus der Python-Referenz — alle würden im DATA_BUF-Stream
ankommen, wenn am Gerät ausgelöst:

| ID  | Event                  | Bedeutung                     |
| --- | ---------------------- | ----------------------------- |
| 0   | `POWER_OFF`            | Gerät aus                     |
| 1   | `POWER_ON`             | Gerät an                      |
| 2   | `LOW_BATTERY_SHUTOWN`  | Shutdown wegen Akku leer      |
| 3   | `CHANGE_DEVICE_PARAMS` | Parameter-Änderung            |
| 4   | `DOSE_RESET`           | Dosis zurückgesetzt           |
| 5   | `USER_EVENT`           | User-Event                    |
| 6   | `BATTERY_EMPTY_ALARM`  | Akku-Leer-Warnung             |
| 7   | `CHARGE_START`         | Ladevorgang gestartet         |
| 8   | `CHARGE_STOP`          | Ladevorgang beendet           |
| 9   | `DOSE_RATE_ALARM1`     | Dosisleistungs-Alarm Stufe 1  |
| 10  | `DOSE_RATE_ALARM2`     | Dosisleistungs-Alarm Stufe 2  |
| 11  | `DOSE_RATE_OFFSCALE`   | Dosisleistung außerhalb Skala |
| 12  | `DOSE_ALARM1`          | Dosis-Alarm Stufe 1           |
| 13  | `DOSE_ALARM2`          | Dosis-Alarm Stufe 2           |
| 14  | `DOSE_OFFSCALE`        | Dosis außerhalb Skala         |
| 15  | `TEMPERATURE_TOO_LOW`  | Temperatur zu niedrig         |
| 16  | `TEMPERATURE_TOO_HIGH` | Temperatur zu hoch            |
| 17  | `TEXT_MESSAGE`         | Text-Message empfangen        |
| 18  | `MEMORY_SNAPSHOT`      | Memory-Snapshot erstellt      |
| 19  | `SPECTRUM_RESET`       | Spektrum zurückgesetzt        |
| 20  | `COUNT_RATE_ALARM1`    | Zählraten-Alarm Stufe 1       |
| 21  | `COUNT_RATE_ALARM2`    | Zählraten-Alarm Stufe 2       |
| 22  | `COUNT_RATE_OFFSCALE`  | Zählrate außerhalb Skala      |

Status: ❌ keine Interpretation, Events werden aktuell als `unknown` im Parser durchgereicht.

## Init-Sequenz dieser App

In [client.ts:84-105](../src/hooks/radiacode/client.ts#L84-L105) (`connect()`):

```
SET_EXCHANGE  01ff12ff                      # Handshake-Magic
SET_TIME      <aktuelle lokale Zeit>        # Uhrzeit setzen
WR_VIRT_SFR   DEVICE_TIME = 0               # Zeit-Base zurücksetzen
                                            # Notifications bereits vorher aktiv
```

**Auslassungen gegenüber der offiziellen Radiacode-App**
(siehe [2026-04-21-radiacode-protocol-findings.md](./plans/2026-04-21-radiacode-protocol-findings.md)):

- `GET_STATUS`, `GET_VERSION`, `FW_IMAGE_GET_INFO`, `RD_FLASH`, `FW_SIGNATURE`, `GET_SERIAL`, `RD_HW_CONFIG`
- `RD_VIRT_SFR_BATCH` mit 17 Settings (Alarm- und UI-Konfig)
- `RD_VIRT_STRING ENERGY_CALIB` (wir lesen die Kalibrierung pro Spektrum mit)
- `WR_VIRT_SFR RAW_FILTER = 0`
- `RD_VIRT_SFR SYS_FW_VER_BT`

Das ist bewusst — wir brauchen die Geräte-Info für den MVP nicht, und
die Alarm-Konfig wird bislang nicht im UI gesetzt. Bei Bedarf kann
die Init um diese Calls erweitert werden.

## Live-Loop-Cadence

Firmware-getrieben: **~540 ms** zwischen DATA_BUF-Responses (±30 ms).
Die Cadence ist **nicht** client-konfigurierbar — unser Sample-Rate-Setting
im [TrackStartDialog](../src/components/Map/TrackStartDialog.tsx) steuert
nur das UI-Downsampling (wie oft ein Punkt auf die Karte gesetzt wird),
nicht die BLE-Abfrage selbst.

Unser Polling-Intervall im Default ist 500 ms
([useRadiacodeDevice.ts:35](../src/hooks/radiacode/useRadiacodeDevice.ts#L35)) —
damit laufen wir geringfügig schneller als das Gerät liefert und holen
jeden neuen Record zeitnah ab.

Spektrum-Polling läuft separat (Default 2 s) in
[client.ts:194-214](../src/hooks/radiacode/client.ts#L194-L214).

## Reconnect-Verhalten

[client.ts:118-154](../src/hooks/radiacode/client.ts#L118-L154) (`handleUnexpectedDisconnect`):

- Greift nur während aktivem Spektrum-Polling
- 3 Versuche, jeweils 2 s Backoff
- Pro Versuch: `adapter.connect()` → Notification-Subscription neu, dann
  `SET_EXCHANGE` + `SET_TIME` erneut
- Bei Erfolg: Session-Event `reconnected`, sonst `connection-lost` und
  Spektrum-Polling wird beendet

## Zusammenfassung: Abdeckung

| Bereich                 | Implementiert                                        | Fehlt                                                                                 |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Framing & Transport** | vollständig (Write-Chunking, Reassembly, FIFO-Queue) | —                                                                                     |
| **Init-Handshake**      | Minimal-Init (SET_EXCHANGE, SET_TIME, DEVICE_TIME)   | Version/Serial/HW-Config/FW-Signature                                                 |
| **Live-Messung**        | DATA_BUF-Polling, RealTime + RareData                | Direkte VSFRs `CPS`/`DR_uR_h`/`DS_uR`, Fehlerbalken, Flags, Event-Interpretation      |
| **Spektrum**            | Aktuelles Spektrum + Reset                           | `SPEC_ACCUM`, `SPEC_DIFF`, Energie-Kalibrierung schreiben                             |
| **Konfiguration**       | nur `RAW_FILTER = 0`, `DEVICE_TIME = 0`              | Alarm-Schwellen, Einheiten, Sprache, Display, Sound/Vibro/LEDs, Signalton, Mess-Modus |
| **Sensoren**            | Temp + Akku via RareData                             | Beschleunigung, Umgebungslicht, Bias, System-Temp                                     |
| **Geräte-Info**         | —                                                    | FW-/Boot-/BT-FW-Version, HW-Serial, HW-Config, Konfig-Text, Text-Messages             |
| **Remote-Kontrolle**    | —                                                    | `PLAY_SIGNAL` (Gerät piepen), `LEDS_*` (LEDs ansteuern), `DEVICE_ON`, Dosis-Reset     |
| **Batch-Reads/Writes**  | —                                                    | `RD_VIRT_SFR_BATCH`, `WR_VIRT_SFR_BATCH` (effizient für Alarm-Konfig)                 |

Die wichtigsten Erweiterungs-Kandidaten für den Einsatzkontext:

1. **Event-Interpretation** — Alarme vom Gerät automatisch ins Einsatztagebuch schreiben.
2. **Alarm-Schwellen-UI** — Batch-Read/Write der `DR_LEV*`/`DS_LEV*`/`CR_LEV*`-Register.
3. **Remote-Signal** — `PLAY_SIGNAL` + `LEDS_*` zur Aufmerksamkeitssteuerung beim Träger.
4. **Fehlerbalken** — `countRateErrPct`/`doseRateErrPct` ins `RadiacodeMeasurement` übernehmen.
