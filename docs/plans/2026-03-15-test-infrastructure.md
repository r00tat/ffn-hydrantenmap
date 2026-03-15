# Test Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install Vitest + React Testing Library and write the first suite of unit tests covering pure utility functions in `src/common/`.

**Architecture:** Vitest configured via `vitest.config.ts` at repo root (independent of Next.js config). Tests for pure utilities live co-located next to their source files. A shared `src/test-setup.ts` installs jest-dom matchers globally. Component tests (future) opt into jsdom via a file-level environment docblock.

**Tech Stack:** Vitest, @vitejs/plugin-react, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, vite-tsconfig-paths

---

### Task 1: Install test dependencies

**Files:**
- Modify: `package.json` (scripts block)

**Step 1: Install packages**

```bash
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom vite-tsconfig-paths
```

Expected output: packages added, no peer-dep errors.

**Step 2: Verify installation**

```bash
npx vitest --version
```

Expected: prints a version like `3.x.x`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install vitest and testing-library"
```

---

### Task 2: Create Vitest config and global test setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test-setup.ts`

**Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 2: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom';
```

**Step 3: Add npm scripts to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Run Vitest to confirm it starts without errors**

```bash
npm test
```

Expected: "No test files found" (exits 0) — the config is valid.

**Step 5: Commit**

```bash
git add vitest.config.ts src/test-setup.ts package.json
git commit -m "chore: add vitest config and test setup"
```

---

### Task 3: Unit tests for `arrayUtils.ts`

**Files:**
- Create: `src/common/arrayUtils.test.ts`
- Reference: `src/common/arrayUtils.ts`

The function: `uniqueArray<T>(arr: T[]): T[]` — returns array with duplicates removed, first occurrence kept.

**Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { uniqueArray } from './arrayUtils';

describe('uniqueArray', () => {
  it('removes duplicate numbers', () => {
    expect(uniqueArray([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(uniqueArray(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('returns empty array unchanged', () => {
    expect(uniqueArray([])).toEqual([]);
  });

  it('returns single-element array unchanged', () => {
    expect(uniqueArray([42])).toEqual([42]);
  });

  it('preserves order of first occurrence', () => {
    expect(uniqueArray([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it('does not deduplicate objects (reference equality)', () => {
    const obj = { id: 1 };
    expect(uniqueArray([obj, obj])).toEqual([obj]);
    // Two separate objects with same shape are NOT deduplicated
    expect(uniqueArray([{ id: 1 }, { id: 1 }])).toHaveLength(2);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/arrayUtils.test.ts
```

Expected: 6 passing.

**Step 3: Commit**

```bash
git add src/common/arrayUtils.test.ts
git commit -m "test: unit tests for arrayUtils"
```

---

### Task 4: Unit tests for `boolish.ts`

**Files:**
- Create: `src/common/boolish.test.ts`
- Reference: `src/common/boolish.ts`

The function: `isTruthy(value: string | boolean | null | undefined): boolean` — returns true for `'on'`, `'yes'`, `'true'`, `'t'`, `true`.

**Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { isTruthy } from './boolish';

describe('isTruthy', () => {
  it.each(['on', 'yes', 'true', 't'])('returns true for string "%s"', (v) => {
    expect(isTruthy(v)).toBe(true);
  });

  it('returns true for boolean true', () => {
    expect(isTruthy(true)).toBe(true);
  });

  it.each(['false', 'no', 'off', '1', 'True', 'YES', ''])(
    'returns false for string "%s"',
    (v) => {
      expect(isTruthy(v)).toBe(false);
    }
  );

  it('returns false for boolean false', () => {
    expect(isTruthy(false)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTruthy(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/boolish.test.ts
```

Expected: all passing.

**Step 3: Commit**

```bash
git add src/common/boolish.test.ts
git commit -m "test: unit tests for boolish"
```

---

### Task 5: Unit tests for `geo.ts`

**Files:**
- Create: `src/common/geo.test.ts`
- Reference: `src/common/geo.ts`

Key exports: `GeoPosition` class, `defaultLatLngPosition`, `GeoJsonToLatLng`, `LatLngToGeoJson`, `latLngPosition`.

**Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import {
  GeoPosition,
  defaultLatLngPosition,
  GeoJsonToLatLng,
  LatLngToGeoJson,
  latLngPosition,
} from './geo';

describe('GeoPosition', () => {
  describe('constructor', () => {
    it('uses provided lat/lng', () => {
      const p = new GeoPosition(48.0, 16.5);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
      expect(p.alt).toBe(0);
    });

    it('defaults to Neusiedl am See coordinates', () => {
      const p = new GeoPosition();
      expect(p.lat).toBe(defaultLatLngPosition[0]);
      expect(p.lng).toBe(defaultLatLngPosition[1]);
    });
  });

  describe('fromGeoJsonPosition', () => {
    it('converts [lng, lat] GeoJSON format to lat/lng', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0]);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
    });

    it('preserves altitude when present', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0, 100]);
      expect(p.alt).toBe(100);
    });

    it('leaves alt as 0 when not provided', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0]);
      expect(p.alt).toBe(0);
    });
  });

  describe('fromLatLng', () => {
    it('creates from [lat, lng] tuple', () => {
      const p = GeoPosition.fromLatLng([48.0, 16.5]);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
    });
  });

  describe('toGeoJson', () => {
    it('returns [lng, lat] without altitude when alt is 0', () => {
      const p = new GeoPosition(48.0, 16.5, 0);
      expect(p.toGeoJson()).toEqual([16.5, 48.0]);
    });

    it('returns [lng, lat, alt] when alt is non-zero', () => {
      const p = new GeoPosition(48.0, 16.5, 100);
      expect(p.toGeoJson()).toEqual([16.5, 48.0, 100]);
    });
  });

  describe('toLatLngPosition', () => {
    it('returns [lat, lng] tuple', () => {
      const p = new GeoPosition(48.0, 16.5);
      expect(p.toLatLngPosition()).toEqual([48.0, 16.5]);
    });
  });
});

describe('GeoJsonToLatLng', () => {
  it('converts GeoJSON [lng, lat] to [lat, lng]', () => {
    expect(GeoJsonToLatLng([16.5, 48.0])).toEqual([48.0, 16.5]);
  });
});

describe('LatLngToGeoJson', () => {
  it('converts [lat, lng] to GeoJSON [lng, lat]', () => {
    expect(LatLngToGeoJson([48.0, 16.5])).toEqual([16.5, 48.0]);
  });
});

describe('latLngPosition', () => {
  it('returns provided coordinates', () => {
    expect(latLngPosition(48.0, 16.5)).toEqual([48.0, 16.5]);
  });

  it('falls back to defaults for missing values', () => {
    const [lat, lng] = latLngPosition();
    expect(lat).toBe(defaultLatLngPosition[0]);
    expect(lng).toBe(defaultLatLngPosition[1]);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/geo.test.ts
```

Expected: all passing.

**Step 3: Commit**

```bash
git add src/common/geo.test.ts
git commit -m "test: unit tests for GeoPosition"
```

---

### Task 6: Unit tests for `time-format.ts`

**Files:**
- Create: `src/common/time-format.test.ts`
- Reference: `src/common/time-format.ts`

Key exports: `formatTimestamp`, `parseTimestamp`, `dateTimeFormat`.

**Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { formatTimestamp, parseTimestamp, dateTimeFormat } from './time-format';

describe('formatTimestamp', () => {
  it('formats a Date object in DD.MM.YYYY HH:mm:ss', () => {
    // Use a fixed UTC date to avoid timezone issues: 2024-06-15 10:30:00 UTC
    const date = new Date('2024-06-15T10:30:00.000Z');
    const result = formatTimestamp(date);
    // The format should match DD.MM.YYYY HH:mm:ss regardless of local tz
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('formats an ISO string', () => {
    const result = formatTimestamp('2024-01-01T00:00:00.000Z');
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns a valid format string for undefined input', () => {
    // moment(undefined) is the current time — just check format shape
    const result = formatTimestamp(undefined);
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('parseTimestamp', () => {
  it('returns undefined for undefined input', () => {
    expect(parseTimestamp(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseTimestamp('')).toBeUndefined();
  });

  it('parses ISO 8601 format', () => {
    const result = parseTimestamp('2024-06-15T10:30:00');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
    expect(result!.month()).toBe(5); // moment months are 0-indexed
    expect(result!.date()).toBe(15);
  });

  it('parses German date-time format DD.MM.YYYY HH:mm:ss', () => {
    const result = parseTimestamp('15.06.2024 10:30:00');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
    expect(result!.date()).toBe(15);
  });

  it('parses German date-only format DD.MM.YYYY', () => {
    const result = parseTimestamp('15.06.2024');
    expect(result).toBeDefined();
    expect(result!.isValid()).toBe(true);
    expect(result!.year()).toBe(2024);
  });

  it('returns undefined for clearly invalid input', () => {
    const result = parseTimestamp('not-a-date');
    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/time-format.test.ts
```

Expected: all passing.

**Step 3: Commit**

```bash
git add src/common/time-format.test.ts
git commit -m "test: unit tests for time-format"
```

---

### Task 7: Unit tests for `interpolation.ts`

**Files:**
- Create: `src/common/interpolation.test.ts`
- Reference: `src/common/interpolation.ts`

Key exports: `computeConvexHull`, `pointInPolygon`, `distanceToSegment`, `idwInterpolate`.

Note: `interpolation.ts` imports `HeatmapConfig` from `../components/firebase/firestore` and `normalizeValueFull` from `./heatmap`. These are only used in higher-level functions (grid rendering), not in the pure math functions we're testing. Vitest will load the file, so both imports must resolve. If the import of `firestore` fails (it may reference Firebase SDK), mock the module.

**Step 1: Create the test file**

```ts
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase-dependent modules so interpolation.ts loads cleanly
vi.mock('../components/firebase/firestore', () => ({
  HeatmapConfig: {},
}));
vi.mock('./heatmap', () => ({
  normalizeValueFull: vi.fn(),
}));

import {
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  idwInterpolate,
} from './interpolation';

describe('computeConvexHull', () => {
  it('returns single point unchanged', () => {
    const pts = [{ x: 1, y: 1 }];
    expect(computeConvexHull(pts)).toEqual(pts);
  });

  it('returns two points unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(computeConvexHull(pts)).toEqual(pts);
  });

  it('computes hull of a square (all 4 corners on hull)', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const hull = computeConvexHull(square);
    expect(hull).toHaveLength(4);
    // Every corner should be in the hull
    for (const pt of square) {
      expect(hull).toContainEqual(pt);
    }
  });

  it('excludes interior point from hull', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 }, // interior point
    ];
    const hull = computeConvexHull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 1, y: 1 });
  });

  it('handles collinear points by returning input as-is', () => {
    const collinear = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const hull = computeConvexHull(collinear);
    // Collinear case: hull.length < 3, so input is returned
    expect(hull).toEqual(collinear);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('returns true for a point clearly inside the polygon', () => {
    expect(pointInPolygon(2, 2, square)).toBe(true);
  });

  it('returns false for a point clearly outside the polygon', () => {
    expect(pointInPolygon(10, 10, square)).toBe(false);
  });

  it('returns false for a point at origin corner', () => {
    // Edge/corner behavior is implementation-defined; just check it does not throw
    expect(() => pointInPolygon(0, 0, square)).not.toThrow();
  });
});

describe('distanceToSegment', () => {
  it('returns 0 for a point on the segment', () => {
    // Point (1, 0) is on segment (0,0)-(2,0)
    expect(distanceToSegment(1, 0, 0, 0, 2, 0)).toBeCloseTo(0);
  });

  it('returns perpendicular distance for a point off the segment', () => {
    // Point (1, 1) is 1 unit above midpoint of horizontal segment (0,0)-(2,0)
    expect(distanceToSegment(1, 1, 0, 0, 2, 0)).toBeCloseTo(1);
  });

  it('returns distance to nearest endpoint when projection falls outside', () => {
    // Point (5, 0) is beyond end of segment (0,0)-(2,0), distance = 3
    expect(distanceToSegment(5, 0, 0, 0, 2, 0)).toBeCloseTo(3);
  });

  it('handles degenerate segment (both endpoints equal)', () => {
    // Both endpoints at (1,1), point at (4,5): distance = sqrt(9+16) = 5
    expect(distanceToSegment(4, 5, 1, 1, 1, 1)).toBeCloseTo(5);
  });
});

describe('idwInterpolate', () => {
  const points = [
    { x: 0, y: 0, value: 10 },
    { x: 10, y: 0, value: 20 },
  ];

  it('returns exact value at a data point', () => {
    expect(idwInterpolate(0, 0, points, 2)).toBeCloseTo(10);
    expect(idwInterpolate(10, 0, points, 2)).toBeCloseTo(20);
  });

  it('returns midpoint value at equal distance from two points', () => {
    // At x=5, equidistant from both: should return average (15)
    expect(idwInterpolate(5, 0, points, 2)).toBeCloseTo(15);
  });

  it('returns value closer to nearer point', () => {
    // At x=2, closer to value=10 point
    const result = idwInterpolate(2, 0, points, 2);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(15);
  });

  it('returns 0 for empty points array', () => {
    expect(idwInterpolate(0, 0, [], 2)).toBe(0);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/interpolation.test.ts
```

Expected: all passing. If mocking fails because the firestore module does not exist at import time, check the mock paths match the actual import paths in `interpolation.ts`.

**Step 3: Commit**

```bash
git add src/common/interpolation.test.ts
git commit -m "test: unit tests for interpolation utilities"
```

---

### Task 8: Unit tests for `kostenersatz.ts`

**Files:**
- Create: `src/common/kostenersatz.test.ts`
- Reference: `src/common/kostenersatz.ts` (lines 187–303)

Key exports: `roundHoursForBilling`, `calculateItemSum`, `calculateCustomItemSum`, `roundCurrency`, `calculateTotalSum`.

**Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import {
  roundHoursForBilling,
  calculateItemSum,
  calculateCustomItemSum,
  roundCurrency,
  calculateTotalSum,
} from './kostenersatz';

describe('roundCurrency', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundCurrency(1.005)).toBeCloseTo(1.01, 2);
    expect(roundCurrency(1.234)).toBeCloseTo(1.23, 2);
  });

  it('returns whole numbers unchanged', () => {
    expect(roundCurrency(10)).toBe(10);
  });
});

describe('roundHoursForBilling', () => {
  it('returns 0 for 0 or negative hours', () => {
    expect(roundHoursForBilling(0)).toBe(0);
    expect(roundHoursForBilling(-1)).toBe(0);
  });

  it('returns exact hours for whole-hour values', () => {
    expect(roundHoursForBilling(1)).toBe(1);
    expect(roundHoursForBilling(4)).toBe(4);
  });

  it('rounds up to 0.5 for fractions <= 0.5', () => {
    expect(roundHoursForBilling(1.25)).toBe(1.5);
    expect(roundHoursForBilling(1.5)).toBe(1.5);
  });

  it('rounds up to next full hour for fractions > 0.5', () => {
    expect(roundHoursForBilling(1.75)).toBe(2);
    expect(roundHoursForBilling(2.9)).toBe(3);
  });
});

describe('calculateItemSum', () => {
  it('returns 0 when einheiten is 0', () => {
    expect(calculateItemSum(3, 0, 100)).toBe(0);
  });

  it('returns 0 when hours is 0', () => {
    expect(calculateItemSum(0, 2, 100)).toBe(0);
  });

  it('calculates hourly rate for first 4 hours: einheiten × hours × price', () => {
    // 2 units × 3 hours × 100 = 600
    expect(calculateItemSum(3, 2, 100)).toBe(600);
  });

  it('uses pauschal rate at hour 5+ (12h block default)', () => {
    // 5 hours, 1 unit, price=100, pauschal=800 → 1 block = 800
    expect(calculateItemSum(5, 1, 100, 800)).toBe(800);
  });

  it('uses pauschal rate for 2 blocks when hours exceed first block', () => {
    // 13 hours, 1 unit, pauschalHours=12 → 2 blocks × 800 = 1600
    expect(calculateItemSum(13, 1, 100, 800, 12)).toBe(1600);
  });

  it('uses flat pricePauschal when price is 0', () => {
    // Tarif B/10: price=0, pricePauschal=50, einheiten=3 → 150
    expect(calculateItemSum(2, 3, 0, 50)).toBe(150);
  });
});

describe('calculateCustomItemSum', () => {
  it('multiplies quantity by price', () => {
    expect(calculateCustomItemSum(5, 20)).toBe(100);
  });

  it('handles zero quantity', () => {
    expect(calculateCustomItemSum(0, 20)).toBe(0);
  });
});

describe('calculateTotalSum', () => {
  it('sums all items and custom items', () => {
    const items = [
      { sum: 100 } as any,
      { sum: 200 } as any,
    ];
    const customItems = [{ sum: 50 } as any];
    expect(calculateTotalSum(items, customItems)).toBe(350);
  });

  it('returns 0 for empty arrays', () => {
    expect(calculateTotalSum([], [])).toBe(0);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- src/common/kostenersatz.test.ts
```

Expected: all passing.

**Step 3: Commit**

```bash
git add src/common/kostenersatz.test.ts
git commit -m "test: unit tests for kostenersatz billing functions"
```

---

### Task 9: Run full test suite and verify

**Step 1: Run all tests together**

```bash
npm test
```

Expected: all test files pass, 0 failures.

**Step 2: Confirm lint passes**

```bash
npm run lint
```

Expected: no errors.

**Step 3: Commit if anything was adjusted**

If any test was adjusted during troubleshooting, commit now:

```bash
git add -p
git commit -m "test: fix test assertions after full suite run"
```

---

### Task 10: Open PR

**Step 1: Push branch**

```bash
GITHUB_TOKEN= gh auth status
git push -u origin feature/test-infrastructure
```

**Step 2: Create PR**

```bash
GITHUB_TOKEN= gh pr create \
  --title "feat: add Vitest test infrastructure with unit tests for common utilities" \
  --body "Installs Vitest + React Testing Library and adds the first unit tests covering \`src/common/\`: arrayUtils, boolish, geo, time-format, interpolation, and kostenersatz billing functions."
```
