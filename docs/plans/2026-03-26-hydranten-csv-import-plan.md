# Hydranten CSV Import — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin tab to upload WLV CSV files, match against existing Firestore hydrants, preview changes, and merge-import with duplicate cleanup.

**Architecture:** Server Actions for CSV parsing/matching/import logic. Single new UI component `HydrantenCsvImport.tsx` reusing existing `FileUpload`, `ProgressStepper`, `DataPreview`. Wired into `AdminTabs.tsx`.

**Tech Stack:** Next.js Server Actions, csv-parse, proj4/epsg for coordinate conversion, geofire-common for geohash, MUI components, Vitest for tests.

**Design doc:** `docs/plans/2026-03-26-hydranten-csv-import-design.md`

---

### Task 1: CSV Parsing Utility

Pure function that parses WLV CSV text into mapped hydrant records. No Firestore, no coordinates — just parsing + field mapping.

**Files:**
- Create: `src/server/hydrantenCsvParser.ts`
- Test: `src/server/hydrantenCsvParser.test.ts`

**Step 1: Write failing tests**

```typescript
// src/server/hydrantenCsvParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseHydrantenCsv, type ParsedHydrantRow } from './hydrantenCsvParser';

const SAMPLE_CSV = `Wasserversorger,Ortsnetz / Versorgungseinheit,ART,Hydranten-Nr.,Gemeinde-WZ,Dimension,Leitungsart,Stat. Druck ,Dyn. Druck,Druck gemessen am,GOK ,X-Koordinate,Y-Koordinate
"(WV, WG, Gemeinde)",(Gemeinde),(Überflurhydrant;Unterflurhydrant),,(JA; NEIN),(DN 80; DN 100),(Ringleitung;   Endstrang),[bar],[bar],,[m ü.A.],(GK M34),(GK M34)
Wasserleitungsverband Nördl. Burgenland,Neusiedl,Überflurhydrant,HY1,---,80,Endstrang,"5,6",4,17/10/2024,"116,52","37648,217","310270,421"
Wasserleitungsverband Nördl. Burgenland,Neusiedl,Überflurhydrant,HY10,ja,80,Ringleitung,"5,5","4,5",17/10/2024,"116,65","38286,313","311524,357"`;

describe('parseHydrantenCsv', () => {
  it('parses CSV and maps fields correctly', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      ortschaft: 'Neusiedl',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 5.6,
      dynamischer_druck: 4,
      druckmessung_datum: '17/10/2024',
      meereshoehe: 116.52,
      raw_x: 37648.217,
      raw_y: 310270.421,
    });
  });

  it('maps Gemeinde-WZ ja to JA', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result[1].fuellhydrant).toBe('JA');
  });

  it('skips description row', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    // Should not contain the description row with "(Gemeinde)" etc.
    expect(result.every((r) => r.ortschaft !== '(Gemeinde)')).toBe(true);
  });

  it('handles empty CSV', () => {
    const headerOnly = SAMPLE_CSV.split('\n').slice(0, 2).join('\n');
    const result = parseHydrantenCsv(headerOnly);
    expect(result).toHaveLength(0);
  });

  it('generates document key from ortschaft + hydranten_nummer', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result[0].documentKey).toBe('neusiedl_hy1');
    expect(result[1].documentKey).toBe('neusiedl_hy10');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/server/hydrantenCsvParser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parseHydrantenCsv**

```typescript
// src/server/hydrantenCsvParser.ts
import { parse } from 'csv-parse/sync';

export interface ParsedHydrantRow {
  ortschaft: string;
  typ: string;
  hydranten_nummer: string;
  fuellhydrant: string;
  dimension: number;
  leitungsart: string;
  statischer_druck: number;
  dynamischer_druck: number;
  druckmessung_datum: string;
  meereshoehe: number;
  raw_x: number;
  raw_y: number;
  documentKey: string;
}

/** CSV column header -> target field */
const COLUMN_MAP: Record<string, string> = {
  'ortsnetz___versorgungseinheit': 'ortschaft',
  'art': 'typ',
  'hydranten_nr_': 'hydranten_nummer',
  'gemeinde_wz': 'fuellhydrant',
  'dimension': 'dimension',
  'leitungsart': 'leitungsart',
  'stat__druck_': 'statischer_druck',
  'dyn__druck': 'dynamischer_druck',
  'druck_gemessen_am': 'druckmessung_datum',
  'gok_': 'meereshoehe',
  'x_koordinate': 'raw_x',
  'y_koordinate': 'raw_y',
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function parseDecimalComma(value: string): number {
  if (typeof value !== 'string') return Number(value);
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  return Number.parseFloat(cleaned);
}

function mapFuellhydrant(value: string): string {
  if (!value || value === '---') return 'NEIN';
  if (value.toLowerCase() === 'ja') return 'JA';
  return value.toUpperCase();
}

function generateDocumentKey(ortschaft: string, hydrantenNummer: string): string {
  return `${ortschaft}_${hydrantenNummer}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

export function parseHydrantenCsv(csvText: string): ParsedHydrantRow[] {
  const lines = csvText.split('\n');
  // Remove description row (row 2, index 1)
  if (lines.length > 2) {
    lines.splice(1, 1);
  }
  const cleaned = lines.join('\n');

  const records: Record<string, string>[] = parse(cleaned, {
    columns: (header: string[]) => header.map(normalizeHeader),
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return records.map((record) => {
    const mapped: Record<string, unknown> = {};
    for (const [csvKey, targetKey] of Object.entries(COLUMN_MAP)) {
      if (record[csvKey] !== undefined) {
        mapped[targetKey] = record[csvKey];
      }
    }

    // Parse numbers with decimal comma handling
    const numericFields = ['statischer_druck', 'dynamischer_druck', 'meereshoehe', 'raw_x', 'raw_y', 'dimension'];
    for (const field of numericFields) {
      if (mapped[field] !== undefined) {
        mapped[field] = parseDecimalComma(String(mapped[field]));
      }
    }

    // Map fuellhydrant
    mapped.fuellhydrant = mapFuellhydrant(String(mapped.fuellhydrant ?? ''));

    // Generate document key
    mapped.documentKey = generateDocumentKey(
      String(mapped.ortschaft ?? ''),
      String(mapped.hydranten_nummer ?? '')
    );

    return mapped as unknown as ParsedHydrantRow;
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/server/hydrantenCsvParser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/hydrantenCsvParser.ts src/server/hydrantenCsvParser.test.ts
git commit -m "feat: add WLV CSV parser with field mapping for hydrant import"
```

---

### Task 2: Coordinate Conversion + Geohash

Pure function that takes parsed rows and adds `lat`, `lng`, `geohash`.

**Files:**
- Create: `src/server/hydrantenCsvConverter.ts`
- Test: `src/server/hydrantenCsvConverter.test.ts`

**Step 1: Write failing tests**

```typescript
// src/server/hydrantenCsvConverter.test.ts
import { describe, it, expect } from 'vitest';
import { convertCoordinates, type ConvertedHydrantRow } from './hydrantenCsvConverter';
import type { ParsedHydrantRow } from './hydrantenCsvParser';

describe('convertCoordinates', () => {
  it('converts GK M34 to WGS84 and computes geohash', () => {
    const input: ParsedHydrantRow[] = [{
      ortschaft: 'Neusiedl',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 5.6,
      dynamischer_druck: 4,
      druckmessung_datum: '17/10/2024',
      meereshoehe: 116.52,
      raw_x: 37648.217,
      raw_y: 310270.421,
      documentKey: 'neusiedl_hy1',
    }];

    const result = convertCoordinates(input);
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBeCloseTo(47.92995, 4);
    expect(result[0].lng).toBeCloseTo(16.83597, 4);
    expect(result[0].geohash).toBeDefined();
    expect(result[0].geohash).toHaveLength(6);
    // name should equal documentKey
    expect(result[0].name).toBe('neusiedl_hy1');
  });

  it('filters out rows with invalid coordinates', () => {
    const input: ParsedHydrantRow[] = [{
      ortschaft: 'Test',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 0,
      dynamischer_druck: 0,
      druckmessung_datum: '',
      meereshoehe: 0,
      raw_x: NaN,
      raw_y: NaN,
      documentKey: 'test_hy1',
    }];

    const result = convertCoordinates(input);
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/server/hydrantenCsvConverter.test.ts`
Expected: FAIL

**Step 3: Implement convertCoordinates**

```typescript
// src/server/hydrantenCsvConverter.ts
import { geohashForLocation } from 'geofire-common';
import { GEOHASH_PRECISION } from '../common/gis-objects';
import { gk34ToWgs84 } from '../common/wgs-convert';
import type { ParsedHydrantRow } from './hydrantenCsvParser';

export interface ConvertedHydrantRow extends ParsedHydrantRow {
  lat: number;
  lng: number;
  geohash: string;
  name: string;
}

export function convertCoordinates(rows: ParsedHydrantRow[]): ConvertedHydrantRow[] {
  return rows
    .map((row) => {
      if (Number.isNaN(row.raw_x) || Number.isNaN(row.raw_y)) return null;

      const wgs = gk34ToWgs84(row.raw_x, row.raw_y, 'EPSG:31256');
      const lat = wgs.y;
      const lng = wgs.x;

      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

      const geohash = geohashForLocation([lat, lng], GEOHASH_PRECISION);

      return {
        ...row,
        lat,
        lng,
        geohash,
        name: row.documentKey,
      };
    })
    .filter((row): row is ConvertedHydrantRow => row !== null);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/server/hydrantenCsvConverter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/hydrantenCsvConverter.ts src/server/hydrantenCsvConverter.test.ts
git commit -m "feat: add coordinate conversion (GK M34 -> WGS84) for CSV hydrant import"
```

---

### Task 3: Matching Logic

Function that takes converted rows + existing Firestore docs, computes match results (new/update/duplicate).

**Files:**
- Create: `src/server/hydrantenMatcher.ts`
- Test: `src/server/hydrantenMatcher.test.ts`

**Step 1: Write failing tests**

```typescript
// src/server/hydrantenMatcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchHydranten, type MatchResult } from './hydrantenMatcher';
import type { ConvertedHydrantRow } from './hydrantenCsvConverter';

function makeRow(overrides: Partial<ConvertedHydrantRow>): ConvertedHydrantRow {
  return {
    ortschaft: 'Neusiedl',
    typ: 'Überflurhydrant',
    hydranten_nummer: 'HY1',
    fuellhydrant: 'NEIN',
    dimension: 80,
    leitungsart: 'Endstrang',
    statischer_druck: 5.6,
    dynamischer_druck: 4,
    druckmessung_datum: '17/10/2024',
    meereshoehe: 116.52,
    raw_x: 37648.217,
    raw_y: 310270.421,
    lat: 47.92995,
    lng: 16.83597,
    geohash: 'u2ekkj',
    name: 'neusiedl_hy1',
    documentKey: 'neusiedl_hy1',
    ...overrides,
  };
}

interface ExistingDoc {
  id: string;
  ortschaft: string;
  hydranten_nummer: string;
  leistung?: number;
  [key: string]: unknown;
}

describe('matchHydranten', () => {
  it('marks new records when no existing data', () => {
    const rows = [makeRow({})];
    const result = matchHydranten(rows, []);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new');
    expect(result[0].duplicateDocId).toBeUndefined();
  });

  it('marks update when same key exists', () => {
    const rows = [makeRow({})];
    const existing: ExistingDoc[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('update');
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('detects duplicate when alias key exists (ND vs Neusiedl)', () => {
    const rows = [makeRow({})];
    const existing: ExistingDoc[] = [{
      id: 'ndhy1',
      ortschaft: 'ND',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('update');
    expect(result[0].duplicateDocId).toBe('ndhy1');
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('preserves leistung from existing record', () => {
    const rows = [makeRow({})];
    const existing: ExistingDoc[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('does not preserve leistung if not present in existing', () => {
    const rows = [makeRow({})];
    const existing: ExistingDoc[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
    }];
    const result = matchHydranten(rows, existing);
    expect(result[0].preservedFields).toEqual({});
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/server/hydrantenMatcher.test.ts`
Expected: FAIL

**Step 3: Implement matchHydranten**

```typescript
// src/server/hydrantenMatcher.ts
import type { ConvertedHydrantRow } from './hydrantenCsvConverter';

export type MatchStatus = 'new' | 'update';

export interface MatchResult {
  row: ConvertedHydrantRow;
  status: MatchStatus;
  /** Doc ID to delete if a duplicate with a different key was found */
  duplicateDocId?: string;
  /** Fields to preserve from the existing record (e.g., leistung) */
  preservedFields: Record<string, unknown>;
}

/** Fields to preserve from existing records if not present in CSV */
const PRESERVE_FIELDS = ['leistung'];

export interface ExistingHydrant {
  id: string;
  ortschaft: string;
  hydranten_nummer: string;
  [key: string]: unknown;
}

export function matchHydranten(
  rows: ConvertedHydrantRow[],
  existing: ExistingHydrant[],
): MatchResult[] {
  // Build index: hydranten_nummer (lowercase) -> list of {docId, ortschaft, data}
  const byNummer = new Map<string, { id: string; ortschaft: string; data: ExistingHydrant }[]>();
  for (const doc of existing) {
    const key = (doc.hydranten_nummer ?? '').toLowerCase();
    if (!byNummer.has(key)) byNummer.set(key, []);
    byNummer.get(key)!.push({ id: doc.id, ortschaft: doc.ortschaft ?? '', data: doc });
  }

  // Build index by doc ID for direct key match
  const byDocId = new Map<string, ExistingHydrant>();
  for (const doc of existing) {
    byDocId.set(doc.id, doc);
  }

  return rows.map((row) => {
    const nummerKey = row.hydranten_nummer.toLowerCase();
    const preservedFields: Record<string, unknown> = {};

    // 1. Direct key match (same document key)
    const directMatch = byDocId.get(row.documentKey);
    if (directMatch) {
      for (const field of PRESERVE_FIELDS) {
        if (directMatch[field] !== undefined && directMatch[field] !== null) {
          preservedFields[field] = directMatch[field];
        }
      }
      return { row, status: 'update' as const, preservedFields };
    }

    // 2. Check for alias match (same hydranten_nummer, different ortschaft/key)
    const candidates = byNummer.get(nummerKey) || [];
    const aliasMatch = candidates.find((c) => c.id !== row.documentKey);
    if (aliasMatch) {
      for (const field of PRESERVE_FIELDS) {
        if (aliasMatch.data[field] !== undefined && aliasMatch.data[field] !== null) {
          preservedFields[field] = aliasMatch.data[field];
        }
      }
      return {
        row,
        status: 'update' as const,
        duplicateDocId: aliasMatch.id,
        preservedFields,
      };
    }

    // 3. No match -> new
    return { row, status: 'new' as const, preservedFields };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/server/hydrantenMatcher.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/hydrantenMatcher.ts src/server/hydrantenMatcher.test.ts
git commit -m "feat: add hydrant matching logic with duplicate detection and field preservation"
```

---

### Task 4: Server Actions

Server actions that orchestrate parsing, matching, and import. Protected with `actionAdminRequired()`.

**Files:**
- Create: `src/app/admin/hydrantenCsvImportAction.ts`

**Step 1: Implement server actions**

```typescript
// src/app/admin/hydrantenCsvImportAction.ts
'use server';

import { parseHydrantenCsv } from '../../server/hydrantenCsvParser';
import { convertCoordinates, type ConvertedHydrantRow } from '../../server/hydrantenCsvConverter';
import { matchHydranten, type MatchResult, type ExistingHydrant } from '../../server/hydrantenMatcher';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';

export interface CsvParseResult {
  records: ConvertedHydrantRow[];
  totalParsed: number;
  skippedInvalidCoords: number;
}

export async function parseAndConvertCsv(formData: FormData): Promise<CsvParseResult> {
  await actionAdminRequired();

  const file = formData.get('csvFile') as File;
  if (!file) throw new Error('No CSV file provided');

  const csvText = await file.text();
  const parsed = parseHydrantenCsv(csvText);
  const converted = convertCoordinates(parsed);

  return {
    records: converted,
    totalParsed: parsed.length,
    skippedInvalidCoords: parsed.length - converted.length,
  };
}

export async function matchRecords(records: ConvertedHydrantRow[]): Promise<MatchResult[]> {
  await actionAdminRequired();

  // Load all existing hydrants from Firestore
  const snapshot = await firestore.collection('hydrant').get();
  const existing: ExistingHydrant[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ExistingHydrant[];

  return matchHydranten(records, existing);
}

export interface ImportResult {
  created: number;
  updated: number;
  duplicatesDeleted: number;
}

export async function importRecords(matchResults: MatchResult[]): Promise<ImportResult> {
  await actionAdminRequired();

  const stats = { created: 0, updated: 0, duplicatesDeleted: 0 };
  const collection = firestore.collection('hydrant');

  // Process in batches of 400 (Firestore limit is 500 per batch)
  const batchSize = 400;
  for (let i = 0; i < matchResults.length; i += batchSize) {
    const batch = firestore.batch();
    const chunk = matchResults.slice(i, i + batchSize);

    for (const result of chunk) {
      const { row, status, duplicateDocId, preservedFields } = result;

      // Build document data (exclude raw_x, raw_y, documentKey)
      const { raw_x, raw_y, documentKey, ...data } = row;
      const docData = { ...data, ...preservedFields };

      batch.set(collection.doc(row.documentKey), docData, { merge: true });

      if (status === 'new') stats.created++;
      else stats.updated++;

      // Delete duplicate doc if found
      if (duplicateDocId && duplicateDocId !== row.documentKey) {
        batch.delete(collection.doc(duplicateDocId));
        stats.duplicatesDeleted++;
      }
    }

    await batch.commit();
  }

  return stats;
}
```

**Step 2: Commit**

```bash
git add src/app/admin/hydrantenCsvImportAction.ts
git commit -m "feat: add server actions for hydrant CSV import, matching, and Firestore write"
```

---

### Task 5: UI Component

The admin UI for CSV upload, preview, and import confirmation.

**Files:**
- Create: `src/components/admin/HydrantenCsvImport.tsx`
- Modify: `src/components/admin/AdminTabs.tsx`

**Step 1: Create HydrantenCsvImport component**

```typescript
// src/components/admin/HydrantenCsvImport.tsx
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState, useCallback } from 'react';
import FileUpload from './FileUpload';
import ProgressStepper, { type StepStatus } from './ProgressStepper';
import {
  parseAndConvertCsv,
  matchRecords,
  importRecords,
  type CsvParseResult,
  type ImportResult,
} from '../../app/admin/hydrantenCsvImportAction';
import type { MatchResult } from '../../server/hydrantenMatcher';

const STEPS = [
  { label: 'CSV parsen', description: 'Datei lesen, Felder mappen, Dezimalkomma konvertieren' },
  { label: 'Koordinaten konvertieren', description: 'GK M34 → WGS84, Geohash berechnen' },
  { label: 'Matching', description: 'Bestehende Hydranten laden und abgleichen' },
  { label: 'Vorschau', description: 'Änderungen prüfen vor dem Import' },
  { label: 'Import', description: 'Daten in Firestore schreiben' },
];

type StatusFilter = 'all' | 'new' | 'update';

export default function HydrantenCsvImport() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [status, setStatus] = useState<StepStatus>('pending');
  const [error, setError] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);

  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const resetAll = useCallback(() => {
    setCsvFile(null);
    setActiveStep(-1);
    setStatus('pending');
    setError(undefined);
    setIsRunning(false);
    setParseResult(null);
    setMatchResults([]);
    setImportResult(null);
    setStatusFilter('all');
  }, []);

  const startParsing = useCallback(async () => {
    if (!csvFile) return;
    setIsRunning(true);
    setError(undefined);

    try {
      // Step 0+1: Parse + Convert
      setActiveStep(0);
      setStatus('in_progress');

      const formData = new FormData();
      formData.append('csvFile', csvFile);
      const result = await parseAndConvertCsv(formData);
      setParseResult(result);

      setActiveStep(1);
      setStatus('completed');

      // Step 2: Match
      setActiveStep(2);
      setStatus('in_progress');
      const matches = await matchRecords(result.records);
      setMatchResults(matches);

      // Step 3: Preview
      setActiveStep(3);
      setStatus('pending');
      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [csvFile]);

  const startImport = useCallback(async () => {
    setIsRunning(true);
    setActiveStep(4);
    setStatus('in_progress');

    try {
      const result = await importRecords(matchResults);
      setImportResult(result);
      setStatus('completed');
      setIsRunning(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }, [matchResults]);

  const newCount = matchResults.filter((r) => r.status === 'new').length;
  const updateCount = matchResults.filter((r) => r.status === 'update').length;
  const duplicateCount = matchResults.filter((r) => r.duplicateDocId).length;

  const filteredResults = statusFilter === 'all'
    ? matchResults
    : matchResults.filter((r) => r.status === statusFilter);

  const showPreview = activeStep === 3 && status === 'pending' && matchResults.length > 0;
  const showSuccess = activeStep === 4 && status === 'completed' && importResult;

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Hydranten CSV Import
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        WLV CSV-Datei hochladen, um Hydranten zu aktualisieren oder neu anzulegen.
        Bestehende Felder wie Leistung bleiben erhalten. Duplikate werden automatisch bereinigt.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <FileUpload
          accept=".csv"
          label="CSV Datei auswählen"
          onFileSelect={setCsvFile}
          selectedFile={csvFile}
          disabled={isRunning}
        />
        <Box>
          <Button
            variant="contained"
            onClick={startParsing}
            disabled={!csvFile || isRunning}
          >
            CSV analysieren
          </Button>
        </Box>
      </Box>

      {activeStep >= 0 && (
        <Box sx={{ mb: 3 }}>
          <ProgressStepper
            steps={STEPS}
            activeStep={activeStep}
            status={status}
            error={error}
          />
        </Box>
      )}

      {parseResult && activeStep >= 1 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            {parseResult.totalParsed} Zeilen geparst, {parseResult.records.length} mit gültigen Koordinaten
            {parseResult.skippedInvalidCoords > 0 && ` (${parseResult.skippedInvalidCoords} übersprungen)`}
          </Typography>
        </Box>
      )}

      {showPreview && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Vorschau
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <Chip label={`${newCount} Neu`} color="success" variant="outlined" />
            <Chip label={`${updateCount} Update`} color="info" variant="outlined" />
            {duplicateCount > 0 && (
              <Chip label={`${duplicateCount} Duplikate bereinigen`} color="warning" variant="outlined" />
            )}
          </Box>

          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(_e, val) => val && setStatusFilter(val)}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="all">Alle ({matchResults.length})</ToggleButton>
            <ToggleButton value="new">Neu ({newCount})</ToggleButton>
            <ToggleButton value="update">Update ({updateCount})</ToggleButton>
          </ToggleButtonGroup>

          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Ortschaft</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Hydranten-Nr.</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Typ</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Dimension</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Stat. Druck</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Dyn. Druck</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Duplikat</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredResults.slice(0, 100).map((result, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Chip
                        label={result.status === 'new' ? 'Neu' : 'Update'}
                        color={result.status === 'new' ? 'success' : 'info'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{result.row.ortschaft}</TableCell>
                    <TableCell>{result.row.hydranten_nummer}</TableCell>
                    <TableCell>{result.row.typ}</TableCell>
                    <TableCell>{result.row.dimension}</TableCell>
                    <TableCell>{result.row.statischer_druck}</TableCell>
                    <TableCell>{result.row.dynamischer_druck}</TableCell>
                    <TableCell>{result.duplicateDocId ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {filteredResults.length > 100 && (
            <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
              Zeige 100 von {filteredResults.length} Einträgen
            </Typography>
          )}

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={resetAll}>
              Abbrechen
            </Button>
            <Button variant="contained" onClick={startImport}>
              Import starten ({matchResults.length} Hydranten)
            </Button>
          </Box>
        </Box>
      )}

      {showSuccess && (
        <Box sx={{ mt: 2 }}>
          <Typography color="success.main" variant="h6">
            Import erfolgreich
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {importResult.created} neu angelegt, {importResult.updated} aktualisiert
            {importResult.duplicatesDeleted > 0 && `, ${importResult.duplicatesDeleted} Duplikate bereinigt`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bitte &quot;Update Clusters&quot; im Hydrant Clusters Tab ausführen, um die Cluster-Daten zu aktualisieren.
          </Typography>
          <Button variant="outlined" onClick={resetAll} sx={{ mt: 2 }}>
            Neuen Import starten
          </Button>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={resetAll}>
            Zurücksetzen
          </Button>
        </Box>
      )}
    </Paper>
  );
}
```

**Step 2: Wire into AdminTabs**

In `src/components/admin/AdminTabs.tsx`:
- Add import: `import HydrantenCsvImport from './HydrantenCsvImport';`
- Add Tab: `<Tab label="Hydranten CSV Import" {...a11yProps(6)} />`
- Add TabPanel: `<TabPanel value={value} index={6}><HydrantenCsvImport /></TabPanel>`

**Step 3: Run build to check for type errors**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/admin/HydrantenCsvImport.tsx src/components/admin/AdminTabs.tsx
git commit -m "feat: add Hydranten CSV Import admin tab with preview and import UI"
```

---

### Task 6: Integration Test + Final Verification

**Step 1: Run all tests**

Run: `npm run test`
Expected: All pass

**Step 2: Run full check**

Run: `npm run check`
Expected: tsc, lint, tests, build all pass

**Step 3: Manual verification**

1. Start dev server: `npm run dev`
2. Navigate to `/admin` -> "Hydranten CSV Import" tab
3. Upload `hydranten.csv`
4. Verify: parsing count, coordinate conversion, preview table with status chips
5. Verify: filter buttons work (Alle/Neu/Update)
6. Confirm import (on dev database)
7. Check "Hydrant Clusters" tab -> "Objekte verwalten" -> Hydranten tab shows updated data

**Step 4: Commit any fixes from verification**

```bash
git commit -m "fix: address issues from manual testing of CSV import"
```
