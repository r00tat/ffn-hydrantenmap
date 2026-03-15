# Test Infrastructure Design

**Date:** 2026-03-15
**Branch:** feature/test-infrastructure
**Status:** Approved

## Goal

Establish a unit and component test foundation for the hydranten-map project, which currently has no automated tests beyond Playwright screenshot generation.

## Tooling

| Package | Role |
|---|---|
| `vitest` | Test runner + assertion library |
| `@vitejs/plugin-react` | JSX/TSX transform for component tests |
| `@testing-library/react` | Component rendering utilities |
| `@testing-library/jest-dom` | Extended DOM matchers (`.toBeInTheDocument()` etc.) |
| `@testing-library/user-event` | User interaction simulation |
| `jsdom` | Browser-like environment for component tests |
| `vite-tsconfig-paths` | TypeScript path alias resolution |

Vitest is configured via `vitest.config.ts` at the repo root, independent of `next.config.ts`. This avoids coupling the test environment to Next.js internals.

## Test Environment Strategy

- Utility tests: `node` environment (default) — fast, no DOM overhead
- Component tests: opt in to `jsdom` via `@vitest-environment jsdom` docblock comment per file

## File Layout

```
vitest.config.ts
src/
  test-setup.ts                  ← global jest-dom matchers setup
  common/
    arrayUtils.test.ts
    boolish.test.ts
    geo.test.ts
    interpolation.test.ts
    time-format.test.ts
    kostenersatz.test.ts
```

Component test directories (under `src/components/<Feature>/__tests__/`) are established as the project grows.

## npm Scripts

```json
"test": "vitest run",
"test:watch": "vitest"
```

## Vitest Config

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

## Unit Test Coverage Plan

### `arrayUtils.ts` — `uniqueArray`
- Removes duplicates from primitive arrays
- Returns empty array unchanged
- Preserves order of first occurrence
- Does not deduplicate objects by reference equality

### `boolish.ts` — `isTruthy`
- `'on'`, `'yes'`, `'true'`, `'t'`, `true` → truthy
- `'false'`, `''`, `null`, `undefined`, `false` → falsy
- Case sensitivity (e.g. `'True'` is falsy)

### `time-format.ts` — `formatTimestamp`, `parseTimestamp`
- `formatTimestamp` with valid Date and string inputs
- `formatTimestamp` with undefined → handles gracefully
- `parseTimestamp` with ISO 8601, German formats (`DD.MM.YYYY HH:mm:ss`)
- `parseTimestamp` with undefined/invalid → returns `undefined`

### `geo.ts` — `GeoPosition`
- Constructor defaults to Neusiedl am See coordinates
- `fromGeoJsonPosition` converts `[lng, lat]` to `{lat, lng}`
- `toGeoJson` round-trips to `[lng, lat]`
- `toLatLngPosition` returns `[lat, lng]` tuple
- Altitude included in GeoJSON only when non-zero

### `interpolation.ts` — spatial math
- `convexHull` with known point sets (triangle, square, collinear points, < 3 points)
- Distance functions return correct values for known coordinates
- IDW: returns known value at exact data point location
- IDW: returns weighted average between two points

### `kostenersatz.ts` — billing calculations
- Cost calculation with known rate inputs matches expected totals
- Edge cases: zero quantity, minimum charge

## Out of Scope (initial phase)

- Server actions (require Firebase Admin mocking — deferred)
- React hooks (require Firebase client mocking — deferred)
- E2E tests (Playwright already in place for screenshots)
- Full component tests (infrastructure only in this phase)
