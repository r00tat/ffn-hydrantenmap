# Radiacode Settings-Dialog (Design)

**Datum:** 2026-04-21
**Scope:** Einsatz-relevante Geräte-Einstellungen des Radiacode über BLE konfigurierbar machen.
**Referenz:** [docs/radiacode-bluetooth-protocol.md](../radiacode-bluetooth-protocol.md)

## Ziel

Auf der Dosimetrie-Seite gibt es einen Settings-Button, der einen Dialog öffnet,
in dem die für den Feuerwehr-Einsatz relevanten Geräte-Einstellungen gelesen und
geschrieben werden können.

## Scope (Variante A, Einsatz-fokussiert)

| Bereich | Register / Kommando | UI-Control |
| --- | --- | --- |
| Alarm-Dosisleistung | `DR_LEV1_uR_h` (0x8000), `DR_LEV2_uR_h` (0x8001) — u32 µR/h | 2× NumberInput (µSv/h) |
| Alarm-Dosis | `DS_LEV1_uR` (0x8014), `DS_LEV2_uR` (0x8015) — u32 µR | 2× NumberInput (µSv) |
| Sound | `SOUND_ON` (0x0522) bool, `SOUND_VOL` (0x0521) u8 | Switch + Slider (0–9) |
| Vibration | `VIBRO_ON` (0x0531) bool | Switch |
| LEDs | `LEDS_ON` (0x0545) bool | Switch |
| Einheiten | `DS_UNITS` (0x8004), `CR_UNITS` (0x8013), `USE_nSv_h` (0x800C) — bool | 3× Switch |
| Signalton | `PLAY_SIGNAL` (0x05E1) u8 | Action-Button |
| Dosis-Reset | `DOSE_RESET` (0x8007) bool | Action-Button (mit Confirm) |

Insgesamt 11 konfigurierbare Felder + 2 One-Shot-Aktionen.

**Ausserhalb Scope (YAGNI, kann später nachgezogen werden):**

- Display (Helligkeit, Kontrast, Rotation, Auto-Aus)
- Sprache (RU/EN)
- Einzelne LED-Helligkeiten
- Sound/Vibro-Trigger-Flags
- BLE-Sendeleistung
- Batch-Reads/Writes (`RD_VIRT_SFR_BATCH` / `WR_VIRT_SFR_BATCH`)

## Architektur

### Protokoll-Layer (`src/hooks/radiacode/protocol.ts`)

Erweitert um:

- Neue VSFR-Konstanten (siehe Tabelle oben + `SOUND_CTRL`, `VIBRO_CTRL` für später).
- Encode-Helper:
  - `encodeVsfrRead(id: number): Uint8Array` → `<u32 id>` (bereits als `u32le` lokal existiert, wird als Export etabliert).
  - `encodeVsfrWriteU32(id, value)`, `encodeVsfrWriteU8(id, value)`, `encodeVsfrWriteBool(id, value)` → jeweils `<u32 id><Wert>`.
- Decode-Helper (Antwort-Layout: `<u32 retcode=1><u32 vsfr_id_echo><Wert>`):
  - `decodeVsfrU32(data, expectedId)`, `decodeVsfrU8(data, expectedId)`, `decodeVsfrBool(data, expectedId)`.
  - Werfen bei `retcode !== 1` oder VSFR-Mismatch.

### Client-Layer (`src/hooks/radiacode/client.ts`)

Neue Methoden auf `RadiacodeClient`:

```ts
async readSfrU32(id: number): Promise<number>
async readSfrU8(id: number): Promise<number>
async readSfrBool(id: number): Promise<boolean>
async writeSfrU32(id: number, value: number): Promise<void>
async writeSfrU8(id: number, value: number): Promise<void>
async writeSfrBool(id: number, value: boolean): Promise<void>

async readSettings(): Promise<RadiacodeSettings>
async writeSettings(patch: Partial<RadiacodeSettings>): Promise<void>
async playSignal(): Promise<void>       // PLAY_SIGNAL = 1
async doseReset(): Promise<void>        // DOSE_RESET  = 1
```

`readSettings` macht sequentiell 11 Einzel-Reads (Client-FIFO-Queue serialisiert intern).
`writeSettings` schreibt nur die im Patch enthaltenen Felder.

### Hook / Provider

- `useRadiacodeDevice.ts`: reicht `readSettings`, `writeSettings`, `playSignal`, `doseReset` aus dem Client nach oben durch.
- `RadiacodeProvider.tsx`: nimmt diese Methoden in den Context-Wert auf.

### Settings-Typ (`src/hooks/radiacode/types.ts`)

```ts
export interface RadiacodeSettings {
  doseRateAlarm1uRh: number;    // µR/h (Gerät-Einheit)
  doseRateAlarm2uRh: number;
  doseAlarm1uR: number;         // µR
  doseAlarm2uR: number;
  soundOn: boolean;
  soundVolume: number;           // 0..9
  vibroOn: boolean;
  ledsOn: boolean;
  doseUnitsSv: boolean;         // false=R, true=Sv
  countRateCpm: boolean;        // false=cps, true=cpm
  doseRateNSvh: boolean;        // false=µSv/h, true=nSv/h
}
```

### UI-Komponente (`src/components/pages/RadiacodeSettingsDialog.tsx`)

MUI `<Dialog>` mit Sections:

1. **Alarm-Schwellen** — 4 NumberInputs. Intern µR/h bzw. µR, Anzeige in µSv/h bzw. µSv (Konversion ÷100 bei Read, ×100 bei Write).
2. **Signalisierung** — Sound-Switch + Volume-Slider (disabled wenn Sound off), Vibro-Switch, LED-Switch.
3. **Einheiten** — 3 Switches.
4. **Aktionen** — „Signalton abspielen" (sofort) + „Dosis zurücksetzen" (mit MUI-Confirm).

State-Modell:

```ts
const [initial, setInitial] = useState<RadiacodeSettings | null>(null);
const [current, setCurrent] = useState<RadiacodeSettings | null>(null);
const hasChanges = initial && current && !settingsEqual(initial, current);
```

Beim Öffnen: `readSettings()` → `setInitial` + `setCurrent` (gleiche Kopie).
Speichern: `diff(initial, current)` → `writeSettings(diff)`, Dialog schliesst bei Erfolg.
Abbrechen: Dialog schliesst, State verworfen.

### Integration auf Dosimetrie-Seite (`src/components/pages/Dosimetrie.tsx`)

Neuer `IconButton` (Settings-Icon) neben „Trennen":

- `disabled={status !== 'connected'}`
- Klick öffnet Dialog (lokaler `useState<boolean>`)
- Tooltip „Geräte-Einstellungen" mit `<span>`-Wrapper wegen MUI-Disabled-Regel

## Einheiten-Konversion

1 Röntgen ≈ 0.01 Sievert, daher:

- `µSv/h = µR/h / 100`, `µR/h = Math.round(µSv/h · 100)`
- `µSv   = µR   / 100`, `µR   = Math.round(µSv   · 100)`

`DS_UNITS` / `USE_nSv_h` / `CR_UNITS` ändern ausschliesslich die Geräte-Display-Einheit,
nicht die Register-Werte — die Konversion in der UI bleibt dieselbe.

## Validierung

- Stufe 1 ≤ Stufe 2 (Warn-Hinweis, Speichern nicht geblockt).
- Alle NumberInputs erlauben nur positive Werte.

## Fehlerbehandlung

- **Read-Fehler beim Öffnen:** Alert im Dialog, Felder disabled, nur Aktions-Buttons aktiv.
- **Write-Fehler beim Speichern:** Alert, Dialog bleibt offen, State erhalten.
- **Dosis-Reset:** zusätzlicher MUI-Confirm-Dialog („Gesamtdosis wirklich zurücksetzen?").

## Tests

Test-Files neben den Quellen (`*.test.ts` / `*.test.tsx`):

1. **`protocol.test.ts`** (Erweiterung): Encode/Decode-Helper für VSFR-Read/Write (alle Typen + Fehlerfälle).
2. **`client.test.ts`** (Erweiterung): `readSfr*/writeSfr*`, `readSettings` (ruft 11× read), `writeSettings` (nur Diff-Felder), `playSignal`, `doseReset`.
3. **`RadiacodeSettingsDialog.test.tsx`** (neu): Lebenszyklus, Speichern-Diff, Confirm beim Dosis-Reset, Aktionen.
4. **`Dosimetrie.test.tsx`** (Erweiterung): Settings-Button disabled/enabled je nach Status, Klick öffnet Dialog.

## Offene Fragen / Risiken

- **Gerät-Antwort-Format für `RD_VIRT_SFR`:** Annahme ist `<u32 retcode><u32 id_echo><N B value>`. Falls das Gerät hier abweicht, muss der Decoder angepasst werden. Wird im Test mit realistischen Bytes abgesichert.
- **Wertebereiche unbekannt:** keine harten Maxima für Alarm-Schwellen dokumentiert. UI begrenzt auf positive Integer, Gerät akzeptiert/ablehnt selbst.
