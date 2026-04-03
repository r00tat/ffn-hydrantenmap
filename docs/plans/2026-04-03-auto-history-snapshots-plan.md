# Auto History Snapshots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatisch History-Snapshots erstellen wenn sich FirecallItems ändern, mit konfigurierbarem Intervall pro Einsatz und Multi-Client-Deduplizierung.

**Architecture:** Neuer `useAutoSnapshot`-Hook im MapEditorProvider. Lauscht auf FirecallItems-Änderungen via `useFirebaseCollection`, nutzt einen Timer basierend auf dem konfigurierten Intervall, und prüft den neuesten History-Eintrag zur Deduplizierung. UI-Konfiguration im HistoryDialog und EinsatzDialog.

**Tech Stack:** React hooks, Firebase Firestore (onSnapshot, setDoc), MUI Select

---

### Task 1: Firecall-Interface erweitern

**Files:**
- Modify: `src/components/firebase/firestore.ts:263-276`

**Step 1: Add `autoSnapshotInterval` to Firecall interface**

In `src/components/firebase/firestore.ts`, add field to the `Firecall` interface before the index signature:

```typescript
export interface Firecall {
  id?: string;
  name: string;
  fw?: string;
  date?: string;
  description?: string;
  deleted?: boolean;
  eintreffen?: string;
  abruecken?: string;
  lat?: number;
  lng?: number;
  group?: string;
  autoSnapshotInterval?: number; // Minutes, 0 = disabled, default 5
  [key: string]: any;
}
```

**Step 2: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add autoSnapshotInterval to Firecall interface"
```

---

### Task 2: useAutoSnapshot Hook — Tests

**Files:**
- Create: `src/hooks/firecallHistory/useAutoSnapshot.ts`
- Create: `src/hooks/firecallHistory/useAutoSnapshot.test.ts`

**Step 1: Write tests for useAutoSnapshot**

Create `src/hooks/firecallHistory/useAutoSnapshot.test.ts`. The hook needs these behaviors:

1. Does NOT save snapshot on initial load (no changes yet)
2. Saves snapshot when changes detected AND interval elapsed since last history entry
3. Does NOT save when changes detected but interval NOT elapsed
4. Does NOT save when interval elapsed but NO changes detected
5. Does NOT run when `autoSnapshotInterval` is `0` (disabled)
6. Does NOT run when `historyModeActive` is `true`
7. Uses default interval of 5 minutes when `autoSnapshotInterval` is `undefined`

Test the core logic as a pure function `shouldCreateSnapshot`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldCreateSnapshot } from './useAutoSnapshot';

describe('shouldCreateSnapshot', () => {
  const now = new Date('2026-04-03T12:10:00Z').getTime();

  it('returns false when no changes detected', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: false,
        lastSnapshotTime: new Date('2026-04-03T12:00:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(false);
  });

  it('returns false when interval has not elapsed', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:08:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(false);
  });

  it('returns true when changes detected and interval elapsed', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:04:00Z').toISOString(),
        intervalMinutes: 5,
        now,
      })
    ).toBe(true);
  });

  it('returns true when changes detected and no previous snapshot exists', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: undefined,
        intervalMinutes: 5,
        now,
      })
    ).toBe(true);
  });

  it('returns false when interval is 0 (disabled)', () => {
    expect(
      shouldCreateSnapshot({
        changesDetected: true,
        lastSnapshotTime: new Date('2026-04-03T12:00:00Z').toISOString(),
        intervalMinutes: 0,
        now,
      })
    ).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/hooks/firecallHistory/useAutoSnapshot.test.ts`
Expected: FAIL — `shouldCreateSnapshot` not found

**Step 3: Implement `shouldCreateSnapshot` and hook skeleton**

Create `src/hooks/firecallHistory/useAutoSnapshot.ts`:

```typescript
import { useCallback, useEffect, useRef } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirecall from '../useFirecall';
import useMapEditor from '../useMapEditor';
import { useSaveHistory } from './useSaveHistory';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterActiveItems,
} from '../../components/firebase/firestore';
import useFirebaseCollection from '../useFirebaseCollection';
import { useFirecallId } from '../useFirecall';

const DEFAULT_INTERVAL_MINUTES = 5;

export interface ShouldCreateSnapshotParams {
  changesDetected: boolean;
  lastSnapshotTime: string | undefined;
  intervalMinutes: number;
  now: number;
}

export function shouldCreateSnapshot({
  changesDetected,
  lastSnapshotTime,
  intervalMinutes,
  now,
}: ShouldCreateSnapshotParams): boolean {
  if (intervalMinutes <= 0) return false;
  if (!changesDetected) return false;

  if (!lastSnapshotTime) return true;

  const elapsed = now - new Date(lastSnapshotTime).getTime();
  return elapsed >= intervalMinutes * 60 * 1000;
}

export default function useAutoSnapshot() {
  const firecall = useFirecall();
  const firecallId = useFirecallId();
  const { history, historyModeActive, historyPathSegments } = useMapEditor();
  const { saveHistory, saveInProgress } = useSaveHistory();

  const changesDetectedRef = useRef(false);
  const initialLoadRef = useRef(true);

  const intervalMinutes =
    firecall.autoSnapshotInterval ?? DEFAULT_INTERVAL_MINUTES;

  // Listen to firecall items to detect changes
  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterActiveItems,
  });

  // Track changes — skip initial load
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    changesDetectedRef.current = true;
  }, [firecallItems]);

  // Timer to check and create snapshots
  const checkAndSave = useCallback(async () => {
    if (historyModeActive || saveInProgress) return;

    const lastSnapshotTime = history.length > 0 ? history[0].createdAt : undefined;

    if (
      shouldCreateSnapshot({
        changesDetected: changesDetectedRef.current,
        lastSnapshotTime,
        intervalMinutes,
        now: Date.now(),
      })
    ) {
      changesDetectedRef.current = false;
      const timestamp = formatTimestamp(new Date());
      await saveHistory(`Auto-Snapshot ${timestamp}`);
    }
  }, [history, historyModeActive, intervalMinutes, saveHistory, saveInProgress]);

  useEffect(() => {
    if (intervalMinutes <= 0 || historyModeActive) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(checkAndSave, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMinutes, historyModeActive, checkAndSave]);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/hooks/firecallHistory/useAutoSnapshot.test.ts`
Expected: PASS — all 5 tests green

**Step 5: Commit**

```bash
git add src/hooks/firecallHistory/useAutoSnapshot.ts src/hooks/firecallHistory/useAutoSnapshot.test.ts
git commit -m "feat: useAutoSnapshot hook with change detection and deduplication"
```

---

### Task 3: Integrate useAutoSnapshot in MapEditorProvider

**Files:**
- Modify: `src/components/providers/MapEditorProvider.tsx`

**Step 1: Add useAutoSnapshot call**

In `src/components/providers/MapEditorProvider.tsx`, import and call the hook inside `useMapEditorProvider()`:

```typescript
import useAutoSnapshot from '../../hooks/firecallHistory/useAutoSnapshot';
```

Add at the end of `useMapEditorProvider()`, before `return options`:

```typescript
useAutoSnapshot();
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/providers/MapEditorProvider.tsx
git commit -m "feat: integrate useAutoSnapshot in MapEditorProvider"
```

---

### Task 4: Auto-Snapshot Intervall Select-Komponente

**Files:**
- Create: `src/components/inputs/AutoSnapshotIntervalSelect.tsx`
- Create: `src/components/inputs/AutoSnapshotIntervalSelect.test.tsx`

**Step 1: Write test**

Create `src/components/inputs/AutoSnapshotIntervalSelect.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutoSnapshotIntervalSelect from './AutoSnapshotIntervalSelect';

describe('AutoSnapshotIntervalSelect', () => {
  it('renders with default value', () => {
    render(<AutoSnapshotIntervalSelect value={undefined} onChange={vi.fn()} />);
    // Default is 5 min — the select should show "5 Minuten"
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders with disabled value', () => {
    render(<AutoSnapshotIntervalSelect value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/inputs/AutoSnapshotIntervalSelect.test.tsx`
Expected: FAIL

**Step 3: Implement component**

Create `src/components/inputs/AutoSnapshotIntervalSelect.tsx`:

```typescript
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';

const INTERVAL_OPTIONS = [
  { value: 0, label: 'Aus' },
  { value: 1, label: '1 Minute' },
  { value: 5, label: '5 Minuten' },
  { value: 10, label: '10 Minuten' },
  { value: 15, label: '15 Minuten' },
  { value: 30, label: '30 Minuten' },
];

const DEFAULT_INTERVAL = 5;

interface AutoSnapshotIntervalSelectProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

export default function AutoSnapshotIntervalSelect({
  value,
  onChange,
}: AutoSnapshotIntervalSelectProps) {
  const handleChange = (event: SelectChangeEvent<number>) => {
    onChange(Number(event.target.value));
  };

  return (
    <FormControl fullWidth variant="standard">
      <InputLabel id="auto-snapshot-interval-label">
        Auto-Snapshot Intervall
      </InputLabel>
      <Select
        labelId="auto-snapshot-interval-label"
        id="auto-snapshot-interval"
        value={value ?? DEFAULT_INTERVAL}
        label="Auto-Snapshot Intervall"
        onChange={handleChange}
      >
        {INTERVAL_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/inputs/AutoSnapshotIntervalSelect.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/inputs/AutoSnapshotIntervalSelect.tsx src/components/inputs/AutoSnapshotIntervalSelect.test.tsx
git commit -m "feat: AutoSnapshotIntervalSelect component"
```

---

### Task 5: Add interval config to HistoryDialog

**Files:**
- Modify: `src/components/site/HistoryDialog.tsx`

**Step 1: Add AutoSnapshotIntervalSelect to HistoryDialog**

Import the component and `useFirecall`. Add state and Firestore write:

At the top, add imports:

```typescript
import AutoSnapshotIntervalSelect from '../inputs/AutoSnapshotIntervalSelect';
import useFirecall from '../../hooks/useFirecall';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
```

Inside the component, after `const { saveHistory } = useSaveHistory();`:

```typescript
const firecall = useFirecall();
```

Add the `AutoSnapshotIntervalSelect` in the DialogContent, before the existing `<Select>` for history entries. Add it after the opening `<DialogContent>` and before the history select `<Typography>`:

```tsx
<AutoSnapshotIntervalSelect
  value={firecall.autoSnapshotInterval}
  onChange={async (value) => {
    if (firecall.id) {
      await setDoc(
        doc(firestore, FIRECALL_COLLECTION_ID, firecall.id),
        { autoSnapshotInterval: value },
        { merge: true }
      );
    }
  }}
/>
<hr />
```

**Step 2: Run type check and build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/site/HistoryDialog.tsx
git commit -m "feat: add auto-snapshot interval config to HistoryDialog"
```

---

### Task 6: Add interval config to EinsatzDialog

**Files:**
- Modify: `src/components/FirecallItems/EinsatzDialog.tsx`

**Step 1: Add AutoSnapshotIntervalSelect to EinsatzDialog**

Import the component:

```typescript
import AutoSnapshotIntervalSelect from '../inputs/AutoSnapshotIntervalSelect';
```

Add the select after the "Abrücken" `MyDateTimePicker` (around line 316, after the closing `/>` of the Abrücken picker):

```tsx
<AutoSnapshotIntervalSelect
  value={einsatz.autoSnapshotInterval}
  onChange={(value) => {
    setEinsatz((prev) => ({ ...prev, autoSnapshotInterval: value }));
  }}
/>
```

The value is saved together with the rest of the Einsatz when the user clicks "Hinzufügen" / "Aktualisieren" — no separate Firestore write needed.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/FirecallItems/EinsatzDialog.tsx
git commit -m "feat: add auto-snapshot interval config to EinsatzDialog"
```

---

### Task 7: Full integration test and final check

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run full check**

Run: `npm run check`
Expected: tsc, lint, tests, build all pass

**Step 3: Commit any fixes if needed**

---
