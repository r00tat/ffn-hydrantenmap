# Live-Spektrum in EnergySpectrum — Implementierungsplan

> **Für Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> **Lean-Modus:** Keine Zwischen-Commits, keine Zwischen-Checks. Erst am
> Ende wird verifiziert und committet.

**Goal:** Das Live-Spektrum des RadiaCode erscheint auf der
EnergySpectrum-Seite als zusätzliches Listen-Item mit
Sichtbarkeits-Toggle, Reset und Speichern. Auf der Dosimetrie-Seite
wird der Spektrum-Block entfernt.

**Architecture:** `EnergySpectrum.tsx` konsumiert `useRadiacode()`
direkt und injiziert ein synthetisches `LoadedSpectrum` mit `id:
'live'` vorn in `allSpectra`. Chart, Peak-Detection und Log-Scale
greifen automatisch. `Dosimetrie.tsx` verliert den Spektrum-Block + Save-Dialog.

**Tech-Stack:** React 19, TypeScript, MUI, `@mui/x-charts`, bestehender
`RadiacodeProvider`.

**Design-Doc:** `docs/plans/2026-04-21-live-spectrum-in-energyspectrum-design.md`

**Kontext für Agent:**

- Worktree: `.worktrees/live-spectrum`, Basis `feat/radiacode-via-bluetooth`,
  Branch `feat/radiacode-live-spectrum`.
- `.env.local` ist bereits kopiert.
- Tests liegen **neben** der Source (`EnergySpectrum.test.tsx` im gleichen Ordner).
- Relevante Referenz-Dateien (nur lesen, nicht bearbeiten, außer in Task 2):
  - `src/components/pages/Dosimetrie.tsx` — aktueller Speicherort von
    Save-Dialog, Reset-/Save-Buttons, Status-Chip-Logik.
  - `src/components/providers/RadiacodeProvider.tsx` — API-Oberfläche.
  - `src/components/pages/ZoomableSpectrumChart.tsx` — akzeptiert
    `energies + series` mit optionalem `logScale` und `overlays`.

---

## Task 1: Tests schreiben (TDD, alle failing)

**Files:**

- Create: `src/components/pages/EnergySpectrum.test.tsx`
- Modify (falls vorhanden): `src/components/pages/Dosimetrie.test.tsx`

**Step 1.1: Radiacode-Mock-Utility**

Schreibe einen kleinen Test-Helper direkt in den Testdateien (kein
separates File — YAGNI), der `useRadiacode` mit `vi.mock(
'../providers/RadiacodeProvider', …)` ersetzt. Der Mock gibt ein
konfigurierbares Objekt zurück; Tests überschreiben Felder pro Case.
Beispiel:

```ts
const mockCtx = {
  status: 'idle',
  device: null,
  deviceInfo: null,
  measurement: null,
  history: [],
  cpsHistory: [],
  spectrum: null,
  error: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  resetLiveSpectrum: vi.fn(),
  saveLiveSpectrum: vi.fn().mockResolvedValue('item-id'),
  // weitere Methoden als vi.fn() stubben, damit TS happy ist
};
vi.mock('../providers/RadiacodeProvider', () => ({
  useRadiacode: () => mockCtx,
}));
```

Zusätzlich `vi.mock('../../hooks/useFirebaseCollection', …)` mit leerer
Liste, `vi.mock('../../hooks/useFirecall', ...)` mit `'test'`,
`vi.mock('../../hooks/useFirecallItemAdd', …)` + `useFirecallItemUpdate`
als `vi.fn()`.

**Step 1.2: `EnergySpectrum.test.tsx` — neue Tests**

Cases:

1. **Ohne Live-Spektrum:** `spectrum: null` → Liste enthält kein
   Element mit Text „Live-Aufzeichnung".
2. **Mit Live-Spektrum:** `spectrum` mit `counts`, `coefficients`,
   `durationSec` → Liste zeigt „Live-Aufzeichnung" als erstes Item,
   Farbkreis hat `background-color: rgb(233, 30, 99)` (das ist
   `#e91e63`).
3. **Reset-Button:** Klick auf „Reset Live" → `mockCtx.resetLiveSpectrum`
   wurde aufgerufen.
4. **Save-Flow:** Klick auf „Speichern" öffnet Dialog, Eingabe Name
   `Testprobe`, Submit → `mockCtx.saveLiveSpectrum` wurde mit
   `{ name: 'Testprobe', description: undefined }` (oder leerem
   String) aufgerufen.
5. **Verbinden-Button:** Klick → `mockCtx.connect` aufgerufen.

**Step 1.3: `Dosimetrie.test.tsx`**

Falls Datei existiert: veraltete Assertions für `spectrum-chart` /
Save-Dialog entfernen. Neuer Case: bei gemocktem `spectrum !== null`
ist **kein** Element mit `data-testid="spectrum-chart"` im DOM.

Falls Datei nicht existiert: nicht neu anlegen (YAGNI — Dosimetrie-UI
wird in diesem Plan nur reduziert, nicht erweitert).

**Step 1.4: Tests laufen lassen — alle fehlschlagen**

Kein Run nötig — Tests werden gemeinsam mit der Implementierung in
Task 3 geprüft. (Lean-Modus: keine Zwischen-Checks.)

---

## Task 2: Dosimetrie entrümpeln

**File:** `src/components/pages/Dosimetrie.tsx`

Entferne:

- Komplette JSX-Block für Live-Spektrum (zwischen dem Dosisleistungs-
  Chart und dem CPS-Trend-Block): der `{spectrumCounts && spectrum && …}`-
  Block inkl. Stack mit Reset- und Speichern-Buttons sowie
  `<ZoomableSpectrumChart … />`.
- Save-Dialog am Seitenende (`<Dialog open={saveOpen} …>`).
- State-Hooks: `spectrumLogScale`, `setSpectrumLogScale`, `saveOpen`,
  `setSaveOpen`, `saveName`, `setSaveName`, `saveDescription`,
  `setSaveDescription`, `saving`, `setSaving`.
- Callbacks: `handleOpenSave`, `handleConfirmSave`, das Memo
  `spectrumCounts`.
- Imports, die nun ungenutzt sind: `RestartAltIcon`, `SaveIcon`,
  `ZoomableSpectrumChart`, `TextField`, `Dialog`, `DialogActions`,
  `DialogContent`, `DialogTitle`, `useCallback` (wenn sonst nicht
  mehr verwendet), `useSnackbar` (wenn sonst nicht mehr verwendet).
- Aus `useRadiacode()`-Destructuring: `spectrum`, `resetLiveSpectrum`,
  `saveLiveSpectrum`.

Dosisleistungs-Chart, CPS-Trend, Metric-Tiles, Geräte-Info,
`RadiacodeSettingsDialog` bleiben.

Prüfe nach dem Löschen, dass keine `eslint no-unused-vars`-Hinweise
entstehen; falls doch, weitere Imports entfernen.

---

## Task 3: Live-Spektrum in EnergySpectrum

**File:** `src/components/pages/EnergySpectrum.tsx`

**Step 3.1: Imports und Konstanten**

Ergänze Imports (Reihenfolge alphabetisch innerhalb der MUI-Gruppe
einsortieren):

```tsx
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { useRadiacode } from '../providers/RadiacodeProvider';
import { useSnackbar } from '../providers/SnackbarProvider';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';
import { formatDuration } from '../../common/doseFormat';
```

Neue Modulkonstanten unter `SERIES_COLORS`:

```ts
const LIVE_ID = 'live';
const LIVE_COLOR = '#e91e63';

const STATUS_CHIP_COLOR: Record<
  RadiacodeStatus,
  'default' | 'success' | 'warning' | 'error'
> = {
  idle: 'default',
  scanning: 'warning',
  connecting: 'warning',
  connected: 'success',
  reconnecting: 'warning',
  unavailable: 'error',
  error: 'error',
};

function statusLabel(
  status: RadiacodeStatus,
  device: { name?: string; serial?: string } | null,
): string {
  if (status === 'connected' && device) {
    return `Verbunden — ${device.name} (${device.serial})`;
  }
  if (status === 'connecting') return 'Verbindet …';
  if (status === 'reconnecting') return 'Verbinde neu …';
  if (status === 'scanning') return 'Scannen …';
  if (status === 'unavailable') return 'Gerät nicht erreichbar';
  if (status === 'error') return 'Fehler';
  return 'Getrennt';
}
```

**Step 3.2: Radiacode-Hook konsumieren und Live-Item bauen**

Innerhalb der `EnergySpectrum`-Komponente (vor `allSpectra`):

```tsx
const {
  status,
  device,
  spectrum,
  error: radiacodeError,
  connect,
  disconnect,
  resetLiveSpectrum,
  saveLiveSpectrum,
} = useRadiacode();
const showSnackbar = useSnackbar();
const [saveOpen, setSaveOpen] = useState(false);
const [saveName, setSaveName] = useState('');
const [saveDescription, setSaveDescription] = useState('');
const [saving, setSaving] = useState(false);

const liveSpectrum = useMemo<LoadedSpectrum | null>(() => {
  if (!spectrum || spectrum.counts.length === 0) return null;
  const coefficients = spectrum.coefficients;
  const energies = spectrum.counts.map((_, ch) =>
    channelToEnergy(ch, coefficients),
  );
  const data: SpectrumData = {
    sampleName: 'Live-Aufzeichnung',
    deviceName: device?.name,
    measurementTime: spectrum.durationSec ?? 0,
    liveTime: spectrum.durationSec ?? 0,
    startTime: undefined,
    endTime: undefined,
    coefficients,
    counts: spectrum.counts,
    energies,
  };
  const peaks = findPeaks(spectrum.counts, energies);
  const matches = identifyNuclides(peaks);
  return {
    id: LIVE_ID,
    firestoreId: undefined,
    data,
    matches,
    visible: !hiddenIds.has(LIVE_ID),
    description: 'Live-Daten vom Radiacode',
  };
}, [spectrum, device, hiddenIds]);
```

Bestehender `allSpectra`-Memo wird so erweitert, dass Live vorne ist:

```tsx
const allSpectra = useMemo<LoadedSpectrum[]>(() => {
  const firestoreItems = (savedSpectra ?? [])
    .filter((saved) => saved.counts?.length > 0)
    .map((saved) => {
      /* bestehende Abbildung unverändert */
    });
  return liveSpectrum ? [liveSpectrum, ...firestoreItems] : firestoreItems;
}, [savedSpectra, hiddenIds, liveSpectrum]);
```

**Step 3.3: Farbzuweisung für Live-Item**

Überall, wo heute
`SERIES_COLORS[idx % SERIES_COLORS.length]` oder
`SERIES_COLORS[originalIdx % SERIES_COLORS.length]` berechnet wird
(Farbkreis in der Liste + Serien-Farben im Chart), ersetzen durch ein
Helper:

```ts
function colorForSpectrum(s: LoadedSpectrum, idx: number): string {
  if (s.id === LIVE_ID) return LIVE_COLOR;
  // Firestore-Items behalten ihre bisherige Farbe: idx minus 1 wenn
  // Live vorhanden, damit Live nicht die Farbzählung verschiebt.
  return SERIES_COLORS[idx % SERIES_COLORS.length];
}
```

Wichtig für Farbstabilität: In `allSpectra.map((s, idx) ⇒ …)` den
`colorForSpectrum(s, liveSpectrum ? idx - 1 : idx)` aufrufen, sodass
die Firestore-Indizes bei 0 starten. Prüfe die drei Stellen:

- Listen-Farbkreis (`ListItem → Box backgroundColor`).
- `chartData.series`-Bau.
- `series[].color` in `ZoomableSpectrumChart`-Aufruf.

**Step 3.4: Live-Item darf nicht bearbeitet/gelöscht werden**

Im `ListItem` für Live:

- **Download-Icon:** unterdrücken (Tooltip/Button komplett raus).
- **Edit-Icon:** unterdrücken.
- **Delete-Icon:** unterdrücken.
- **Sichtbarkeits-Icon:** bleibt.
- Titel: `identification.displayName`-Chip / DB-Links funktionieren
  wie gewohnt, falls Match gefunden wird. Wenn gar kein Match: „Nicht
  identifiziert"-Chip erscheint — ok.

Realisierung: Am Anfang des `.map`-Callbacks prüfen
`const isLive = s.id === LIVE_ID;` und die drei Icon-Buttons bedingt
rendern: `{!isLive && (<Tooltip …><IconButton …>…</IconButton></Tooltip>)}`.

**Step 3.5: Button-Row oben hinzufügen**

Direkt nach dem `<Typography variant="body2">`-Hinweistext und dem
ersten `<Box>` mit den Link-Chips eine neue Row einfügen — *vor*
dem Upload-Block:

```tsx
<Stack
  direction="row"
  spacing={1}
  sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 2 }}
>
  <Chip label={statusLabel(status, device)} color={STATUS_CHIP_COLOR[status]} />
  <Button
    variant="contained"
    onClick={() => connect()}
    disabled={status === 'connecting' || status === 'scanning'}
  >
    Verbinden
  </Button>
  <Button
    variant="outlined"
    onClick={() => disconnect()}
    disabled={status !== 'connected'}
  >
    Trennen
  </Button>
  {liveSpectrum && (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<RestartAltIcon />}
        onClick={() => resetLiveSpectrum()}
      >
        Reset Live
      </Button>
      <Button
        variant="contained"
        size="small"
        startIcon={<SaveIcon />}
        onClick={handleOpenSave}
      >
        Speichern
      </Button>
    </>
  )}
</Stack>
{radiacodeError && <Alert severity="error" sx={{ mb: 2 }}>{radiacodeError}</Alert>}
```

**Step 3.6: Save-Dialog**

Ergänze `handleOpenSave` + `handleConfirmSave` (1:1 aus Dosimetrie
adaptiert):

```tsx
const handleOpenSave = useCallback(() => {
  const defaultName = `Live-Messung ${new Date().toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}`;
  setSaveName(defaultName);
  setSaveDescription('');
  setSaveOpen(true);
}, []);

const handleConfirmSave = useCallback(async () => {
  if (!saveName.trim()) return;
  setSaving(true);
  try {
    const id = await saveLiveSpectrum({
      name: saveName.trim(),
      description: saveDescription.trim() || undefined,
    });
    if (id) {
      showSnackbar('Spektrum gespeichert', 'success');
      setSaveOpen(false);
    } else {
      showSnackbar('Kein Live-Spektrum verfügbar', 'warning');
    }
  } catch (e) {
    showSnackbar(`Speichern fehlgeschlagen: ${(e as Error).message}`, 'error');
  } finally {
    setSaving(false);
  }
}, [saveName, saveDescription, saveLiveSpectrum, showSnackbar]);
```

Dialog unterhalb des bestehenden Edit-Dialogs einfügen (gleicher
Style wie in Dosimetrie, Title „Live-Spektrum speichern").

**Step 3.7: Aufruf des ZoomableSpectrumChart**

`chartData.series`-Bau so anpassen, dass das Live-Item seine feste
Farbe bekommt und dass `originalIdx` Live ignoriert. Siehe Step 3.3.

---

## Task 4: Verifikation (einmalig, am Ende)

**Step 4.1: Checks einzeln laufen lassen**

```bash
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

Alles muss grün sein. Bei Fehlern: Ursache fixen, erneut laufen lassen.

**Step 4.2: Manuelle Browser-Verifikation**

`npm run dev`, Seite „Energiespektrum" öffnen:

- Ohne Radiacode: kein Live-Item.
- Mit Radiacode verbunden + Spektrum: Live-Item erscheint als erstes
  in der Liste, magenta Farbkreis, Chart zeigt Live-Serie. Sichtbarkeits-
  Toggle funktioniert.
- „Reset Live" → Live-Counts gehen auf Null.
- „Speichern" → Dialog → Submit → neues Firestore-Item taucht zusätzlich
  in der Liste auf, Live-Item bleibt.
- Dosimetrie-Seite: kein Spektrum-Chart, keine Reset-/Speichern-Buttons,
  Dosisleistung + CPS-Trend unverändert.

**Step 4.3: Commit**

Alle Änderungen in einen gemeinsamen Commit bündeln (Lean-Modus):

```bash
git add src/components/pages/EnergySpectrum.tsx \
        src/components/pages/EnergySpectrum.test.tsx \
        src/components/pages/Dosimetrie.tsx
# falls Dosimetrie.test.tsx geändert wurde, ebenfalls stagen
git commit -m "$(cat <<'EOF'
feat(spectrum): live-spektrum auf energyspectrum-seite

Das Live-Spektrum des RadiaCode erscheint jetzt auf der
EnergySpectrum-Seite als zusätzliches Listen-Item mit fester Farbe
(Magenta), Sichtbarkeits-Toggle, Reset und Speichern. Die Verbinden/
Trennen-Controls liegen nun ebenfalls auf dieser Seite. Die
Dosimetrie-Seite verliert den Spektrum-Block samt Save-Dialog — damit
ist zugleich das Mobile-Overlap-Problem der absolut positionierten
Buttons erledigt.
EOF
)"
```

**Step 4.4: Merge zurück**

```bash
cd <repo-root>
git checkout feat/radiacode-via-bluetooth
git merge --no-ff feat/radiacode-live-spectrum
git worktree remove .worktrees/live-spectrum
```

(Falls der Worktree noch unstagged Files hat, abbrechen und prüfen.)
