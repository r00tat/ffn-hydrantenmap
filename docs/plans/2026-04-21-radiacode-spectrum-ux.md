# RadiaCode Spectrum UX (Live + Zoom + Nuklid-Hover) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Drei eng verzahnte Spektrum-Features:

1. **Live-Anzeige als reguläre Messung** auf der Dosimetrie-Seite
   (kumulatives Live-Spektrum + 5-min-CPS-Trend, „Speichern" legt ein
   normales Firestore-Spektrum an). Der bisherige `RadiacodeCaptureDialog`
   entfällt als separater Modus.
2. **Zoom/Pan** auf Spektrum-Charts (Maus-Wheel, Drag, Touch-Pinch,
   Double-Tap-Reset).
3. **Nuklid-Hover**: Bewegt sich Maus/Finger über das Spektrum, wird ein
   Crosshair + Tooltip eingeblendet mit passenden Nukliden und deren
   weiteren Peaks als Reference-Linien.

**Architecture:** Ein gemeinsamer Wrapper `ZoomableSpectrumChart` ersetzt
die aktuelle direkte Nutzung von `LineChart` in `SpectrumChart`,
`EnergySpectrum` und `Dosimetrie`. Zoom-State und Hover-State leben lokal
in diesem Wrapper; die anrufenden Pages reichen nur Counts + Coefficients
+ optionale Overrides hin. Das Live-Spektrum wird vom
`RadiacodeProvider` permanent gepollt (nicht erst beim „Aufnehmen"), der
CPS-Ring-Buffer ebenfalls dort verwaltet.

**Tech Stack:** TypeScript, React 19, MUI `@mui/x-charts` (weiterhin die
einzige Chart-Library), Vitest + Testing Library.

**Kontext für Agent:**

- Worktree: `.worktrees/radiacode-spectrum-ux`, Basis
  `feat/radiacode-via-bluetooth`.
- Vor Start: `cp .env.local .worktrees/radiacode-spectrum-ux/`.
- Der Agent-Plan enthält drei Teilfeatures — innerhalb des Worktrees
  sequenziell umsetzen (Live → Zoom → Nuklid-Hover), damit Tests pro
  Schritt grün bleiben.
- MUI-Tooltip + disabled Button: `<span>`-Wrapper verwenden
  (siehe [CLAUDE.md](../../CLAUDE.md#mui-guidelines)).
- Tests liegen **neben** der Source-Datei.

---

## Teil A — Live-Spektrum in Dosimetrie-Seite

### Task A1: Test — Provider pollt Spektrum bei Connect

**Files:**

- Modify: `src/components/providers/RadiacodeProvider.test.tsx`

**Step 1: Neuen Test schreiben**

Fake-Client liefert nach dem Connect alle 200 ms einen Snapshot. Test
asserted: Provider-`spectrum` ist nach einem Tick nicht mehr `null`,
`snapshotCount` wächst, *ohne* dass `startSpectrumRecording` aufgerufen
wurde.

**Step 2: Test ausführen**

Run: `NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx`
Expected: **FAIL** (Provider startet Spektrum-Polling heute erst bei
Aufnahme-Start).

**Step 3: Commit**

```bash
git add src/components/providers/RadiacodeProvider.test.tsx
git commit -m "test(radiacode): provider soll spektrum automatisch pollen"
```

---

### Task A2: Provider — Auto-Polling + CPS-Ring-Buffer

**Files:**

- Modify: `src/components/providers/RadiacodeProvider.tsx`

**Step 1: Spektrum-Polling beim Connect starten**

Ref `spectrumRef` und Baseline bleiben; den Start des Polls vom
`startSpectrumRecording` in den Connect-Success-Pfad verschieben (direkt
nach dem Anlegen des `RadiacodeClient`, analog zum bisherigen
`startPolling` für Dose/CPS).

**Step 2: CPS-Ring-Buffer**

Neuer State `cpsHistory: { t: number; cps: number }[]`, maximal 300
Einträge (5 min × 1 Hz). Im bestehenden `onMeasurement`-Callback nach
jedem Tick anhängen und auf 300 Einträge kappen.

**Step 3: Reset/Speichern-API**

- `resetLiveSpectrum()` — setzt Baseline = aktueller Snapshot, leert
  `cpsHistory`.
- `saveLiveSpectrum(meta): Promise<string>` — erzeugt aus aktuellem
  Snapshot ein `Spectrum`-Objekt (analog zu
  [`RadiacodeCaptureDialog.tsx:136`](../../src/components/pages/RadiacodeCaptureDialog.tsx#L136))
  und persistiert via `useFirecallItemAdd`. Live-Polling läuft weiter.

**Step 4: Tests grün**

Run: `NO_COLOR=1 npx vitest run src/components/providers/RadiacodeProvider.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/providers/RadiacodeProvider.tsx \
        src/components/providers/RadiacodeProvider.test.tsx
git commit -m "feat(radiacode): permanentes live-spektrum + 5min-cps-historie im provider"
```

---

### Task A3: Dosimetrie-Seite — Live-Spektrum + CPS-Trend

**Files:**

- Modify: `src/components/pages/Dosimetrie.tsx`
- Delete (am Ende): `src/components/pages/RadiacodeCaptureDialog.tsx` +
  zugehöriger Test

**Step 1: UI aufbauen**

Unter den bisherigen Metric-Tiles:

- `SpectrumChart` (später durch `ZoomableSpectrumChart` ersetzt) mit den
  Live-Counts. Y-Achse default **log**.
- Kleinerer `LineChart` für die letzten 300 CPS-Werte (X = Sekunden,
  Y = cps). Kein Zoom, nur Trend.
- Action-Row: `Reset`-Button (→ `resetLiveSpectrum`),
  `Speichern`-Button (öffnet kleinen Dialog für Name/Description → ruft
  `saveLiveSpectrum`).

**Step 2: Capture-Dialog entfernen**

Referenzen auf `RadiacodeCaptureDialog` suchen
(`grep -rn RadiacodeCaptureDialog src`). Button, der den Dialog öffnete,
ersetzen durch die neue Inline-UI. Danach die Dialog-Datei und ihren Test
entfernen.

**Step 3: Tests aktualisieren**

`src/components/pages/RadiacodeCaptureDialog.test.tsx` wandert in
`src/components/pages/Dosimetrie.test.tsx` (neu, falls nicht vorhanden)
oder verteilt sich auf die entsprechenden Szenarien:

- Speichern-Klick erzeugt Firestore-Item mit korrekten Feldern.
- Reset-Klick leert Counts + CPS-History.

**Step 4: Vollchecks**

Run: `npm run check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pages/Dosimetrie.tsx \
        src/components/pages/Dosimetrie.test.tsx \
        src/components/pages/RadiacodeCaptureDialog.tsx \
        src/components/pages/RadiacodeCaptureDialog.test.tsx
git commit -m "feat(radiacode): live-spektrum und cps-trend in dosimetrie-seite"
```

---

## Teil B — Zoom/Pan im Spektrum-Chart

### Task B1: Test — Zoom-State-Reducer

**Files:**

- Create: `src/components/pages/zoomState.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from 'vitest';
import { applyWheelZoom, applyPan, resetRange } from './zoomState';

describe('zoomState', () => {
  it('wheel zoom-in halbiert die Breite um die Cursor-Position', () => {
    const r = applyWheelZoom([0, 1000], 500, -1); // delta<0 = zoom in
    expect(r).toEqual([250, 750]);
  });
  it('pan verschiebt beide Grenzen um dx (in keV)', () => {
    const r = applyPan([100, 200], 30);
    expect(r).toEqual([130, 230]);
  });
  it('reset liefert default range zurück', () => {
    expect(resetRange([0, 3000])).toEqual([0, 3000]);
  });
});
```

**Step 2: Test ausführen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/zoomState.test.ts`
Expected: **FAIL** (Module fehlen).

**Step 3: Commit**

```bash
git add src/components/pages/zoomState.test.ts
git commit -m "test(spectrum): zoom-state-reducer"
```

---

### Task B2: `zoomState.ts` implementieren

**Files:**

- Create: `src/components/pages/zoomState.ts`

**Step 1: Reducer-Funktionen**

```ts
export type Range = [number, number];

export function applyWheelZoom(
  range: Range,
  pivot: number,
  delta: number,
  factor = 1.2,
): Range {
  const [a, b] = range;
  const scale = delta < 0 ? 1 / factor : factor;
  const newSpan = (b - a) * scale;
  const leftFrac = (pivot - a) / (b - a);
  const newA = pivot - newSpan * leftFrac;
  const newB = newA + newSpan;
  return [newA, newB];
}

export function applyPan(range: Range, deltaKev: number): Range {
  return [range[0] + deltaKev, range[1] + deltaKev];
}

export function resetRange(defaultRange: Range): Range {
  return [...defaultRange] as Range;
}
```

**Step 2: Tests grün**

Run: `NO_COLOR=1 npx vitest run src/components/pages/zoomState.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/pages/zoomState.ts
git commit -m "feat(spectrum): zoom/pan reducer"
```

---

### Task B3: `ZoomableSpectrumChart` — Wrapper-Komponente

**Files:**

- Create: `src/components/pages/ZoomableSpectrumChart.tsx`
- Modify: alle Call-Sites von `SpectrumChart` (Dosimetrie, EnergySpectrum,
  ggf. Capture-Detailansicht), Aufrufe auf den neuen Wrapper umstellen.

**Step 1: Komponente**

- Props: `{ counts: number[]; coefficients: number[]; height?: number;
  logScale?: boolean; overlays?: ReactNode; onPointerMove?: (kev:
  number | null) => void }`.
- Internes State: `xRange`, `yRange` (via `zoomState`-Reducer).
- MUI `LineChart`: `xAxis={[{ min: xRange[0], max: xRange[1], ... }]}`,
  `yAxis={[{ min: yRange[0], max: yRange[1], scaleType: logScale ? 'log' : 'linear' }]}`.
- Event-Handler auf einem `<Box sx={{ position: 'relative' }}>`-Wrapper,
  nicht auf der SVG-Chart direkt (MUI hängt die SVG in einem Inneren
  Container auf).
- `wheel` → `applyWheelZoom`, `pointerdown + pointermove` → `applyPan`,
  `touchstart` mit 2 Touches → Pinch (distance ratio →
  `applyWheelZoom`), `dblclick` / `doubletap` → `resetRange`.
- Y default: auto auf visible X-Fenster (max counts in sichtbarem Bereich
  × 1.1). `shift+wheel` → Y zoom. Manuelles Y-Zoom setzt auto-Modus aus
  bis Reset.

**Step 2: Call-Sites anpassen**

`<SpectrumChart counts=… coefficients=… />` →
`<ZoomableSpectrumChart counts=… coefficients=… logScale />`.

**Step 3: Vollchecks**

Run: `npm run check`
Expected: PASS (bestehende Tests laufen weiter, weil sie nur `SpectrumChart`
oder `ZoomableSpectrumChart`-Props lesen).

**Step 4: Commit**

```bash
git add src/components/pages/ZoomableSpectrumChart.tsx \
        src/components/pages/Dosimetrie.tsx \
        src/components/pages/EnergySpectrum.tsx
git commit -m "feat(spectrum): zoom/pan-wrapper fuer spektrum-chart"
```

---

## Teil C — Nuklid-Hover mit Crosshair

### Task C1: Test — Nuklid-Matching an Cursor-Energie

**Files:**

- Create: `src/common/nuclidesAtEnergy.test.ts`

**Step 1: Tests**

```ts
import { describe, expect, it } from 'vitest';
import { nuclidesAtEnergy } from './nuclidesAtEnergy';

describe('nuclidesAtEnergy', () => {
  it('matches Cs-137 in der Nähe seiner 662-keV-Linie', () => {
    const hits = nuclidesAtEnergy(660);
    expect(hits.some((h) => h.nuclide.name.startsWith('Cs-137'))).toBe(true);
  });
  it('matched nichts bei sehr hoher Energie', () => {
    expect(nuclidesAtEnergy(9000)).toHaveLength(0);
  });
});
```

**Step 2: Test ausführen**

Expected: **FAIL** (Modul fehlt).

**Step 3: Commit**

```bash
git add src/common/nuclidesAtEnergy.test.ts
git commit -m "test(spectrum): nuclidesAtEnergy"
```

---

### Task C2: `nuclidesAtEnergy` implementieren

**Files:**

- Create: `src/common/nuclidesAtEnergy.ts`

**Step 1:**

```ts
import { NUCLIDES, type Nuclide } from './strahlenschutz';
import { toleranceFor } from './spectrumParser';

export interface NuclideAtEnergy {
  nuclide: Nuclide;
  closestPeakKev: number;
  distanceKev: number;
  intensity: number;
}

export function nuclidesAtEnergy(energyKev: number): NuclideAtEnergy[] {
  const tol = toleranceFor(energyKev);
  const hits: NuclideAtEnergy[] = [];
  for (const n of NUCLIDES) {
    if (!n.peaks?.length) continue;
    for (const p of n.peaks) {
      const dist = Math.abs(p.energy - energyKev);
      if (dist <= tol) {
        hits.push({
          nuclide: n,
          closestPeakKev: p.energy,
          distanceKev: dist,
          intensity: p.intensity,
        });
        break;
      }
    }
  }
  hits.sort(
    (a, b) => a.distanceKev / a.intensity - b.distanceKev / b.intensity,
  );
  return hits;
}
```

**Step 2: Tests grün**

Run: `NO_COLOR=1 npx vitest run src/common/nuclidesAtEnergy.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/common/nuclidesAtEnergy.ts
git commit -m "feat(spectrum): nuclidesAtEnergy lookup fuer hover-crosshair"
```

---

### Task C3: Hover-Overlay in `ZoomableSpectrumChart`

**Files:**

- Modify: `src/components/pages/ZoomableSpectrumChart.tsx`

**Step 1: Hover-State**

- `hoverKev: number | null`.
- `pointermove` auf dem Chart-Container: Pixel→keV via aktueller X-Skala
  (`xRange` + Container-Breite).
- `pointerleave` / `pointercancel` / `touchend` ohne weitere Touches:
  `hoverKev = null`.

**Step 2: Overlay**

- Vertikale Linie bei `hoverKev` (absolut positioniertes `<div>` oder
  SVG-Overlay im gleichen Coordinate-System).
- MUI `Popper`/`Paper` als Tooltip: Zeigt `"<kev> keV"` und bis zu drei
  Treffer aus `nuclidesAtEnergy(hoverKev)` (Name + nächster Peak + Abstand).
- Beste Übereinstimmung: alle Peaks dieses Nuklids als
  `ChartsReferenceLine` ([Reuse von
  `src/common/nuclidePeakLines.ts`](../../src/common/nuclidePeakLines.ts#L16))
  während der Hover rendern.

**Step 3: Touch-Support**

`pointermove` mit `pointerType === 'touch'` reicht aus (Browser schickt
touch pointermove standardmäßig). Scroll-Konflikt vermeiden: `touch-action:
none` auf dem Chart-Container.

**Step 4: Vollchecks**

Run: `npm run check`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pages/ZoomableSpectrumChart.tsx
git commit -m "feat(spectrum): hover-crosshair mit nuklid-tooltip und peak-overlay"
```

---

## Abschluss

### Task Z1: Merge zurück in Feature-Branch

**Step 1:** Im Haupt-Checkout:

```bash
cd <repo-root>
git checkout feat/radiacode-via-bluetooth
git merge --no-ff .worktrees/radiacode-spectrum-ux
```

Konflikte werden erwartet in `Dosimetrie.tsx` (falls die anderen
Worktrees dort auch gearbeitet haben — sollte nicht der Fall sein, da sie
andere Areas betreffen). Bei Konflikten konservativ resolveen und Tests
rerun:

```bash
npm run check
```

**Step 2: Worktree entfernen**

```bash
git worktree remove .worktrees/radiacode-spectrum-ux
```
