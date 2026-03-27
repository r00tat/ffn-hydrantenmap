# TSV/CSV Import Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the CSV import dialog to support configurable header rows, pre-header metadata as layer names, editable column mapping, and column include/exclude toggles.

**Architecture:** Extend `csvParser.ts` with `headerRow` parameter and `detectHeaderRow` auto-detection. Add `ColumnMapping` type for explicit column assignment. Extend `CsvImport.tsx` dialog with new UI controls that feed into the existing `buildPreview` pipeline.

**Tech Stack:** React 19, MUI, TypeScript, Vitest

---

### Task 1: Add `headerRow` support to csvParser

**Files:**
- Modify: `src/components/firebase/csvParser.ts`
- Create: `src/components/firebase/csvParser.test.ts`

**Step 1: Write failing tests for `detectHeaderRow` and extended `parseCsv`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  detectHeaderRow,
  parseCsv,
} from './csvParser';

const RADIACODE_TSV = [
  'Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC',
  'Timestamp\tTime\tLatitude\tLongitude\tAccuracy\tDoseRate\tCountRate\tComment',
  '134190712898740000\t2026-03-27 07:48:09\t47.9484002\t16.8484409\t9.79\t5.36\t10.6\t ',
  '134190712900590000\t2026-03-27 07:48:10\t47.9484018\t16.8484379\t9.12\t5.36\t10.6\t ',
].join('\n');

const SIMPLE_CSV = [
  'lat,lng,name',
  '47.9,16.8,Punkt 1',
  '47.8,16.7,Punkt 2',
].join('\n');

describe('detectHeaderRow', () => {
  it('returns 0 for a standard CSV where line 1 is the header', () => {
    expect(detectHeaderRow(SIMPLE_CSV, ',')).toBe(0);
  });

  it('returns 1 when line 1 has fewer delimiters than line 2 (RadiaCode TSV)', () => {
    expect(detectHeaderRow(RADIACODE_TSV, '\t')).toBe(1);
  });

  it('returns 0 for empty text', () => {
    expect(detectHeaderRow('', '\t')).toBe(0);
  });

  it('returns 0 for single-line text', () => {
    expect(detectHeaderRow('a\tb\tc', '\t')).toBe(0);
  });
});

describe('parseCsv with headerRow', () => {
  it('uses line 1 as header by default (headerRow=0)', () => {
    const result = parseCsv(SIMPLE_CSV, ',', 0);
    expect(result.headers).toEqual(['lat', 'lng', 'name']);
    expect(result.rows).toHaveLength(2);
    expect(result.preHeaderLines).toEqual([]);
  });

  it('uses line 2 as header when headerRow=1', () => {
    const result = parseCsv(RADIACODE_TSV, '\t', 1);
    expect(result.headers).toEqual([
      'Timestamp', 'Time', 'Latitude', 'Longitude',
      'Accuracy', 'DoseRate', 'CountRate', 'Comment',
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.preHeaderLines).toEqual([
      'Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC',
    ]);
  });

  it('returns empty result when headerRow exceeds line count', () => {
    const result = parseCsv(SIMPLE_CSV, ',', 99);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.preHeaderLines).toHaveLength(3);
  });
});

describe('detectDelimiter', () => {
  it('detects tab as delimiter for RadiaCode TSV', () => {
    expect(detectDelimiter(RADIACODE_TSV)).toBe('\t');
  });

  it('detects comma for simple CSV', () => {
    expect(detectDelimiter(SIMPLE_CSV)).toBe(',');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: FAIL — `detectHeaderRow` not exported, `parseCsv` does not accept 3rd arg

**Step 3: Implement `detectHeaderRow` and extend `parseCsv`**

In `csvParser.ts`:

1. Add `detectHeaderRow(text, delimiter)`:
   - Split text into non-empty lines
   - Count delimiters in each of the first few lines
   - If line 0 has significantly fewer delimiters than line 1 (less than half), return 1
   - Otherwise return 0

2. Extend `parseCsv(text, delimiter, headerRow = 0)`:
   - Return type gains `preHeaderLines: string[]`
   - Lines before `headerRow` go into `preHeaderLines`
   - Line at `headerRow` becomes headers
   - Lines after `headerRow` become rows

3. Update `detectDelimiter`:
   - Check first 3 non-empty lines, pick the one with the most delimiters for counting

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add headerRow support and detectHeaderRow to csvParser
```

---

### Task 2: Add column mapping overrides to csvParser

**Files:**
- Modify: `src/components/firebase/csvParser.ts`
- Modify: `src/components/firebase/csvParser.test.ts`

**Step 1: Write failing tests for `csvToRecords` with column mapping overrides**

Add to `csvParser.test.ts`:

```typescript
import { csvToRecords, parseCsv, ColumnMapping } from './csvParser';

describe('csvToRecords with column mapping', () => {
  const TSV_HEADERS = ['Timestamp', 'Time', 'Latitude', 'Longitude', 'Accuracy', 'DoseRate', 'CountRate', 'Comment'];
  const TSV_ROWS = [
    ['134190712898740000', '2026-03-27 07:48:09', '47.9484002', '16.8484409', '9.79', '5.36', '10.6', ' '],
  ];

  it('uses auto-detect when no mapping is provided', () => {
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS);
    expect(result.latIndex).toBe(2); // Latitude
    expect(result.lngIndex).toBe(3); // Longitude
  });

  it('uses explicit mapping when provided', () => {
    const mapping: ColumnMapping = {
      latColumn: 2,
      lngColumn: 3,
      nameColumn: -1,
      timestampColumn: 1, // Time column
    };
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS, mapping);
    expect(result.latIndex).toBe(2);
    expect(result.lngIndex).toBe(3);
    expect(result.nameIndex).toBe(-1);
    expect(result.timestampIndex).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it('respects excludedColumns and omits them from records', () => {
    const mapping: ColumnMapping = {
      latColumn: 2,
      lngColumn: 3,
      nameColumn: -1,
      timestampColumn: 1,
    };
    const excludedColumns = new Set([0, 4, 7]); // Timestamp(raw), Accuracy, Comment
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS, mapping, excludedColumns);
    const record = result.records[0];
    expect(record['Accuracy']).toBeUndefined();
    expect(record['Comment']).toBeUndefined();
    expect(record['Timestamp']).toBeUndefined();
    expect(record['DoseRate']).toBe('5.36');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: FAIL — `ColumnMapping` not exported, `csvToRecords` does not accept 3rd/4th args

**Step 3: Implement column mapping**

In `csvParser.ts`:

1. Export `ColumnMapping` interface:
   ```typescript
   export interface ColumnMapping {
     latColumn: number;
     lngColumn: number;
     nameColumn: number;
     timestampColumn: number;
   }
   ```

2. Extend `csvToRecords(headers, rows, mapping?, excludedColumns?)`:
   - If `mapping` provided, use its indices instead of auto-detect
   - If `excludedColumns` set provided, skip those column indices when building records

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add ColumnMapping support to csvToRecords
```

---

### Task 3: Extract `parsePreHeaderMetadata` utility

**Files:**
- Modify: `src/components/firebase/csvParser.ts`
- Modify: `src/components/firebase/csvParser.test.ts`

**Step 1: Write failing test**

```typescript
import { parsePreHeaderMetadata } from './csvParser';

describe('parsePreHeaderMetadata', () => {
  it('extracts a layer name from RadiaCode pre-header', () => {
    const lines = ['Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC'];
    const result = parsePreHeaderMetadata(lines, '\t');
    expect(result.suggestedName).toBe('Tritolwerk');
  });

  it('uses first field when no recognizable name found', () => {
    const lines = ['Some metadata line'];
    const result = parsePreHeaderMetadata(lines, '\t');
    expect(result.suggestedName).toBe('Some metadata line');
  });

  it('returns empty string for empty pre-header', () => {
    const result = parsePreHeaderMetadata([], '\t');
    expect(result.suggestedName).toBe('');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: FAIL

**Step 3: Implement `parsePreHeaderMetadata`**

In `csvParser.ts`:
- Split first pre-header line by delimiter
- Pick the third field if it looks like a name (non-numeric, length > 1), or fall back to first field
- Return `{ suggestedName: string }`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add parsePreHeaderMetadata for pre-header layer names
```

---

### Task 4: Extend CsvImport dialog with header row selector

**Files:**
- Modify: `src/components/firebase/CsvImport.tsx`

**Step 1: Add `headerRow` to `CsvPreviewState`**

```typescript
interface CsvPreviewState {
  rawText: string;
  delimiter: Delimiter;
  headerRow: number;           // NEW: 0-based
  preHeaderLines: string[];    // NEW
  result: CsvParseResult;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  fileName: string;
}
```

**Step 2: Update `buildPreview` to accept and pass `headerRow`**

```typescript
function buildPreview(
  rawText: string,
  delimiter: Delimiter,
  fileName: string,
  headerRow: number
): CsvPreviewState {
  const { headers, rows, preHeaderLines } = parseCsv(rawText, delimiter, headerRow);
  const result = csvToRecords(headers, rows);
  const excludeKeys = buildExcludeKeys(result);
  const { schema, headerToSchemaKey } = generateSchemaFromRecords(
    result.records, excludeKeys, result.headers
  );
  return { rawText, delimiter, headerRow, preHeaderLines, result, schema, headerToSchemaKey, fileName };
}
```

**Step 3: Update `handleFileSelect` to auto-detect header row**

```typescript
const handleFileSelect = useCallback(async (files: FileList) => {
  if (!files || files.length === 0) return;
  const file = files[0];
  const rawText = await readFileAsText(file);
  const delimiter = detectDelimiter(rawText);
  const headerRow = detectHeaderRow(rawText, delimiter);
  setEveryNth(1);
  setPreview(buildPreview(rawText, delimiter, file.name, headerRow));
}, []);
```

**Step 4: Add header row change handler**

```typescript
const handleHeaderRowChange = useCallback(
  (newHeaderRow: number) => {
    if (!preview) return;
    setEveryNth(1);
    setPreview(buildPreview(preview.rawText, preview.delimiter, preview.fileName, newHeaderRow));
  },
  [preview]
);
```

**Step 5: Update delimiter change to preserve header row**

Update `handleDelimiterChange` to pass `preview.headerRow`.

**Step 6: Add Header-Zeile TextField to dialog**

After Trennzeichen dropdown, add:

```tsx
<TextField
  label="Header-Zeile"
  size="small"
  select
  value={preview.headerRow}
  onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
  fullWidth
>
  {Array.from(
    { length: Math.min(preview.rawText.split('\n').filter(l => l.trim()).length, 10) },
    (_, i) => (
      <MenuItem key={i} value={i}>
        Zeile {i + 1}
      </MenuItem>
    )
  )}
</TextField>
```

**Step 7: Add pre-header metadata display**

After the Header-Zeile field, add conditionally rendered metadata section when `preHeaderLines.length > 0`. Include a checkbox to use suggested name as layer name. Store `useMetadataName` and `metadataName` in component state.

**Step 8: Update `handleImport` to use metadata name**

If metadata name toggle is active, use parsed name instead of file name for layer name.

**Step 9: Commit**

```
feat: add header row selector and metadata display to CsvImport
```

---

### Task 5: Add column mapping editor to CsvImport dialog

**Files:**
- Modify: `src/components/firebase/CsvImport.tsx`

**Step 1: Add `ColumnMapping` and `excludedColumns` to `CsvPreviewState`**

```typescript
interface CsvPreviewState {
  // ... existing fields
  columnMapping: ColumnMapping;
  excludedColumns: Set<number>;
}
```

**Step 2: Create `ColumnMappingEditor` inline component**

Renders:
- 4 `TextField select` dropdowns (Latitude, Longitude, Name, Zeitstempel)
- Each shows all headers as options + "— nicht zugewiesen —" (value: -1)
- Values come from `columnMapping` state
- On change: update mapping, rebuild preview with new mapping

**Step 3: Create extra columns checkbox list**

Below the mapping dropdowns, render checkboxes for each column NOT assigned to a mapping field:
- Label = column header name
- Checked = not in `excludedColumns`
- On toggle: update `excludedColumns`, rebuild preview

**Step 4: Wire `buildPreview` to use mapping and excluded columns**

Pass `columnMapping` and `excludedColumns` through to `csvToRecords` and `buildExcludeKeys`.

**Step 5: Initialize mapping from auto-detection on first load and on header row / delimiter change**

```typescript
function buildInitialMapping(result: CsvParseResult): ColumnMapping {
  return {
    latColumn: result.latIndex,
    lngColumn: result.lngIndex,
    nameColumn: result.nameIndex,
    timestampColumn: result.timestampIndex,
  };
}
```

**Step 6: Commit**

```
feat: add column mapping editor and column exclusion to CsvImport
```

---

### Task 6: Update `buildExcludeKeys` and `handleImport` for new mapping

**Files:**
- Modify: `src/components/firebase/CsvImport.tsx`

**Step 1: Update `buildExcludeKeys` to use `ColumnMapping`**

Instead of reading indices from `result`, read from the explicit `ColumnMapping`.

**Step 2: Update `handleImport` to pass mapping to `csvRecordsToItems`**

The `csvRecordsToItems` function already uses `result.latIndex` etc. — ensure these reflect the user's mapping, not just auto-detect. The simplest approach: override `result` indices with the mapping before passing to `csvRecordsToItems`.

**Step 3: Update schema generation to exclude mapped + excluded columns**

Ensure `generateSchemaFromRecords` receives the correct `excludeKeys` that includes both mapped columns (lat/lng/name/timestamp) and user-excluded columns.

**Step 4: Commit**

```
feat: wire column mapping through import pipeline
```

---

### Task 7: Integration test with RadiaCode sample

**Files:**
- Modify: `src/components/firebase/csvParser.test.ts`

**Step 1: Write end-to-end parsing test with full RadiaCode sample**

```typescript
describe('RadiaCode TSV end-to-end', () => {
  const FULL_SAMPLE = `Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC
Timestamp\tTime\tLatitude\tLongitude\tAccuracy\tDoseRate\tCountRate\tComment
134190712898740000\t2026-03-27 07:48:09\t47.9484002\t16.8484409\t9.79\t5.36\t10.6\t
134190712900590000\t2026-03-27 07:48:10\t47.9484018\t16.8484379\t9.12\t5.36\t10.6\t `;

  it('correctly parses full RadiaCode TSV with headerRow=1', () => {
    const delimiter = detectDelimiter(FULL_SAMPLE);
    expect(delimiter).toBe('\t');

    const headerRow = detectHeaderRow(FULL_SAMPLE, delimiter);
    expect(headerRow).toBe(1);

    const { headers, rows, preHeaderLines } = parseCsv(FULL_SAMPLE, delimiter, headerRow);
    expect(headers).toContain('Latitude');
    expect(headers).toContain('Longitude');
    expect(preHeaderLines).toHaveLength(1);
    expect(rows).toHaveLength(2);

    const result = csvToRecords(headers, rows);
    expect(result.latIndex).toBe(2);
    expect(result.lngIndex).toBe(3);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]['Latitude']).toBe('47.9484002');

    const metadata = parsePreHeaderMetadata(preHeaderLines, delimiter);
    expect(metadata.suggestedName).toBe('Tritolwerk');
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run src/components/firebase/csvParser.test.ts`
Expected: PASS

**Step 3: Commit**

```
test: add RadiaCode TSV end-to-end integration test
```

---

### Task 8: Final verification

**Step 1: Run full check**

Run: `npm run check`
Expected: tsc, lint, tests, build all pass

**Step 2: Commit any fixes if needed**

**Step 3: Final commit with design doc**

```
docs: add TSV import enhancement design and plan
```
