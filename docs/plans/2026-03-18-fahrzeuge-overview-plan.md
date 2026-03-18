# Fahrzeuge Overview & Tactical Units Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `tacticalUnit` FirecallItem type and rework the Fahrzeuge page with a summary table showing total personnel/ATS strength.

**Architecture:** New `TacticalUnit` Firestore interface + `FirecallTacticalUnit` class following the existing `FirecallVehicle` pattern. Fahrzeuge page gets a flat MUI Table above the existing layer-grouped card view. Icons reuse existing taktische Zeichen PNGs.

**Tech Stack:** React 19, TypeScript, MUI, Leaflet, Firestore, Vitest

---

### Task 1: TacticalUnit Firestore Interface

**Files:**
- Modify: `src/components/firebase/firestore.ts` (after `Fzg` interface, ~line 142)

**Step 1: Add the TacticalUnit interface**

Add after the `Fzg` interface (line 142):

```typescript
export const TACTICAL_UNIT_TYPES = [
  'einheit', 'trupp', 'gruppe', 'zug',
  'bereitschaft', 'abschnitt', 'bezirk', 'lfv', 'oebfv',
] as const;

export type TacticalUnitType = (typeof TACTICAL_UNIT_TYPES)[number];

export const TACTICAL_UNIT_LABELS: Record<TacticalUnitType, string> = {
  einheit: 'Einheit',
  trupp: 'Trupp',
  gruppe: 'Gruppe',
  zug: 'Zug',
  bereitschaft: 'Bereitschaft',
  abschnitt: 'Abschnitt',
  bezirk: 'Bezirk',
  lfv: 'LFV',
  oebfv: 'ÖBFV',
};

export interface TacticalUnit extends FirecallItem {
  type: 'tacticalUnit';
  unitType?: TacticalUnitType;
  fw?: string;
  mann?: number;
  fuehrung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
}
```

**Step 2: Commit**

```
feat: add TacticalUnit Firestore interface
```

---

### Task 2: FirecallTacticalUnit Class

**Files:**
- Create: `src/components/FirecallItems/elements/FirecallTacticalUnit.tsx`
- Modify: `src/components/FirecallItems/elements/index.tsx` (register new class)

**Step 1: Write the failing test**

Create `src/components/FirecallItems/elements/FirecallTacticalUnit.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({ default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })) }));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../../../components/firebase/firebase', () => ({
  firestore: {},
}));
vi.mock('../../../components/firebase/firestore', async () => {
  const actual = await vi.importActual('../../../components/firebase/firestore');
  return {
    ...actual,
    FIRECALL_ITEMS_COLLECTION_ID: 'item',
  };
});
vi.mock('../../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { FirecallTacticalUnit } from './FirecallTacticalUnit';

describe('FirecallTacticalUnit', () => {
  it('sets type to tacticalUnit', () => {
    const unit = new FirecallTacticalUnit();
    expect(unit.type).toBe('tacticalUnit');
  });

  it('initializes from TacticalUnit data', () => {
    const unit = new FirecallTacticalUnit({
      name: '1. Gruppe',
      type: 'tacticalUnit',
      unitType: 'gruppe',
      fw: 'FF Neusiedl',
      mann: 8,
      fuehrung: 'OBI Mustermann',
      ats: 4,
      alarmierung: '2024-01-01T14:30:00',
      eintreffen: '2024-01-01T14:45:00',
      abruecken: '',
    });
    expect(unit.unitType).toBe('gruppe');
    expect(unit.fw).toBe('FF Neusiedl');
    expect(unit.mann).toBe(8);
    expect(unit.fuehrung).toBe('OBI Mustermann');
    expect(unit.ats).toBe(4);
  });

  it('returns correct markerName', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', unitType: 'zug',
    });
    expect(unit.markerName()).toBe('Taktische Einheit');
  });

  it('title includes name and fw', () => {
    const unit = new FirecallTacticalUnit({
      name: '1. Zug', type: 'tacticalUnit', fw: 'FF NaS',
    });
    expect(unit.title()).toBe('1. Zug FF NaS');
  });

  it('info shows mann and ats', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', mann: 8, ats: 4,
    });
    expect(unit.info()).toBe('Stärke: 8 ATS: 4');
  });

  it('data() round-trips all fields', () => {
    const input = {
      name: '1. Gruppe',
      type: 'tacticalUnit' as const,
      unitType: 'gruppe' as const,
      fw: 'FF NaS',
      mann: 8,
      fuehrung: 'OBI Test',
      ats: 4,
      alarmierung: '2024-01-01T14:30:00',
      eintreffen: '2024-01-01T14:45:00',
      abruecken: '',
    };
    const unit = new FirecallTacticalUnit(input);
    const data = unit.data();
    expect(data.unitType).toBe('gruppe');
    expect(data.fw).toBe('FF NaS');
    expect(data.mann).toBe(8);
    expect(data.fuehrung).toBe('OBI Test');
    expect(data.ats).toBe(4);
    expect(data.type).toBe('tacticalUnit');
  });

  it('icon returns correct icon for unitType', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', unitType: 'gruppe',
    });
    const icon = unit.icon();
    expect(icon.options.iconUrl).toContain('Gruppe.png');
  });

  it('selectValues includes unitType options', () => {
    const unit = new FirecallTacticalUnit();
    const sv = unit.selectValues();
    expect(sv.unitType).toBeDefined();
    expect(sv.unitType.gruppe).toBe('Gruppe');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `NO_COLOR=1 npx vitest run src/components/FirecallItems/elements/FirecallTacticalUnit.test.ts`
Expected: FAIL — module not found

**Step 3: Create the FirecallTacticalUnit class**

Create `src/components/FirecallItems/elements/FirecallTacticalUnit.tsx`:

```tsx
import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { formatTimestamp } from '../../../common/time-format';
import {
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
  TacticalUnitType,
} from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import { SimpleMap } from '../../../common/types';

const UNIT_TYPE_ICON_MAP: Record<TacticalUnitType, string> = {
  einheit: '/icons/taktische_zeichen/Formation_von_Kraeften/Einheit.png',
  trupp: '/icons/taktische_zeichen/Formation_von_Kraeften/Trupp.png',
  gruppe: '/icons/taktische_zeichen/Formation_von_Kraeften/Gruppe.png',
  zug: '/icons/taktische_zeichen/Formation_von_Kraeften/Zug.png',
  bereitschaft: '/icons/taktische_zeichen/Formation_von_Kraeften/Bereitschaft.png',
  abschnitt: '/icons/taktische_zeichen/Formation_von_Kraeften/Abschnitt.png',
  bezirk: '/icons/taktische_zeichen/Formation_von_Kraeften/Bezirk.png',
  lfv: '/icons/taktische_zeichen/Formation_von_Kraeften/LFV.png',
  oebfv: '/icons/taktische_zeichen/Formation_von_Kraeften/OEBFV.png',
};

export class FirecallTacticalUnit extends FirecallItemBase {
  unitType?: TacticalUnitType;
  fw?: string;
  mann?: number;
  fuehrung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;

  public constructor(firecallItem?: TacticalUnit) {
    super(firecallItem);
    this.type = 'tacticalUnit';
    if (firecallItem) {
      ({
        unitType: this.unitType,
        fw: this.fw,
        mann: this.mann,
        fuehrung: this.fuehrung,
        ats: this.ats,
        alarmierung: this.alarmierung,
        eintreffen: this.eintreffen,
        abruecken: this.abruecken,
      } = firecallItem);
    }
  }

  public copy(): FirecallTacticalUnit {
    return Object.assign(new FirecallTacticalUnit(this.data()), this);
  }

  public markerName() {
    return 'Taktische Einheit';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Bezeichnung',
      unitType: 'Art der Einheit',
      fw: 'Feuerwehr',
      mann: 'Mannschaftsstärke',
      fuehrung: 'Einheitsführer',
      ats: 'ATS Träger',
      beschreibung: 'Beschreibung',
      alarmierung: 'Alarmierung',
      eintreffen: 'Eintreffen',
      abruecken: 'Abrücken',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      unitType: 'select',
      mann: 'number',
      ats: 'number',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      unitType: TACTICAL_UNIT_LABELS as unknown as SelectOptions,
    };
  }

  public data(): TacticalUnit {
    return {
      ...super.data(),
      unitType: this.unitType,
      fw: this.fw,
      mann: this.mann,
      fuehrung: this.fuehrung,
      ats: this.ats,
      alarmierung: this.alarmierung,
      eintreffen: this.eintreffen,
      abruecken: this.abruecken,
    } as TacticalUnit;
  }

  public title(): string {
    return `${this.name} ${this.fw || ''}`.trim();
  }

  public info(): string {
    return `Stärke: ${this.mann || 0} ATS: ${this.ats || 0}`;
  }

  public body(): ReactNode {
    return (
      <>
        {this.unitType && (
          <>
            Art: {TACTICAL_UNIT_LABELS[this.unitType]}
            <br />
          </>
        )}
        {this.fuehrung && (
          <>
            Führung: {this.fuehrung}
            <br />
          </>
        )}
        {super.body()}
        {this.alarmierung && (
          <>
            Alarmierung: {formatTimestamp(this.alarmierung)}
            <br />
          </>
        )}
        {this.eintreffen && (
          <>
            Eintreffen: {formatTimestamp(this.eintreffen)}
            <br />
          </>
        )}
        {this.abruecken && (
          <>
            Abrücken: {formatTimestamp(this.abruecken)}
            <br />
          </>
        )}
      </>
    );
  }

  public dialogText(): ReactNode {
    return <>Taktische Einheit</>;
  }

  public dateFields(): string[] {
    return [...super.dateFields(), 'alarmierung', 'eintreffen', 'abruecken'];
  }

  public titleFn(): string {
    return `${this.unitType ? TACTICAL_UNIT_LABELS[this.unitType] + ' ' : ''}${this.name} ${this.fw || ''}`;
  }

  public icon(): Icon<IconOptions> {
    const iconUrl = this.unitType
      ? UNIT_TYPE_ICON_MAP[this.unitType]
      : UNIT_TYPE_ICON_MAP.einheit;
    return L.icon({
      iconUrl,
      iconSize: [24, 24],
    });
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.unitType ? TACTICAL_UNIT_LABELS[this.unitType] + ' ' : ''}
          {this.name} {this.fw || ''}
        </b>
        {this.fuehrung && (
          <>
            <br />
            Führung: {this.fuehrung}
          </>
        )}
        {this.mann !== undefined && this.mann > 0 && (
          <>
            <br />
            Stärke: {this.mann}
          </>
        )}
        {this.ats !== undefined && this.ats > 0 && (
          <>
            {' '}({this.ats} ATS)
          </>
        )}
        {this.alarmierung && (
          <>
            <br />
            Alarmierung: {formatTimestamp(this.alarmierung)}
          </>
        )}
        {this.eintreffen && (
          <>
            <br />
            Eintreffen: {formatTimestamp(this.eintreffen)}
          </>
        )}
        {this.abruecken && (
          <>
            <br />
            Abrücken: {formatTimestamp(this.abruecken)}
          </>
        )}
      </>
    );
  }

  public static factory(): FirecallItemBase {
    return new FirecallTacticalUnit();
  }
}
```

**Step 4: Register in `fcItemClasses`**

In `src/components/FirecallItems/elements/index.tsx`:
- Add import: `import { FirecallTacticalUnit } from './FirecallTacticalUnit';`
- Add to `fcItemClasses`: `tacticalUnit: FirecallTacticalUnit,`

**Step 5: Run test to verify it passes**

Run: `NO_COLOR=1 npx vitest run src/components/FirecallItems/elements/FirecallTacticalUnit.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```
feat: add FirecallTacticalUnit class and register in item factory
```

---

### Task 3: Strength Calculation Utility

**Files:**
- Create: `src/components/pages/fahrzeuge-utils.ts`

**Step 1: Write the failing test**

Create `src/components/pages/fahrzeuge-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateStrength } from './fahrzeuge-utils';
import { FirecallItem } from '../firebase/firestore';

describe('calculateStrength', () => {
  it('calculates vehicle strength as besatzung + 1', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6);
    expect(result.totalAts).toBe(2);
    expect(result.totalUnits).toBe(1);
  });

  it('calculates tactical unit strength from mann field', () => {
    const items: FirecallItem[] = [
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8, ats: 4 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(8);
    expect(result.totalAts).toBe(4);
    expect(result.totalUnits).toBe(1);
  });

  it('sums across vehicles and tactical units', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
      { name: 'KLF', type: 'vehicle', besatzung: '3', ats: 0 } as any,
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8, ats: 4 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6 + 4 + 8); // 18
    expect(result.totalAts).toBe(2 + 0 + 4);  // 6
    expect(result.totalUnits).toBe(3);
  });

  it('handles vehicle with no besatzung as 1 person', () => {
    const items: FirecallItem[] = [
      { name: 'Drohne', type: 'vehicle' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(1);
    expect(result.totalAts).toBe(0);
  });

  it('ignores non-vehicle non-tacticalUnit items', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
      { name: 'Marker', type: 'marker' } as any,
      { name: 'Rohr', type: 'rohr' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6);
    expect(result.totalUnits).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const result = calculateStrength([]);
    expect(result.totalMann).toBe(0);
    expect(result.totalAts).toBe(0);
    expect(result.totalUnits).toBe(0);
  });

  it('returns per-item strength data', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2, fw: 'FF NaS' } as any,
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8, ats: 4, fw: 'FF NaS', unitType: 'gruppe' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      name: 'TLF',
      fw: 'FF NaS',
      typ: 'Fahrzeug',
      mann: 6,
      ats: 2,
      alarmierung: undefined,
      eintreffen: undefined,
      abruecken: undefined,
    });
    expect(result.rows[1]).toEqual({
      name: '1. Gruppe',
      fw: 'FF NaS',
      typ: 'Gruppe',
      mann: 8,
      ats: 4,
      alarmierung: undefined,
      eintreffen: undefined,
      abruecken: undefined,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `NO_COLOR=1 npx vitest run src/components/pages/fahrzeuge-utils.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the utility**

Create `src/components/pages/fahrzeuge-utils.ts`:

```typescript
import { FirecallItem, Fzg, TacticalUnit, TACTICAL_UNIT_LABELS } from '../firebase/firestore';

export interface StrengthRow {
  name: string;
  fw?: string;
  typ: string;
  mann: number;
  ats: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
}

export interface StrengthSummary {
  totalMann: number;
  totalAts: number;
  totalUnits: number;
  rows: StrengthRow[];
}

export function calculateStrength(items: FirecallItem[]): StrengthSummary {
  const rows: StrengthRow[] = [];

  for (const item of items) {
    if (item.type === 'vehicle') {
      const v = item as Fzg;
      const besatzung = v.besatzung ? Number.parseInt(v.besatzung, 10) : 0;
      rows.push({
        name: v.name,
        fw: v.fw,
        typ: 'Fahrzeug',
        mann: besatzung + 1,
        ats: v.ats || 0,
        alarmierung: v.alarmierung,
        eintreffen: v.eintreffen,
        abruecken: v.abruecken,
      });
    } else if (item.type === 'tacticalUnit') {
      const u = item as TacticalUnit;
      rows.push({
        name: u.name,
        fw: u.fw,
        typ: u.unitType ? TACTICAL_UNIT_LABELS[u.unitType] : 'Einheit',
        mann: u.mann || 0,
        ats: u.ats || 0,
        alarmierung: u.alarmierung,
        eintreffen: u.eintreffen,
        abruecken: u.abruecken,
      });
    }
  }

  return {
    totalMann: rows.reduce((sum, r) => sum + r.mann, 0),
    totalAts: rows.reduce((sum, r) => sum + r.ats, 0),
    totalUnits: rows.length,
    rows,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `NO_COLOR=1 npx vitest run src/components/pages/fahrzeuge-utils.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
feat: add strength calculation utility for vehicles and tactical units
```

---

### Task 4: Summary Table Component

**Files:**
- Create: `src/components/pages/StrengthTable.tsx`

**Step 1: Create the StrengthTable component**

```tsx
'use client';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { FirecallItem } from '../firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { calculateStrength } from './fahrzeuge-utils';

export default function StrengthTable({ items }: { items: FirecallItem[] }) {
  const { rows, totalMann, totalAts, totalUnits } = useMemo(
    () => calculateStrength(items),
    [items]
  );

  if (rows.length === 0) return null;

  return (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Bezeichnung</TableCell>
            <TableCell>FW</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell align="right">Stärke</TableCell>
            <TableCell align="right">ATS</TableCell>
            <TableCell>Alarmierung</TableCell>
            <TableCell>Eintreffen</TableCell>
            <TableCell>Abrücken</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.fw || ''}</TableCell>
              <TableCell>{row.typ}</TableCell>
              <TableCell align="right">{row.mann}</TableCell>
              <TableCell align="right">{row.ats}</TableCell>
              <TableCell>{row.alarmierung ? formatTimestamp(row.alarmierung) : ''}</TableCell>
              <TableCell>{row.eintreffen ? formatTimestamp(row.eintreffen) : ''}</TableCell>
              <TableCell>{row.abruecken ? formatTimestamp(row.abruecken) : ''}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
            <TableCell>Gesamt</TableCell>
            <TableCell />
            <TableCell>
              <Typography variant="body2" fontWeight="bold">
                {totalUnits} Einheiten
              </Typography>
            </TableCell>
            <TableCell align="right">{totalMann}</TableCell>
            <TableCell align="right">{totalAts}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

**Step 2: Commit**

```
feat: add StrengthTable component for personnel summary
```

---

### Task 5: Integrate into Fahrzeuge Page

**Files:**
- Modify: `src/components/pages/Fahrzeuge.tsx`

**Step 1: Add import and integrate StrengthTable**

In `Fahrzeuge.tsx`:
- Add import: `import StrengthTable from './StrengthTable';`
- In the `Fahrzeuge` component, add `<StrengthTable items={displayItems} />` between the `<Typography variant="h3">` header and the layer group sections.

The updated JSX in `Fahrzeuge()` should look like:

```tsx
return (
  <Box sx={{ p: 2, m: 2 }}>
    <Typography variant="h3" gutterBottom>
      {totalItems} Einsatzmittel ({vehicles.length} Fahrzeuge){' '}
      <DownloadButton
        tooltip="Fahrzeuge als CSV herunterladen"
        onClick={() => downloadVehicles(vehicles)}
      />
    </Typography>

    <StrengthTable items={displayItems} />

    {Object.entries(layers).map(([layerId, layer]) => {
      // ... existing code unchanged
    })}

    {groupedByLayer['default'] && groupedByLayer['default'].length > 0 && (
      // ... existing code unchanged
    )}
  </Box>
);
```

**Step 2: Run build to verify no errors**

Run: `npx next build`
Expected: Build succeeds

**Step 3: Commit**

```
feat: integrate StrengthTable into Fahrzeuge page
```

---

### Task 6: Update CSV Download to Include Tactical Units

**Files:**
- Modify: `src/components/pages/Fahrzeuge.tsx`

**Step 1: Update the download function**

Replace the `downloadVehicles` function to also include tactical units. Update the download button to pass `displayItems` instead of only `vehicles`. Create a new `downloadEinsatzmittel` function that handles both types:

```typescript
function downloadEinsatzmittel(items: FirecallItem[]) {
  const { rows } = calculateStrength(items);
  downloadRowsAsCsv(
    [
      ['Bezeichnung', 'Feuerwehr', 'Typ', 'Stärke', 'ATS', 'Beschreibung', 'Alarmierung', 'Eintreffen', 'Abrücken'],
      ...rows.map((r) => {
        const item = items.find((i) => i.name === r.name);
        return [
          r.name,
          r.fw,
          r.typ,
          r.mann,
          r.ats,
          item?.beschreibung || '',
          r.alarmierung ? formatTimestamp(r.alarmierung) : '',
          r.eintreffen ? formatTimestamp(r.eintreffen) : '',
          r.abruecken ? formatTimestamp(r.abruecken) : '',
        ];
      }),
    ],
    'Einsatzmittel.csv',
  );
}
```

Update the `<DownloadButton>` to call `downloadEinsatzmittel(displayItems)`.

Add import for `calculateStrength` from `'./fahrzeuge-utils'`.

**Step 2: Commit**

```
feat: update CSV download to include tactical units
```

---

### Task 7: Update useVehicles Hook

**Files:**
- Modify: `src/hooks/useVehicles.ts`

**Step 1: Add tacticalUnits to the hook return**

Add a `tacticalUnits` memo similar to `vehicles`:

```typescript
const tacticalUnits = useMemo(
  () =>
    (firecallItems?.filter((item) => item?.type === 'tacticalUnit') || []) as TacticalUnit[],
  [firecallItems]
);
```

Add `TacticalUnit` to the import from `firestore`.

Return `tacticalUnits` alongside existing values:

```typescript
return {
  vehicles,
  tacticalUnits,
  rohre,
  otherItems,
  displayItems,
  firecallItems,
};
```

**Step 2: Commit**

```
feat: expose tacticalUnits from useVehicles hook
```

---

### Task 8: Final Integration Test

**Step 1: Run full test suite**

Run: `NO_COLOR=1 npm run test`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit (if any lint/build fixes needed)**

```
fix: address lint/build issues
```
