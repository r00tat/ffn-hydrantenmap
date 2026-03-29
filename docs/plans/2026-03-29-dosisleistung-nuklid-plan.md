# Dosisleistungsrechner (Nuklidbasiert) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a calculator that computes dose rate at 1m distance from a radioactive source given its nuclide and activity (and vice versa).

**Architecture:** Nuclide data (gamma constants) and calculation logic in `src/common/strahlenschutz.ts`, UI component in `src/components/pages/Strahlenschutz.tsx`. Follows the same bidirectional pattern as existing calculators (leave one field empty, calculate it). Activity unit conversion (GBq/MBq/TBq/Ci) handled inline.

**Tech Stack:** React 19, MUI, Vitest, TypeScript

---

### Task 1: Nuclide Data and Types

**Files:**
- Modify: `src/common/strahlenschutz.ts` (append after line 315)

**Step 1: Add nuclide data, types, and activity unit conversion**

Add to end of `src/common/strahlenschutz.ts`:

```typescript
/**
 * Dosisleistungsberechnung aus Nuklidaktivität.
 *
 * Formula: H = Gamma × A
 *
 * H     = Ortsdosisleistung in 1m Abstand (µSv/h)
 * Gamma = Dosisleistungskonstante (µSv·m²/(h·GBq))
 * A     = Aktivität (GBq)
 */

export interface Nuclide {
  name: string;
  gamma: number; // µSv·m²/(h·GBq)
}

/** Nuclides sorted by name, with gamma dose rate constants. */
export const NUCLIDES: Nuclide[] = [
  { name: 'Am-241', gamma: 3.1 },
  { name: 'Au-198', gamma: 62 },
  { name: 'Ba-133', gamma: 52 },
  { name: 'Co-57', gamma: 16 },
  { name: 'Co-60', gamma: 351 },
  { name: 'Cr-51', gamma: 5 },
  { name: 'Cs-137', gamma: 92 },
  { name: 'Eu-152', gamma: 168 },
  { name: 'I-125', gamma: 17 },
  { name: 'I-131', gamma: 66 },
  { name: 'Ir-192', gamma: 130 },
  { name: 'Mn-54', gamma: 122 },
  { name: 'Mo-99', gamma: 26 },
  { name: 'Na-22', gamma: 327 },
  { name: 'Ra-226', gamma: 195 },
  { name: 'Se-75', gamma: 56 },
  { name: 'Sr-90', gamma: 6 },
  { name: 'Tc-99m', gamma: 17 },
  { name: 'Zn-65', gamma: 82 },
];

export type ActivityUnit = 'GBq' | 'MBq' | 'TBq' | 'Ci';

export const ACTIVITY_UNITS: ActivityUnit[] = ['GBq', 'MBq', 'TBq', 'Ci'];

/** Convert activity value to GBq. */
const ACTIVITY_TO_GBQ: Record<ActivityUnit, number> = {
  GBq: 1,
  MBq: 0.001,
  TBq: 1000,
  Ci: 37,
};

export function convertActivityToGBq(
  value: number,
  unit: ActivityUnit
): number {
  return value * ACTIVITY_TO_GBQ[unit];
}

export interface DosisleistungNuklidValues {
  activity: number | null;
  doseRate: number | null;
}

export interface DosisleistungNuklidResult {
  field: 'activity' | 'doseRate';
  value: number;
}

export interface DosisleistungNuklidHistoryEntry {
  nuclide: string;
  gamma: number;
  activityGBq: number;
  activityUnit: ActivityUnit;
  activityInUnit: number;
  doseRate: number;
  calculatedField: 'activity' | 'doseRate';
  timestamp: Date;
}

/**
 * Calculate dose rate at 1m from nuclide activity, or activity from dose rate.
 * Exactly one of activity/doseRate must be null.
 * gamma must be positive, the filled value must be positive.
 * Activity is in GBq, doseRate in µSv/h.
 */
export function calculateDosisleistungNuklid(
  gamma: number,
  values: DosisleistungNuklidValues
): DosisleistungNuklidResult | null {
  if (gamma <= 0) return null;

  const { activity, doseRate } = values;
  const nullCount = [activity, doseRate].filter((v) => v === null).length;
  if (nullCount !== 1) return null;

  if (activity === null) {
    // A = H / Gamma
    if (doseRate! <= 0) return null;
    return { field: 'activity', value: doseRate! / gamma };
  } else {
    // H = Gamma × A
    if (activity <= 0) return null;
    return { field: 'doseRate', value: gamma * activity };
  }
}
```

**Step 2: Commit**

```bash
git add src/common/strahlenschutz.ts
git commit -m "feat: add nuclide data and dose rate calculation function"
```

---

### Task 2: Tests for Calculation Logic

**Files:**
- Modify: `src/common/strahlenschutz.test.ts` (append after line 298)

**Step 1: Write tests**

Add to end of `src/common/strahlenschutz.test.ts`:

```typescript
import {
  // ... add to existing imports:
  calculateDosisleistungNuklid,
  convertActivityToGBq,
  NUCLIDES,
  ACTIVITY_UNITS,
} from './strahlenschutz';
```

Then append test suites:

```typescript
describe('convertActivityToGBq', () => {
  it('converts GBq to GBq (identity)', () => {
    expect(convertActivityToGBq(5, 'GBq')).toBe(5);
  });

  it('converts MBq to GBq', () => {
    expect(convertActivityToGBq(1000, 'MBq')).toBe(1);
  });

  it('converts TBq to GBq', () => {
    expect(convertActivityToGBq(1, 'TBq')).toBe(1000);
  });

  it('converts Ci to GBq', () => {
    expect(convertActivityToGBq(1, 'Ci')).toBe(37);
  });
});

describe('NUCLIDES', () => {
  it('contains expected nuclides', () => {
    const names = NUCLIDES.map((n) => n.name);
    expect(names).toContain('Co-60');
    expect(names).toContain('Cs-137');
    expect(names).toContain('Ir-192');
    expect(names).toContain('Am-241');
    expect(names).toContain('Sr-90');
  });

  it('is sorted alphabetically by name', () => {
    const names = NUCLIDES.map((n) => n.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('all gamma values are positive', () => {
    NUCLIDES.forEach((n) => {
      expect(n.gamma).toBeGreaterThan(0);
    });
  });
});

describe('calculateDosisleistungNuklid', () => {
  // Co-60: gamma=351, A=1 GBq → H = 351 µSv/h
  it('calculates dose rate from activity', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toEqual({ field: 'doseRate', value: 351 });
  });

  // Co-60: gamma=351, H=351 µSv/h → A = 1 GBq
  it('calculates activity from dose rate', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: 351,
    });
    expect(result).toEqual({ field: 'activity', value: 1 });
  });

  // Cs-137: gamma=92, A=0.5 GBq → H = 46 µSv/h
  it('handles fractional activity', () => {
    const result = calculateDosisleistungNuklid(92, {
      activity: 0.5,
      doseRate: null,
    });
    expect(result).toEqual({ field: 'doseRate', value: 46 });
  });

  it('returns null when both fields are null', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when no field is null', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 1,
      doseRate: 351,
    });
    expect(result).toBeNull();
  });

  it('returns null when gamma is zero', () => {
    const result = calculateDosisleistungNuklid(0, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when gamma is negative', () => {
    const result = calculateDosisleistungNuklid(-10, {
      activity: 1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled activity is zero', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: 0,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled activity is negative', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: -1,
      doseRate: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when filled doseRate is zero', () => {
    const result = calculateDosisleistungNuklid(351, {
      activity: null,
      doseRate: 0,
    });
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/common/strahlenschutz.test.ts`
Expected: FAIL (imports not yet available)

**Step 3: Run tests after Task 1 implementation is in place**

Run: `npm run test -- src/common/strahlenschutz.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/common/strahlenschutz.test.ts
git commit -m "test: add tests for nuclide dose rate calculation"
```

---

### Task 3: UI Component — DosisleistungNuklidRechner

**Files:**
- Modify: `src/components/pages/Strahlenschutz.tsx`

**Step 1: Add imports**

Add to existing imports from `../../common/strahlenschutz`:

```typescript
  ACTIVITY_UNITS,
  ActivityUnit,
  calculateDosisleistungNuklid,
  convertActivityToGBq,
  DosisleistungNuklidHistoryEntry,
  DosisleistungNuklidValues,
  NUCLIDES,
```

**Step 2: Add formula display function**

Add before the `// --- Main component ---` section:

```typescript
// --- Dosisleistung aus Nuklid ---

function getDosisleistungNuklidFormulaDisplay(
  field: 'activity' | 'doseRate',
  nuclideName: string,
  gamma: number,
  activityGBq: number,
  doseRate: number
) {
  const aStr = formatValue(activityGBq);
  const hStr = formatValue(doseRate);
  const gStr = formatValue(gamma);

  if (field === 'doseRate') {
    return {
      formula: `Ḣ = Γ × A`,
      substituted: `Ḣ = ${gStr} × ${aStr} = ${hStr} µSv/h`,
    };
  } else {
    return {
      formula: `A = Ḣ / Γ`,
      substituted: `A = ${hStr} / ${gStr} = ${aStr} GBq`,
    };
  }
}
```

**Step 3: Add the DosisleistungNuklidRechner component**

Add after the formula display function:

```typescript
function DosisleistungNuklidRechner() {
  const [selectedNuclide, setSelectedNuclide] = useState<string>(NUCLIDES[0].name);
  const [activityInput, setActivityInput] = useState('');
  const [activityUnit, setActivityUnit] = useState<ActivityUnit>('GBq');
  const [doseRateInput, setDoseRateInput] = useState('');
  const [history, setHistory] = useState<DosisleistungNuklidHistoryEntry[]>([]);

  const nuclide = useMemo(
    () => NUCLIDES.find((n) => n.name === selectedNuclide) ?? NUCLIDES[0],
    [selectedNuclide]
  );

  const parsedActivity = useMemo(() => parseInput(activityInput), [activityInput]);
  const parsedDoseRate = useMemo(() => parseInput(doseRateInput), [doseRateInput]);

  const activityInGBq = useMemo(
    () => (parsedActivity !== null ? convertActivityToGBq(parsedActivity, activityUnit) : null),
    [parsedActivity, activityUnit]
  );

  const values: DosisleistungNuklidValues = useMemo(
    () => ({ activity: activityInGBq, doseRate: parsedDoseRate }),
    [activityInGBq, parsedDoseRate]
  );

  const result = useMemo(
    () => calculateDosisleistungNuklid(nuclide.gamma, values),
    [nuclide.gamma, values]
  );

  const handleCalculate = useCallback(() => {
    if (!result) return;
    const actGBq = result.field === 'activity' ? result.value : activityInGBq!;
    const dr = result.field === 'doseRate' ? result.value : parsedDoseRate!;
    const entry: DosisleistungNuklidHistoryEntry = {
      nuclide: nuclide.name,
      gamma: nuclide.gamma,
      activityGBq: actGBq,
      activityUnit,
      activityInUnit: result.field === 'activity' ? result.value / (convertActivityToGBq(1, activityUnit)) : parsedActivity!,
      doseRate: dr,
      calculatedField: result.field,
      timestamp: new Date(),
    };
    setHistory((prev) => [entry, ...prev]);
  }, [result, activityInGBq, parsedDoseRate, nuclide, activityUnit, parsedActivity]);

  const handleClear = useCallback(() => {
    setActivityInput('');
    setDoseRateInput('');
  }, []);

  const handleDeleteHistoryEntry = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Dosisleistung aus Nuklidaktivität
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ḣ = Γ × A — Berechne Dosisleistung in 1m Abstand aus Aktivität oder umgekehrt.
        Lasse das zu berechnende Feld leer.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          select
          label="Nuklid"
          value={selectedNuclide}
          onChange={(e) => setSelectedNuclide(e.target.value)}
          variant="outlined"
          size="small"
        >
          {NUCLIDES.map((n) => (
            <MenuItem key={n.name} value={n.name}>
              {n.name} (Γ = {n.gamma})
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          Γ = {nuclide.gamma} µSv·m²/(h·GBq)
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 2, mt: 2 }}>
        <TextField
          label={`Aktivität (${activityUnit})`}
          value={activityInput}
          onChange={(e) => setActivityInput(e.target.value)}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          label="Einheit"
          value={activityUnit}
          onChange={(e) => setActivityUnit(e.target.value as ActivityUnit)}
          variant="outlined"
          size="small"
          sx={{ minWidth: 90 }}
        >
          {ACTIVITY_UNITS.map((u) => (
            <MenuItem key={u} value={u}>{u}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Dosisleistung in 1m (µSv/h)"
          value={doseRateInput}
          onChange={(e) => setDoseRateInput(e.target.value)}
          type="text"
          inputMode="decimal"
          variant="outlined"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button variant="contained" onClick={handleCalculate} disabled={!result}>
          Berechnen
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          Löschen
        </Button>
      </Box>

      {result && (() => {
        const actGBq = result.field === 'activity' ? result.value : activityInGBq!;
        const dr = result.field === 'doseRate' ? result.value : parsedDoseRate!;
        const fd = getDosisleistungNuklidFormulaDisplay(result.field, nuclide.name, nuclide.gamma, actGBq, dr);
        const resultLabel = result.field === 'doseRate'
          ? `Dosisleistung in 1m = ${formatValue(result.value)} µSv/h`
          : `Aktivität = ${formatValue(result.value)} GBq`;
        return (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'success.main', color: 'success.contrastText', borderRadius: 1 }}>
            <Typography variant="h6">{resultLabel}</Typography>
            <FormulaDisplay formula={fd.formula} substituted={fd.substituted} />
          </Box>
        );
      })()}

      {history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="h6" gutterBottom>Berechnungsverlauf</Typography>
          <List dense>
            {history.map((entry, index) => {
              const fd = getDosisleistungNuklidFormulaDisplay(
                entry.calculatedField, entry.nuclide, entry.gamma, entry.activityGBq, entry.doseRate
              );
              const primary = entry.calculatedField === 'doseRate'
                ? `${entry.nuclide}: Ḣ = ${formatValue(entry.doseRate)} µSv/h`
                : `${entry.nuclide}: A = ${formatValue(entry.activityInUnit)} ${entry.activityUnit}`;
              return (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton edge="end" aria-label="Löschen" onClick={() => handleDeleteHistoryEntry(index)} size="small">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={primary}
                    secondary={<>{fd.formula}<br />{fd.substituted}<br />{entry.timestamp.toLocaleTimeString()}</>}
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Add to main Strahlenschutz component**

In the `Strahlenschutz` default export, add between `AufenthaltszeitRechner` and `Einheitenumrechnung`:

```tsx
      <AufenthaltszeitRechner />
      <Divider />
      <DosisleistungNuklidRechner />
      <Divider />
      <Einheitenumrechnung />
```

**Step 5: Run checks**

Run: `npm run check`
Expected: All pass (tsc, lint, tests, build)

**Step 6: Commit**

```bash
git add src/components/pages/Strahlenschutz.tsx
git commit -m "feat: add nuclide-based dose rate calculator UI"
```
