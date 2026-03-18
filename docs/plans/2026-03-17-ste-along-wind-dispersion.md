# STE Along-Wind Dispersion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sigma_x (along-wind diffusion) to the Gaussian plume model so upwind points get small positive concentrations, fixing source estimation that currently forces the source far from the actual emission cluster.

**Architecture:** Modify `gaussianPlume()` to use distance-based dispersion + Gaussian decay for upwind points instead of returning 0. Remove the `valid = false` rejection in `estimateSource()` since upwind points now naturally return small positive values. Update tests to match new behavior.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Update upwind tests to expect small positive values

The existing tests assert `0` for upwind — change them to expect small positive values that decay with distance.

**Files:**
- Modify: `src/common/interpolation/ste.test.ts:63-66` (upwind near-zero test)
- Modify: `src/common/interpolation/ste.test.ts:92-95` (downwind=0 test)
- Modify: `src/common/interpolation/ste.test.ts:285-300` (evaluate returns 0 upwind)
- Modify: `src/common/interpolation/ste.test.ts:370-374` (5-marker upwind=0 test)

**Step 1: Update "returns zero or near-zero upwind" test**

Change the test at line 63 from asserting `toBeCloseTo(0, 5)` to asserting a small but positive value:

```typescript
it('returns small positive concentration upwind (along-wind diffusion)', () => {
  const cUpwind = gaussianPlume(-100, 0, baseParams);
  expect(cUpwind).toBeGreaterThan(0);
  // Much smaller than downwind at same distance
  const cDownwind = gaussianPlume(100, 0, baseParams);
  expect(cUpwind).toBeLessThan(cDownwind * 0.5);
});
```

**Step 2: Update "returns 0 at downwind distance of 0" test**

Change the test at line 92. At the source itself (0,0), concentration should now be positive (maximum near-field diffusion):

```typescript
it('returns positive concentration at source location', () => {
  const c = gaussianPlume(0, 0, baseParams);
  expect(c).toBeGreaterThan(0);
});
```

**Step 3: Update "evaluate returns 0 upwind of estimated source" test**

Change test at line 285. Far upwind should be near-zero but positive; close to source should be significant:

```typescript
it('evaluate returns near-zero far upwind, positive close to source', () => {
  const points: DataPoint[] = [
    { x: 100, y: 0, value: 5 },
    { x: 200, y: 0, value: 2 },
  ];
  const state = steAlgorithm.prepare(points, {
    windDirection: 270,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 20,
  });

  const cFarUpwind = steAlgorithm.evaluate(-500, 0, state);
  const cDownwind = steAlgorithm.evaluate(150, 0, state);
  expect(cFarUpwind).toBeGreaterThanOrEqual(0);
  expect(cFarUpwind).toBeLessThan(cDownwind * 0.01);
  expect(cDownwind).toBeGreaterThan(0);
});
```

**Step 4: Update 5-marker "evaluate returns 0 upwind" test**

Change test at line 370:

```typescript
it('evaluate returns near-zero far upwind, positive near source', () => {
  expect(steAlgorithm.evaluate(  80, -20, state)).toBeGreaterThan(0);
  expect(steAlgorithm.evaluate( 200,  10, state)).toBeGreaterThan(0);
  // Far upwind: very small but may be >= 0
  const cFarUpwind = steAlgorithm.evaluate(-300, 0, state);
  const cDownwind = steAlgorithm.evaluate(80, -20, state);
  expect(cFarUpwind).toBeLessThan(cDownwind * 0.01);
});
```

**Step 5: Run tests to verify they fail**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npx vitest run src/common/interpolation/ste.test.ts`

Expected: FAIL — `gaussianPlume(-100, 0, ...)` still returns exactly 0, and `gaussianPlume(0, 0, ...)` still returns 0.

---

### Task 2: Add new tests for along-wind dispersion properties

**Files:**
- Modify: `src/common/interpolation/ste.test.ts` (add new describe block after "Gaussian Plume concentration")

**Step 1: Add along-wind dispersion tests**

Insert after the existing "Gaussian Plume concentration" describe block (after line 96):

```typescript
describe('Along-wind dispersion (sigma_x)', () => {
  const baseParams = {
    Q: 100,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
  };

  it('upwind concentration decays with distance from source', () => {
    const c10 = gaussianPlume(-10, 0, baseParams);
    const c50 = gaussianPlume(-50, 0, baseParams);
    const c200 = gaussianPlume(-200, 0, baseParams);
    expect(c10).toBeGreaterThan(c50);
    expect(c50).toBeGreaterThan(c200);
  });

  it('near-source dispersion is quasi-isotropic at short distances', () => {
    // At 5m, upwind and downwind concentrations should be similar (within 10x)
    const cDown5 = gaussianPlume(5, 0, baseParams);
    const cUp5 = gaussianPlume(-5, 0, baseParams);
    expect(cUp5).toBeGreaterThan(cDown5 * 0.1);
  });

  it('upwind effect is stronger at low wind speeds', () => {
    const lowWind = { ...baseParams, windSpeed: 0.5 };
    const highWind = { ...baseParams, windSpeed: 5 };
    // At 20m upwind, low-wind should give relatively higher fraction
    const upLow = gaussianPlume(-20, 0, lowWind);
    const downLow = gaussianPlume(20, 0, lowWind);
    const upHigh = gaussianPlume(-20, 0, highWind);
    const downHigh = gaussianPlume(20, 0, highWind);
    expect(upLow / downLow).toBeGreaterThan(upHigh / downHigh);
  });

  it('downwind values are unchanged (regression check)', () => {
    // Pre-computed values for downwind with Q=100, u=3, D-class, H=0
    const c100 = gaussianPlume(100, 0, baseParams);
    const c200 = gaussianPlume(200, 0, baseParams);
    // These should match the standard Gaussian plume exactly
    const sigmaY100 = pasquillSigmaY(100, 4);
    const sigmaZ100 = pasquillSigmaZ(100, 4);
    const expected100 = 100 / (2 * Math.PI * 3 * sigmaY100 * sigmaZ100);
    expect(c100).toBeCloseTo(expected100, 10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npx vitest run src/common/interpolation/ste.test.ts`

Expected: FAIL — upwind tests fail because `gaussianPlume` returns 0 for negative downwind.

---

### Task 3: Implement along-wind dispersion in `gaussianPlume()`

**Files:**
- Modify: `src/common/interpolation/ste.ts:70-91` (gaussianPlume function)

**Step 1: Replace the gaussianPlume function body**

Replace lines 70-91 with the new implementation. The key change: instead of `if (downwind <= 0) return 0`, use distance-based sigma computation and Gaussian along-wind decay for upwind points.

```typescript
export function gaussianPlume(
  downwind: number,
  crosswind: number,
  params: GaussianPlumeParams
): number {
  const { Q, windSpeed, stabilityClass, releaseHeight } = params;
  const u = Math.max(0.1, windSpeed);

  if (downwind > 0) {
    // Classical Gaussian plume — unchanged
    const sigmaY = pasquillSigmaY(downwind, stabilityClass);
    const sigmaZ = pasquillSigmaZ(downwind, stabilityClass);

    const crosswindTerm = Math.exp(
      -(crosswind * crosswind) / (2 * sigmaY * sigmaY)
    );
    const verticalTerm = Math.exp(
      -(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ)
    );

    return (Q / (2 * Math.PI * u * sigmaY * sigmaZ)) * crosswindTerm * verticalTerm;
  }

  // Upwind or at source (downwind <= 0): along-wind diffusion.
  // Use total distance from source for dispersion coefficients,
  // and apply Gaussian decay in the upwind direction.
  const dist = Math.sqrt(downwind * downwind + crosswind * crosswind);
  const dEff = Math.max(1, dist);

  const sigmaY = pasquillSigmaY(dEff, stabilityClass);
  const sigmaZ = pasquillSigmaZ(dEff, stabilityClass);
  const sigmaX = pasquillSigmaY(dEff, stabilityClass); // along-wind ~ crosswind

  const baseTerm = Q / (2 * Math.PI * u * sigmaY * sigmaZ);

  const crosswindTerm = Math.exp(
    -(crosswind * crosswind) / (2 * sigmaY * sigmaY)
  );
  const verticalTerm = Math.exp(
    -(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ)
  );
  // Gaussian decay in the upwind direction (downwind is negative or zero)
  const alongWindTerm = Math.exp(
    -(downwind * downwind) / (2 * sigmaX * sigmaX)
  );

  return baseTerm * crosswindTerm * verticalTerm * alongWindTerm;
}
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npx vitest run src/common/interpolation/ste.test.ts`

Expected: All tests PASS. The downwind path is unchanged, upwind now returns small positive values, new along-wind tests pass.

**Step 3: Commit**

```bash
git add src/common/interpolation/ste.ts src/common/interpolation/ste.test.ts
git commit -m "feat(ste): add along-wind dispersion for upwind concentration

Replace hard downwind<=0 cutoff with Gaussian sigma_x decay.
Near the source, dispersion is quasi-isotropic; further upwind
it decays smoothly. Downwind behavior is unchanged."
```

---

### Task 4: Clean up `estimateSource()` — remove upwind rejection

With `gaussianPlume()` now returning positive values for upwind points, the `valid = false` rejection at lines 240-243 is no longer needed (and no longer triggered). Remove it for clarity.

**Files:**
- Modify: `src/common/interpolation/ste.ts:230-246` (grid search inner loop)

**Step 1: Remove the valid/break logic**

Replace the inner loop (lines 232-244) — remove `let valid = true`, the `if (c <= 0)` block, and `if (!valid) continue`:

```typescript
    for (let cx = gMinX; cx <= gMaxX; cx += res) {
      for (let cy = gMinY; cy <= gMaxY; cy += res) {
        const unitConcs: number[] = [];
        for (const p of meterPoints) {
          // Already in meter-space with +y = north, no yFlip needed
          const downwind = (p.x - cx) * Math.sin(windDirRad) + (p.y - cy) * Math.cos(windDirRad);
          const crosswind = (p.x - cx) * Math.cos(windDirRad) - (p.y - cy) * Math.sin(windDirRad);
          const c = gaussianPlume(downwind, crosswind, plumeParams);
          unitConcs.push(c);
        }

        let sumLogRatio = 0;
        let posCount = 0;
        for (let i = 0; i < meterPoints.length; i++) {
          if (meterPoints[i].value <= 0 || unitConcs[i] <= 0) continue;
          sumLogRatio += Math.log(meterPoints[i].value) - Math.log(unitConcs[i]);
          posCount++;
        }
```

Note: add `|| unitConcs[i] <= 0` to the skip condition (line with `if (meterPoints[i].value <= 0)`) as a safety guard — `gaussianPlume` should never return 0 now for finite inputs, but defensive coding is good.

**Step 2: Run tests**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npx vitest run src/common/interpolation/ste.test.ts`

Expected: All tests PASS (behavior unchanged, just cleaner code).

**Step 3: Commit**

```bash
git add src/common/interpolation/ste.ts
git commit -m "refactor(ste): remove upwind rejection from estimateSource

No longer needed since gaussianPlume returns positive values
for all points. Adds safety guard for unitConcs[i] <= 0."
```

---

### Task 5: Add integration test — scattered measurements with upwind points

This test reproduces the real-world scenario: measurements scattered around a source, some upwind. The source should be estimated near the actual high-value cluster, not forced far away.

**Files:**
- Modify: `src/common/interpolation/ste.test.ts` (add new describe block at end)

**Step 1: Write the integration test**

```typescript
describe('STE source estimation with upwind measurement points', () => {
  /**
   * Scenario: source at (0, 0), wind from west (270°, → east).
   * Most markers are downwind (east), but two markers are upwind (west)
   * with low values (background readings). The algorithm must still
   * estimate the source near (0, 0) instead of pushing it far west.
   *
   *       M_up2(-80,30) ●           y
   *                   |             |
   *   M_up1(-50,0) ● ── src ──── M1(80,0) ── M2(200,0) ──► x (downwind)
   *                                 |
   *                          M3(120,-40) ●
   */
  const trueQ = 300;
  const plumeBase = { Q: trueQ, windSpeed: 3, stabilityClass: 4, releaseHeight: 0 };
  const prepParams = {
    windDirection: 270,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
  };

  const markers: DataPoint[] = [
    { x:  80, y:   0, value: gaussianPlume( 80,   0, plumeBase) },
    { x: 200, y:   0, value: gaussianPlume(200,   0, plumeBase) },
    { x: 120, y: -40, value: gaussianPlume(120, -40, plumeBase) },
    // Upwind points — get small values from along-wind diffusion
    { x: -50, y:   0, value: gaussianPlume(-50,   0, plumeBase) },
    { x: -80, y:  30, value: gaussianPlume(-80,  30, plumeBase) },
  ];

  let state: ReturnType<typeof steAlgorithm.prepare>;
  beforeAll(() => { state = steAlgorithm.prepare(markers, prepParams); });

  it('upwind markers have small but positive values', () => {
    const upwindValues = markers.filter(m => m.x < 0).map(m => m.value);
    for (const v of upwindValues) expect(v).toBeGreaterThan(0);
    // Upwind values should be much smaller than downwind
    const downwindMax = Math.max(...markers.filter(m => m.x > 0).map(m => m.value));
    for (const v of upwindValues) expect(v).toBeLessThan(downwindMax * 0.5);
  });

  it('source is estimated within 50m of true source (0, 0)', () => {
    const dist = Math.sqrt(state.sourceX ** 2 + state.sourceY ** 2);
    expect(dist).toBeLessThan(50);
  });

  it('source is NOT pushed far upwind by upwind measurements', () => {
    // The old bug: source was forced far west (negative x) to keep
    // all points downwind. Now it should be near 0.
    expect(state.sourceX).toBeGreaterThan(-50);
  });

  it('release rate is in the right order of magnitude', () => {
    expect(state.releaseRate).toBeGreaterThan(trueQ / 10);
    expect(state.releaseRate).toBeLessThan(trueQ * 10);
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npx vitest run src/common/interpolation/ste.test.ts`

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add src/common/interpolation/ste.test.ts
git commit -m "test(ste): add integration test for upwind measurement points

Verifies source is estimated near actual emission cluster even
when some measurements are upwind of the source."
```

---

### Task 6: Run full test suite and verify no regressions

**Step 1: Run all tests**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/ausbreitungsprognose && NO_COLOR=1 npm run test`

Expected: All tests PASS, no regressions.

**Step 2: Commit if any fixups needed, otherwise done**
