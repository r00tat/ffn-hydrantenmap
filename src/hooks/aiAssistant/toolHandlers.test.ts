import { FunctionCall } from 'firebase/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeohashCluster } from '../../common/gis-objects';
import { HoseLineDraft, WaterSupplyCandidate } from '../../common/waterSupply';
import { executeToolCall, ToolHandlerDeps } from './toolHandlers';

const einsatzort = { lat: 47.9482913, lng: 16.848222 };
const metersToLat = (m: number) => m / 111320;

const hydrantNah = {
  name: 'ÜH Hauptstraße 12',
  lat: einsatzort.lat + metersToLat(80),
  lng: einsatzort.lng,
  typ: 'Überflurhydrant',
  dimension: 100,
  statischer_druck: 6,
};
const hydrantFern = {
  name: 'UH Seegasse 3',
  lat: einsatzort.lat + metersToLat(250),
  lng: einsatzort.lng,
  typ: 'Unterflurhydrant',
  dimension: 80,
};

function makeDeps(overrides: Partial<ToolHandlerDeps> = {}): ToolHandlerDeps {
  return {
    resolvePosition: vi.fn(async () => einsatzort),
    resolveOrigin: vi.fn(async () => ({
      ...einsatzort,
      type: 'einsatzort',
      label: 'dem Einsatzort',
    })),
    addFirecallItem: vi.fn(async () => ({ id: 'new-id' })),
    updateFirecallItem: vi.fn(async () => {}),
    existingItems: [],
    lastCreatedItem: null,
    setLastCreatedItem: vi.fn(),
    map: null,
    defaultPosition: einsatzort,
    findWaterSupply: vi.fn(
      async () =>
        [
          { geohash: 'a', hydranten: [hydrantNah, hydrantFern] },
        ] as unknown as GeohashCluster[]
    ),
    waterSupplyResults: { current: [] as WaterSupplyCandidate[] },
    proposeHoseLineDrafts: vi.fn(),
    ...overrides,
  } as ToolHandlerDeps;
}

const call = (name: string, args: Record<string, unknown> = {}): FunctionCall =>
  ({ name, args }) as FunctionCall;

describe('searchWaterSupply', () => {
  it('returns candidates sorted by distance and remembers them', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.success).toBe(true);
    expect(result.data.candidates.map((c: WaterSupplyCandidate) => c.name)).toEqual([
      'ÜH Hauptstraße 12',
      'UH Seegasse 3',
    ]);
    expect(deps.waterSupplyResults.current).toHaveLength(2);
  });

  it('defaults to the automatic origin and a 300 m radius', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);

    expect(deps.resolveOrigin).toHaveBeenCalledWith({ type: 'auto' });
    expect(deps.findWaterSupply).toHaveBeenCalledWith(einsatzort, 300);
  });

  it('names the origin it measured from', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.message).toContain('dem Einsatzort');
    expect(result.data.origin).toEqual({
      type: 'einsatzort',
      label: 'dem Einsatzort',
    });
  });

  it('says so when it fell back to the map centre', async () => {
    // Der stille Rückfall war die Ursache dafür, dass Leitungen an der
    // Kartenmitte statt am Einsatzort begannen, ohne dass es jemand sah.
    const deps = makeDeps({
      resolveOrigin: vi.fn(async () => ({
        ...einsatzort,
        type: 'mapCenter',
        label: 'der Kartenmitte',
      })),
    });
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.message).toContain('der Kartenmitte');
  });

  it('passes an explicit origin through', async () => {
    const deps = makeDeps();
    await executeToolCall(
      call('searchWaterSupply', {
        position: { type: 'atItem', itemName: 'TLFA Neusiedl' },
      }),
      deps
    );

    expect(deps.resolveOrigin).toHaveBeenCalledWith({
      type: 'atItem',
      itemName: 'TLFA Neusiedl',
    });
  });

  it('widens the radius itself instead of letting the model retry', async () => {
    // Nur der weiteste Ring liefert etwas — ohne Eskalation im Handler müsste
    // das Modell erneut aufrufen und verbrennt dabei Schleifendurchläufe.
    const findWaterSupply = vi.fn(async (_center, radius: number) =>
      radius >= 1200
        ? ([{ geohash: 'a', hydranten: [hydrantFern] }] as unknown as GeohashCluster[])
        : []
    );
    const deps = makeDeps({ findWaterSupply });

    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(findWaterSupply.mock.calls.map((c) => c[1])).toEqual([300, 600, 1200]);
    expect(result.success).toBe(true);
    expect(result.data.radius).toBe(1200);
  });

  it('stops at the first radius that finds something', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);

    expect((deps.findWaterSupply as any).mock.calls).toHaveLength(1);
  });

  it('honours an explicit radius without widening it', async () => {
    const deps = makeDeps({ findWaterSupply: vi.fn(async () => []) });
    await executeToolCall(call('searchWaterSupply', { radius: 150 }), deps);

    expect((deps.findWaterSupply as any).mock.calls.map((c: any[]) => c[1])).toEqual([
      150,
    ]);
  });

  it('answers with distance and direction so the model only has to relay it', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.message).toContain('ÜH Hauptstraße 12');
    expect(result.message).toContain('nördlich');
    expect(result.message).toMatch(/8[0-9] m/);
    expect(result.data.answer).toBe(result.message);
  });

  it('caps the radius so a single call cannot pull in the whole database', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply', { radius: 99999 }), deps);

    expect(deps.findWaterSupply).toHaveBeenCalledWith(einsatzort, 2500);
  });

  it('applies kind and type filters', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('searchWaterSupply', { kinds: ['hydrant'], hydrantType: 'Unterflur' }),
      deps
    );

    expect(result.data.candidates.map((c: WaterSupplyCandidate) => c.name)).toEqual([
      'UH Seegasse 3',
    ]);
  });

  it('reports when nothing was found instead of failing silently', async () => {
    const deps = makeDeps({ findWaterSupply: vi.fn(async () => []) });
    const result = await executeToolCall(
      call('searchWaterSupply', { radius: 100 }),
      deps
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('100');
    expect(result.data.candidates).toEqual([]);
  });

  it('reports the widest radius it tried when the escalation finds nothing', async () => {
    const deps = makeDeps({ findWaterSupply: vi.fn(async () => []) });
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.success).toBe(false);
    expect(result.message).toContain('2500');
  });

  it('describes every candidate it returns, not a fixed handful', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `H${i}`,
      lat: einsatzort.lat + metersToLat(20 * (i + 1)),
      lng: einsatzort.lng,
    }));
    const deps = makeDeps({
      findWaterSupply: vi.fn(
        async () =>
          [{ geohash: 'a', hydranten: many }] as unknown as GeohashCluster[]
      ),
    });

    const result = await executeToolCall(
      call('searchWaterSupply', { limit: 8 }),
      deps
    );

    for (const hydrant of many) {
      expect(result.message).toContain(hydrant.name);
    }
    expect(result.data.candidates).toHaveLength(8);
  });

  it('keeps the answer short by default', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `H${i}`,
      lat: einsatzort.lat + metersToLat(20 * (i + 1)),
      lng: einsatzort.lng,
    }));
    const deps = makeDeps({
      findWaterSupply: vi.fn(
        async () =>
          [{ geohash: 'a', hydranten: many }] as unknown as GeohashCluster[]
      ),
    });

    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.data.candidates).toHaveLength(5);
    expect(result.message).toContain('H4');
    expect(result.message).not.toContain('H5');
  });

  it('does not create any map item', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);
    expect(deps.addFirecallItem).not.toHaveBeenCalled();
  });

  it('proposes one draft per candidate, nearest first', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(deps.proposeHoseLineDrafts).toHaveBeenCalledTimes(1);
    const proposed: HoseLineDraft[] = (deps.proposeHoseLineDrafts as any).mock
      .calls[0][0];
    expect(proposed.map((d) => d.source?.name)).toEqual([
      'ÜH Hauptstraße 12',
      'UH Seegasse 3',
    ]);
    expect(proposed[0].positions[0]).toEqual([hydrantNah.lat, hydrantNah.lng]);
    expect(proposed[0].positions[1]).toEqual([einsatzort.lat, einsatzort.lng]);
    expect(result.drafts).toBe(proposed);
    // Entwürfe sind Vorschläge, keine Elemente: nichts wird gespeichert.
    expect(deps.addFirecallItem).not.toHaveBeenCalled();
  });

  it('proposes as many drafts as the limit asked for', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      name: `H${i}`,
      lat: einsatzort.lat + metersToLat(20 * (i + 1)),
      lng: einsatzort.lng,
    }));
    const deps = makeDeps({
      findWaterSupply: vi.fn(
        async () =>
          [{ geohash: 'a', hydranten: many }] as unknown as GeohashCluster[]
      ),
    });

    await executeToolCall(call('searchWaterSupply', { limit: 6 }), deps);

    const proposed: HoseLineDraft[] = (deps.proposeHoseLineDrafts as any).mock
      .calls[0][0];
    expect(proposed).toHaveLength(6);
    expect(new Set(proposed.map((d) => d.id)).size).toBe(6);
  });

  it('mentions the draft in the answer so the model relays it', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.message).toMatch(/Leitungsvorschl(ag|äge)/);
    expect(result.message).toMatch(/B-Längen/);
  });

  it('proposes nothing when the search came up empty', async () => {
    const deps = makeDeps({ findWaterSupply: vi.fn(async () => []) });
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(deps.proposeHoseLineDrafts).not.toHaveBeenCalled();
    expect(result.drafts).toBeUndefined();
  });

  it('skips candidates that sit on the search position', async () => {
    const deps = makeDeps({
      findWaterSupply: vi.fn(
        async () =>
          [
            { geohash: 'a', hydranten: [{ name: 'H0', ...einsatzort }] },
          ] as unknown as GeohashCluster[]
      ),
    });
    const result = await executeToolCall(call('searchWaterSupply'), deps);

    expect(result.success).toBe(true);
    expect(deps.proposeHoseLineDrafts).not.toHaveBeenCalled();
  });
});

describe('proposeHoseLine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('proposes a draft from a previously found hydrant without persisting it', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);
    (deps.proposeHoseLineDrafts as any).mockClear();

    const result = await executeToolCall(
      call('proposeHoseLine', {
        sourceName: 'ÜH Hauptstraße 12',
        reason: 'nächster Überflurhydrant, 100 mm',
      }),
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.addFirecallItem).not.toHaveBeenCalled();
    expect(deps.proposeHoseLineDrafts).toHaveBeenCalledTimes(1);

    const [draft]: HoseLineDraft[] = (deps.proposeHoseLineDrafts as any).mock
      .calls[0][0];
    expect(draft.dimension).toBe('B');
    expect(draft.distance).toBeGreaterThan(70);
    expect(draft.distance).toBeLessThan(90);
    expect(draft.hoseCount).toBe(4);
    expect(draft.source).toEqual({ kind: 'hydrant', name: 'ÜH Hauptstraße 12' });
    expect(draft.reason).toBe('nächster Überflurhydrant, 100 mm');
    expect(result.drafts?.[0]).toBe(draft);
  });

  it('matches the source name case insensitively and partially', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);
    (deps.proposeHoseLineDrafts as any).mockClear();

    const result = await executeToolCall(
      call('proposeHoseLine', { sourceName: 'hauptstrasse' }),
      deps
    );
    expect(result.success).toBe(false);

    const hit = await executeToolCall(
      call('proposeHoseLine', { sourceName: 'hauptstraße' }),
      deps
    );
    expect(hit.success).toBe(true);
  });

  it('accepts an explicit source position without a previous search', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('proposeHoseLine', {
        sourcePosition: { lat: einsatzort.lat + metersToLat(100), lng: einsatzort.lng },
        dimension: 'C',
        name: 'Angriffsleitung',
      }),
      deps
    );

    expect(result.success).toBe(true);
    const [draft]: HoseLineDraft[] = (deps.proposeHoseLineDrafts as any).mock
      .calls[0][0];
    expect(draft.name).toBe('Angriffsleitung');
    expect(draft.dimension).toBe('C');
    expect(draft.source).toBeUndefined();
  });

  it('fails when neither a known source name nor a position is given', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(call('proposeHoseLine', {}), deps);

    expect(result.success).toBe(false);
    expect(deps.proposeHoseLineDrafts).not.toHaveBeenCalled();
  });

  it('fails when the named source was never returned by a search', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);
    (deps.proposeHoseLineDrafts as any).mockClear();

    const result = await executeToolCall(
      call('proposeHoseLine', { sourceName: 'Hydrant Marktplatz' }),
      deps
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Hydrant Marktplatz');
    expect(deps.proposeHoseLineDrafts).not.toHaveBeenCalled();
  });

  it('replaces the draft the search proposed', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);

    await executeToolCall(
      call('proposeHoseLine', { sourceName: 'Seegasse', dimension: 'C' }),
      deps
    );

    const calls = (deps.proposeHoseLineDrafts as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].map((d: HoseLineDraft) => d.source?.name)).toEqual([
      'ÜH Hauptstraße 12',
      'UH Seegasse 3',
    ]);
    expect(calls[1][0]).toHaveLength(1);
    expect(calls[1][0][0].source.name).toBe('UH Seegasse 3');
    expect(calls[1][0][0].dimension).toBe('C');
  });

  it('targets the automatic origin by default', async () => {
    const deps = makeDeps();
    await executeToolCall(call('searchWaterSupply'), deps);
    (deps.resolveOrigin as any).mockClear();

    await executeToolCall(
      call('proposeHoseLine', { sourceName: 'ÜH Hauptstraße 12' }),
      deps
    );

    expect(deps.resolveOrigin).toHaveBeenCalledWith({ type: 'auto' });
  });
});
