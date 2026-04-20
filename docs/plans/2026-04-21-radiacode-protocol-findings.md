# Radiacode-BLE-Protokoll: Trace-Analyse

**Datum:** 2026-04-21
**Quelle:** Android HCI-Snoop-Log ([captures/btsnoop_hci.log](../../captures/btsnoop_hci.log), 381 s Session mit offizieller Radiacode-App, Gerät **RC-103**, FW 4.14).
**Zweck:** Validierung des Protokolls gegen [cdump/radiacode](https://github.com/cdump/radiacode) für die eigene TypeScript-Implementierung in [src/hooks/radiacode/](../../src/hooks/radiacode/).

Gehört zu: [2026-04-20-radiacode-ble-design.md](./2026-04-20-radiacode-ble-design.md), [2026-04-20-radiacode-ble.md](./2026-04-20-radiacode-ble.md).

## Ergebnis in einem Satz

Das Protokoll aus `cdump/radiacode` passt 1:1 auf den realen BLE-Verkehr der offiziellen RC-103-App. **Keine Abweichung** in Handshake, Frame-Struktur oder DATA_BUF-Decoding. Einzige bisher nicht dokumentierte Kleinigkeit: VSFR-ID `0x8016` taucht im Alarm-Batch-Read auf, ist im Python-Enum aber nicht gelistet.

## GATT-Profil

Service `e63215e5-7003-49d8-96b0-b024798fb901`, Attribut-Handles (Android-Scan):

| UUID (letztes Byte) | Handle | Rolle |
| ------------------- | -----: | ----- |
| `…e6` (Write)       | `0x000e` | Write-Without-Response vom Client |
| `…e7` (Notify)      | `0x0010` | Indikation vom Gerät, CCCD `0x0011` |

Notifications werden durch Write `\x01\x00` auf CCCD `0x0011` scharfgeschaltet — exakt wie in `cdump/radiacode` ([transports/bluetooth.py:60](https://github.com/cdump/radiacode/blob/master/src/radiacode/transports/bluetooth.py)).

ATT-MTU in der Session: **20 Bytes** (Default). Weder Gerät noch App handeln einen MTU-Exchange aus — folglich splittet der Python-Client Writes in 18-Byte-Chunks und die App-Seite muss dasselbe tun.

## Frame-Format

### Request (Client → Gerät, Write-Without-Response auf `…e6`, 18-Byte-Chunks)

```
+--------+--------+--------+--------+--------+--------+--------+--------+-------------+
| len [4 bytes LE, = bytes that follow] | cmd [2 LE] | 0x00 | 0x80+seq | args...     |
+--------+--------+--------+--------+--------+--------+--------+--------+-------------+
```

- `len` zählt **nur** die Bytes nach sich selbst (Header + Args), nicht inklusive.
- `seq` zählt 0…31 und wird mit `0x80` ge-ORed (`0x80, 0x81, …, 0x9f, 0x80, …`). Antwort echot den gesamten 4-Byte-Header zurück.

### Response (Gerät → Client, Notifications auf `…e7`, 20-Byte-Chunks)

```
+--------+--------+--------+--------+--------+--------+--------+--------+-------------+
| plen [4 bytes LE]                     | cmd [2 LE] | 0x00 | seq (echo) | data...   |
+--------+--------+--------+--------+--------+--------+--------+--------+-------------+
```

- `plen` erste Notification-Chunk — danach reassemblieren bis `plen` Bytes gesammelt.
- `cmd`+`seq` müssen mit dem Request übereinstimmen (Python sichert das per `assert`).

Für die TS-Implementierung ([src/hooks/radiacode/protocol.ts](../../src/hooks/radiacode/protocol.ts), geplant): identischer Reassembler wie `handleNotification` in der Python-Referenz.

## Command-Codes (observed)

| Hex    | Name                  | Bedeutung                                             | Antwort-Payload (nach Header) |
| ------ | --------------------- | ----------------------------------------------------- | ----------------------------- |
| 0x0005 | GET_STATUS            | Status-Flags                                          | `<I flags>` |
| 0x0007 | SET_EXCHANGE          | Initialer Handshake mit Magic `01 ff 12 ff`           | 12 Bytes Gerätesignatur |
| 0x000A | GET_VERSION           | Boot/Target-FW                                        | `<HH>boot_minor/major` + length-prefixed string + dito target |
| 0x000B | GET_SERIAL            | HW-Seriennummer                                       | `<I len>` + `len/4`× `<I>` |
| 0x0012 | FW_IMAGE_GET_INFO     | Offset/Size/Signature                                 | 16 Bytes |
| 0x0101 | FW_SIGNATURE          | CRC + Dateiname + Modellname                          | `<I crc>` + zwei length-prefixed Strings |
| 0x0807 | RD_HW_CONFIG          | HW-Konfig                                             | 15 Bytes |
| 0x081C | RD_FLASH              | Flash-Block lesen                                     | argabhängig, 460 B in Trace |
| 0x0824 | RD_VIRT_SFR           | Einzelnes VSFR lesen (args: `<I vsfr_id>`)            | `<I retcode><I value>` |
| 0x0825 | WR_VIRT_SFR           | Einzelnes VSFR schreiben (args: `<I vsfr_id><data>`)  | `<I retcode>` |
| 0x0826 | RD_VIRT_STRING        | Virtual-String lesen (args: `<I vs_id>`)              | `<I retcode><I flen><flen B>` |
| 0x0827 | WR_VIRT_STRING        | Virtual-String schreiben                              | `<I retcode>` |
| 0x082A | RD_VIRT_SFR_BATCH     | Mehrere VSFRs auf einmal lesen                        | `<I validity_mask>` + `<n I>` |
| 0x0A04 | SET_TIME              | Datum/Zeit: `<BBBBBBBB>` day,month,year-2000,0,s,m,h,0 | — |

Nicht beobachtet (aber aus Python-Enum bekannt): `WR_VIRT_SFR_BATCH (0x082B)`.

## Konkrete Init-Sequenz der offiziellen App

Die App folgt **exakt** der cdump-Python-Implementierung ([radiacode/radiacode.py:93-108](https://github.com/cdump/radiacode/blob/master/src/radiacode/radiacode.py)). Aus dem Trace:

```
SET_EXCHANGE 01ff12ff                       # Magic
GET_STATUS                                   # (nicht in Python-Init, aber ungefährlich)
GET_VERSION                                  # boot 4.1, target 4.14
FW_IMAGE_GET_INFO
RD_FLASH 01000000                            # liest 460 B Flash
FW_SIGNATURE                                 # → "rc-103.bin" / "RadiaCode RC-103 "
GET_VERSION                                  # nochmal (idempotent)
GET_SERIAL                                   # 12-Byte Serial
RD_HW_CONFIG
RD_VIRT_SFR_BATCH (17 VSFRs)                 # Alarm + UI-Settings in einem Rutsch
WR_VIRT_SFR DEVICE_TIME 00000000             # Reset Device-Time zum lokalen Base
SET_TIME 2026-04-20 23:52:25                 # Lokale Zeit setzen
RD_VIRT_STRING ENERGY_CALIB                  # 3× float (a0, a1, a2)
WR_VIRT_SFR RAW_FILTER 00000000              # Raw-Filter deaktivieren
RD_VIRT_SFR SYS_FW_VER_BT                    # BLE-FW-Version
```

### VSFR-Batch (genau 17 Register)

Beobachtete Reihenfolge:

```
DS_UNITS, CR_UNITS, 0x8016, DEVICE_LANG, DEVICE_CTRL, ALARM_MODE,
SOUND_CTRL, VIBRO_CTRL, DISP_CTRL, DISP_BRT, DISP_OFF_TIME,
DR_LEV1_uR_h, DR_LEV2_uR_h, DS_LEV1_uR, DS_LEV2_uR,
CR_LEV1_cp10s, CR_LEV2_cp10s
```

**Anomalie:** `0x8016` ist im cdump-Python-Enum nicht benannt. Position zwischen `CR_UNITS` und `DEVICE_LANG` → vermutlich eine weitere Einheiten/Display-Konfig (etwa `DS_UNITS_ALT` oder `DISP_MODE`). Für den MVP egal; wir lesen es nicht selbst, sondern nur zur Kompatibilität im Batch mit. Wert im Trace: `0x00000000`.

## Live-Loop

**Cadence:** `RD_VIRT_STRING DATA_BUF` alle **~540 ms** (±30 ms). Zwischenzeitlich gelegentlich ein zusätzliches `RD_VIRT_STRING DATA_BUF` direkt danach, wenn der Client die Response bereits abgearbeitet hat.

**Erste Response** nach Verbindungsaufbau ist groß (hier 649 B): sie enthält den gesamten seit letzter Session aufgelaufenen Backlog. Danach liefert jede Abfrage typisch **0–3 Records**, was in 15–59 Bytes resultiert.

### DATA_BUF-Response-Layout

```
<I retcode=1> <I flen>   | records... (Länge flen)
```

**Record-Header** (7 Bytes, für jede Gruppe):

```
<B seq> <B eid> <B gid> <i ts_offset>      # ts_offset in Einheiten von 10 ms
```

`dt = base_time + ts_offset*10ms` wobei `base_time = device_local_time + 128 s` (siehe Python-Init).
`seq` muss strict monoton +1 sein — Skip/Gap ⇒ Fehler (der Python-Client bricht den Decode ab).

### Beobachtete Gruppen

Häufigkeit über die gesamte Session:

| (eid,gid) | Name              | Nutzlast-Größe | Vorkommen im Trace |
| --------- | ----------------- | --------------: | ------------------ |
| (0, 0)    | **RealTimeData**  | 15 B           | in fast jeder DATA_BUF-Antwort |
| (0, 1)    | **RawData**       | 8 B            | in fast jeder DATA_BUF-Antwort |
| (0, 2)    | DoseRateDB        | 16 B           | nur in initialem Backlog |
| (0, 3)    | RareData          | 14 B           | nur in initialem Backlog |
| (0, 7)    | Event             | 4 B            | nur im Backlog (z. B. `CHANGE_DEVICE_PARAMS`) |
| (1, 1)    | Unknown_1_1       | `<H samples><I smpl_ms>` + 8·samples | vereinzelt, vermutlich Count-Rate-Zeitreihe |

Für unseren MVP ist **nur** `(0,0) RealTimeData` relevant:

```
<f count_rate>     # cps
<f dose_rate>      # μSv/h bzw. μR/h je nach DS_UNITS
<H count_rate_err> # ×0.1 → Prozent
<H dose_rate_err>  # ×0.1 → Prozent
<H flags>
<B real_time_flags>
```

Beispiel aus Trace (Labor-Background):

```
cr=6.08 cps  dr=0.0000  cr_err=13.0 %  dr_err=39.8 %  flags=64  rt_flags=0
```

`flags=64 (= 0x40)` setzt laut cdump Bit 6 — erscheint durchgehend, Bedeutung unklar, nicht sicherheitsrelevant für unsere Visualisierung.

### Sample-Rate-Implikation für TrackStartDialog

Die Cadence ist **firmware-getrieben**, nicht Client-konfigurierbar. Unser Sample-Rate-Setting in [TrackStartDialog.tsx](../../src/components/Map/TrackStartDialog.tsx) steuert nur die **UI-Down-Sample-Rate** (wie oft wir einen Punkt auf die Karte setzen), nicht die BLE-Anfrage. Konkret: Das Gerät liefert realistisch 1 RealTime-Sample + 1 RawData alle ~540 ms, egal was wir einstellen.

## Implementierungs-Artefakte im Repo

Unter [captures/](../../captures/) (gitignored, enthält MACs):

- `btsnoop_hci.log` — Rohaufzeichnung
- `radiacode-frames.tsv` — ATT-Writes/Notifies (tshark-Export)
- `transcript.txt` — dekodierter Request/Response-Verlauf (siehe [parse_radiacode_trace.py](../../captures/parse_radiacode_trace.py))
- `databuf-decoded.txt` — DATA_BUF-Records je Antwort (siehe [decode_databuf.py](../../captures/decode_databuf.py))

Zum Reproduzieren: `python3 captures/parse_radiacode_trace.py` und `python3 captures/decode_databuf.py`.

## Nächste Schritte im TS-Port

1. Protokoll-Konstanten aus [types.ts](../../src/hooks/radiacode/types.ts) um `0x8016` als opaken Platzhalter ergänzen (nur für Batch-Read-Kompatibilität).
2. `protocol.ts` / `parseRadiacode.ts`: Header-Pack/Unpack, 18-Byte-Write-Chunking, Reassembler für Notifications exakt wie Python `handleNotification`.
3. Init-Sequenz 1:1 nachbauen (SET_EXCHANGE → GET_VERSION → SET_TIME → RD_VIRT_STRING ENERGY_CALIB). Kein FW-Signature-Check im MVP nötig.
4. Live-Loop: `RD_VIRT_STRING DATA_BUF` alle 500 ms mit Jitter-Toleranz; nur `(0,0)` und ggf. `(0,1)` decodieren, Rest überspringen.
5. Sequence-Nummer als Modul-Zustand (`seq = (seq+1) % 32`).
