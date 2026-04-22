# RadiaCode Spectrum XML-Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gespeicherte Spektren lassen sich einzeln als `.xml`-Datei im
exakten RadiaCode-Import-Format herunterladen. Eine so exportierte Datei
lässt sich vom bestehenden `parseSpectrumXml` bit-identisch zurücklesen und
in der originalen RadiaCode-App importieren.

**Architecture:** Neues Modul `src/common/spectrumExporter.ts`, invers zu
`spectrumParser.ts`. Download-Button in der Spektrum-Detailansicht
(`EnergySpectrum.tsx`). Roundtrip-Test über bestehenden Parser sichert
Schema-Treue.

**Tech Stack:** TypeScript, Vitest, Browser `Blob` / `URL.createObjectURL`
für den Download, keine zusätzliche Library nötig.

**Kontext für Agent:**

- Worktree: `.worktrees/radiacode-xml-export`, Basis
  `feat/radiacode-via-bluetooth`.
- Vor Start: `cp .env.local .worktrees/radiacode-xml-export/`.
- Testkonvention: Test-Datei liegt **neben** dem Source (siehe
  [CLAUDE.md](../../CLAUDE.md)), nicht in `__tests__/`.
- Referenz für Schema: [`src/common/spectrumParser.ts:66-121`](../../src/common/spectrumParser.ts#L66-L121).
- Am Ende: Merge in `feat/radiacode-via-bluetooth`, Worktree entfernen.

---

### Task 1: Test für `exportSpectrumXml` (Roundtrip)

**Files:**

- Create: `src/common/spectrumExporter.test.ts`

**Step 1: Fixture-Spektrum bauen**

Verwende ein minimalistisches Spektrum mit festen Werten:

```ts
import { describe, expect, it } from 'vitest';
import { exportSpectrumXml } from './spectrumExporter';
import { parseSpectrumXml } from './spectrumParser';

const fixture = {
  sampleName: 'Testprobe',
  deviceName: 'RadiaCode-102',
  measurementTime: 600,
  liveTime: 598,
  startTime: '2026-04-21T10:00:00',
  endTime: '2026-04-21T10:10:00',
  coefficients: [0, 2.5, 0],
  counts: [0, 1, 4, 9, 16, 25, 16, 9, 4, 1, 0],
};

describe('exportSpectrumXml', () => {
  it('roundtrips through parseSpectrumXml without data loss', () => {
    const xml = exportSpectrumXml(fixture);
    const parsed = parseSpectrumXml(xml);
    expect(parsed.sampleName).toBe(fixture.sampleName);
    expect(parsed.deviceName).toBe(fixture.deviceName);
    expect(parsed.measurementTime).toBe(fixture.measurementTime);
    expect(parsed.liveTime).toBe(fixture.liveTime);
    expect(parsed.startTime).toBe(fixture.startTime);
    expect(parsed.endTime).toBe(fixture.endTime);
    expect(parsed.coefficients).toEqual(fixture.coefficients);
    expect(parsed.counts).toEqual(fixture.counts);
  });

  it('produces well-formed XML with ResultDataFile/ResultData root', () => {
    const xml = exportSpectrumXml(fixture);
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain('<ResultDataFile');
    expect(xml).toContain('<ResultData');
    expect(xml).toContain('<EnergySpectrum');
  });

  it('escapes XML-special characters in sampleName', () => {
    const xml = exportSpectrumXml({ ...fixture, sampleName: 'A&B<C>' });
    const parsed = parseSpectrumXml(xml);
    expect(parsed.sampleName).toBe('A&B<C>');
  });
});
```

**Step 2: Tests ausführen**

Run: `NO_COLOR=1 npx vitest run src/common/spectrumExporter.test.ts`
Expected: **FAIL** (Modul existiert nicht).

**Step 3: Commit**

```bash
git add src/common/spectrumExporter.test.ts
git commit -m "test(spectrum): roundtrip-test fuer xml-exporter"
```

---

### Task 2: `exportSpectrumXml` implementieren

**Files:**

- Create: `src/common/spectrumExporter.ts`

**Step 1: Implementierung**

```ts
export interface ExportableSpectrum {
  sampleName: string;
  deviceName: string;
  measurementTime: number;
  liveTime: number;
  startTime: string;
  endTime: string;
  coefficients: number[];
  counts: number[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportSpectrumXml(s: ExportableSpectrum): string {
  const coefficientsXml = s.coefficients
    .map((c) => `        <Coefficient>${c}</Coefficient>`)
    .join('\n');
  const dataPointsXml = s.counts
    .map((n) => `      <DataPoint>${n}</DataPoint>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ResultDataFile>
  <ResultData>
    <DeviceConfigReference>
      <Name>${escapeXml(s.deviceName)}</Name>
    </DeviceConfigReference>
    <SampleInfo>
      <Name>${escapeXml(s.sampleName)}</Name>
    </SampleInfo>
    <StartTime>${escapeXml(s.startTime)}</StartTime>
    <EndTime>${escapeXml(s.endTime)}</EndTime>
    <EnergySpectrum>
      <NumberOfChannels>${s.counts.length}</NumberOfChannels>
      <MeasurementTime>${s.measurementTime}</MeasurementTime>
      <LiveTime>${s.liveTime}</LiveTime>
      <EnergyCalibration>
        <Coefficients>
${coefficientsXml}
        </Coefficients>
      </EnergyCalibration>
      <Spectrum>
${dataPointsXml}
      </Spectrum>
    </EnergySpectrum>
  </ResultData>
</ResultDataFile>
`;
}
```

**Step 2: Tests grün**

Run: `NO_COLOR=1 npx vitest run src/common/spectrumExporter.test.ts`
Expected: PASS (alle drei Tests).

Falls `parseSpectrumXml` eine Tag-Struktur nutzt, die dem obigen Layout
widerspricht (z.B. `<Spectrum>` vs. `<DataPoint>`-Parent): Parser in
[`src/common/spectrumParser.ts:66-121`](../../src/common/spectrumParser.ts#L66-L121)
als Source of Truth verwenden und XML-Struktur anpassen, bis Roundtrip
passt.

**Step 3: Commit**

```bash
git add src/common/spectrumExporter.ts
git commit -m "feat(spectrum): exportSpectrumXml fuer radiacode-kompatible xml-dateien"
```

---

### Task 3: Download-Button in Spektrum-Ansicht

**Files:**

- Modify: `src/components/pages/EnergySpectrum.tsx`

**Step 1: Button hinzufügen**

Neben der bestehenden Spektrum-Detailansicht (pro geladenem Spektrum) einen
MUI-`Button` mit Download-Icon, der ausgewähltes Spektrum per
`exportSpectrumXml` in eine Blob-URL schreibt und einen temporären Anchor
klickt:

```tsx
const handleDownload = (sp: Spectrum) => {
  const xml = exportSpectrumXml({
    sampleName: sp.sampleName,
    deviceName: sp.deviceName,
    measurementTime: sp.measurementTime,
    liveTime: sp.liveTime,
    startTime: sp.startTime,
    endTime: sp.endTime,
    coefficients: sp.coefficients,
    counts: sp.counts,
  });
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const sanitized = sp.sampleName.replace(/[^A-Za-z0-9._-]+/g, '_');
  const datePart = sp.startTime?.slice(0, 10) || 'unbekannt';
  a.download = `Spectrum_${sanitized}_${datePart}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

**Step 2: UI-Button-Platzierung**

Button als `<IconButton aria-label="XML exportieren">` oder
`<Button startIcon={<DownloadIcon />}>XML</Button>` neben der Spektrum-
Bezeichnung. Disabled wenn kein Spektrum ausgewählt (via `<span>`-Wrapper
in `Tooltip`, siehe MUI-Guideline in
[CLAUDE.md](../../CLAUDE.md#mui-guidelines)).

**Step 3: Manuelle Smoke-Verifikation**

```bash
npm run dev
```

Öffne ein gespeichertes Spektrum, klicke Export, öffne das erzeugte XML
in einem Editor und via `parseSpectrumXml` in einem Unit-Test oder
Import-Dialog.

**Step 4: Commit**

```bash
git add src/components/pages/EnergySpectrum.tsx
git commit -m "feat(spectrum): download-button fuer xml-export in spektrum-ansicht"
```

---

### Task 4: Vollchecks + Merge

**Step 1:**

```bash
npm run check
```
Expected: PASS.

**Step 2: Merge**

```bash
cd <repo-root>
git checkout feat/radiacode-via-bluetooth
git merge --no-ff .worktrees/radiacode-xml-export
git worktree remove .worktrees/radiacode-xml-export
```
