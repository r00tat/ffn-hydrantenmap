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
    layers: [],
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
    createFahrtenbuchEntry: vi.fn(async () => ({
      success: true,
      message: 'Fahrt eingetragen',
    })),
    getFahrtenbuchCounters: vi.fn(async () => ({
      success: true,
      message: 'RLFA-A: Kilometerstand 1700 km.',
    })),
    runAtemschutzTruppCommand: vi.fn(async () => ({
      success: true,
      message: 'Trupp 1 angelegt',
    })),
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

describe('createFahrtenbuchEntry', () => {
  it('reicht das Gesprochene unverändert weiter', async () => {
    // Was „RLFA" ist und welcher Zähler gemeint war, entscheidet die
    // Gegenseite anhand der Stammdaten der Gruppe. Würde hier schon etwas
    // umgedeutet, stünde die Auflösung an zwei Stellen.
    const createFahrtenbuchEntry = vi.fn(async () => ({
      success: true,
      message: 'Fahrt des RLFA-A eingetragen: Kilometerstand 1723',
    }));
    const deps = makeDeps({ createFahrtenbuchEntry });

    const result = await executeToolCall(
      call('createFahrtenbuchEntry', {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        fahrer: 'ich',
      }),
      deps
    );

    expect(createFahrtenbuchEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        fahrer: 'ich',
      }),
      { confirmDuplicate: false }
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('1723');
    // Eine Fahrt ist kein Kartenelement — „rückgängig" fände sie nie wieder.
    expect(result.createdItemId).toBeUndefined();
  });

  it('bestätigt ein Duplikat nur auf ausdrückliche Ansage', async () => {
    const createFahrtenbuchEntry = vi.fn(async () => ({
      success: true,
      message: 'Fahrt eingetragen',
    }));
    const deps = makeDeps({ createFahrtenbuchEntry });

    await executeToolCall(
      call('createFahrtenbuchEntry', {
        fahrzeug: 'RLFA',
        trotzdemEintragen: true,
      }),
      deps
    );

    expect(createFahrtenbuchEntry).toHaveBeenCalledWith(expect.anything(), {
      confirmDuplicate: true,
    });
  });

  it('gibt eine Rückfrage als Misserfolg zurück', async () => {
    // Der Satz ist die Rückfrage — das Modell liest ihn vor und fragt nach.
    const deps = makeDeps({
      createFahrtenbuchEntry: vi.fn(async () => ({
        success: false,
        message: 'Kein Fahrzeug „Drehleiter" im Fahrtenbuch. Vorhanden sind: KLF.',
      })),
    });

    const result = await executeToolCall(
      call('createFahrtenbuchEntry', { fahrzeug: 'Drehleiter' }),
      deps
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('KLF');
  });
});

describe('getFahrtenbuchCounters', () => {
  it('gibt den Stand als Antwort zurück, nicht als Änderung', () => {
    // Auskunft, keine Aktion: Der Toast zeigt sie als Antwort, und
    // „Rückgängig" hat nichts zurückzunehmen.
    const deps = makeDeps();
    return executeToolCall(
      call('getFahrtenbuchCounters', { fahrzeug: 'RLFA' }),
      deps
    ).then((result) => {
      expect(deps.getFahrtenbuchCounters).toHaveBeenCalledWith('RLFA');
      expect(result.isAnswer).toBe(true);
      expect(result.message).toContain('1700');
      expect(result.createdItemId).toBeUndefined();
    });
  });

  it('fragt ohne Fahrzeugangabe alle Fahrzeuge ab', async () => {
    const deps = makeDeps();
    await executeToolCall(call('getFahrtenbuchCounters'), deps);
    expect(deps.getFahrtenbuchCounters).toHaveBeenCalledWith(undefined);
  });
});

describe('Atemschutztrupps', () => {
  it('reicht das Anlegen als Befehl durch', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('createAtemschutzTrupp', {
        name: 'Trupp 1',
        members: ['Max Huber', 'Anna Gruber'],
        unit: 'RLFA',
      }),
      deps
    );

    expect(deps.runAtemschutzTruppCommand).toHaveBeenCalledWith({
      kind: 'create',
      name: 'Trupp 1',
      members: ['Max Huber', 'Anna Gruber'],
      unit: 'RLFA',
    });
    expect(result.success).toBe(true);
    // Ein Trupp ist kein Kartenelement — „rückgängig" fände ihn nie wieder.
    expect(result.createdItemId).toBeUndefined();
  });

  it('reicht einen Statuswechsel samt Druck und Auftrag durch', async () => {
    const deps = makeDeps();
    await executeToolCall(
      call('setAtemschutzTruppStatus', {
        trupp: 'Trupp 1',
        status: 'imEinsatz',
        pressure: 300,
        mission: 'Menschenrettung',
        target: 'Keller',
      }),
      deps
    );

    expect(deps.runAtemschutzTruppCommand).toHaveBeenCalledWith({
      kind: 'status',
      trupp: 'Trupp 1',
      status: 'imEinsatz',
      pressure: 300,
      mission: 'Menschenrettung',
      target: 'Keller',
    });
  });

  it('lehnt einen unbekannten Zustand ab, ohne zu schreiben', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('setAtemschutzTruppStatus', { trupp: 'Trupp 1', status: 'deployed' }),
      deps
    );

    expect(result.success).toBe(false);
    expect(deps.runAtemschutzTruppCommand).not.toHaveBeenCalled();
  });

  it('reicht eine Meldung samt Bestätigung durch', async () => {
    const deps = makeDeps();
    await executeToolCall(
      call('recordAtemschutzTruppReport', {
        trupp: 'Trupp 1',
        pressure: 260,
        atTarget: true,
        recordAnyway: true,
      }),
      deps
    );

    expect(deps.runAtemschutzTruppCommand).toHaveBeenCalledWith({
      kind: 'report',
      trupp: 'Trupp 1',
      pressure: 260,
      atTarget: true,
      recordAnyway: true,
    });
  });

  it('gibt eine Rückfrage als Misserfolg zurück', async () => {
    const deps = makeDeps({
      runAtemschutzTruppCommand: vi.fn(async () => ({
        success: false,
        message: 'Trupp 1 hatte zuletzt 240 bar, jetzt 260 bar. Soll ich das trotzdem eintragen?',
      })),
    });
    const result = await executeToolCall(
      call('recordAtemschutzTruppReport', { trupp: 'Trupp 1', pressure: 260 }),
      deps
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('trotzdem');
  });
});

describe('createMarker', () => {
  it('legt ohne Art einen Marker an', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('createMarker', { name: 'Absperrung', zeichen: 'Sperre' }),
      deps
    );

    expect(result.success).toBe(true);
    expect(deps.addFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'marker', name: 'Absperrung', zeichen: 'Sperre' })
    );
    expect(result.createdItemType).toBe('marker');
    expect(deps.setLastCreatedItem).toHaveBeenCalledWith({ id: 'new-id', type: 'marker' });
  });

  it.each([
    ['el', 'Einsatzleitung'],
    ['assp', 'ASSP'],
  ])('legt mit kind=%s das eigene Element an', async (kind, label) => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('createMarker', { kind, name: 'Feuerwehrhaus', zeichen: 'x', color: '#f00' }),
      deps
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain(label);
    expect(result.createdItemType).toBe(kind);
    const item = vi.mocked(deps.addFirecallItem).mock.calls[0][0];
    expect(item).toMatchObject({ type: kind, name: 'Feuerwehrhaus', ...einsatzort });
    // Zeichen und Farbe gehören nur zum Marker.
    expect(item).not.toHaveProperty('zeichen');
    expect(item).not.toHaveProperty('color');
    // „Rückgängig" nimmt das Element über lastCreatedItem zurück.
    expect(deps.setLastCreatedItem).toHaveBeenCalledWith({ id: 'new-id', type: kind });
  });

  it('fällt bei einer unbekannten Art auf den Marker zurück', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('createMarker', { kind: 'vehicle', name: 'X' }),
      deps
    );

    expect(result.createdItemType).toBe('marker');
    expect(deps.addFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'marker' })
    );
  });

  it.each(['createEl', 'createAssp'])('kennt %s nicht mehr', async (name) => {
    const result = await executeToolCall(call(name, { name: 'X' }), makeDeps());
    expect(result.success).toBe(false);
  });
});

describe('calculateStrahlenschutz', () => {
  it('rechnet das Abstandsgesetz', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'abstand', d1: 1, r1: 100, d2: 10 }),
      makeDeps()
    );
    expect(result.success).toBe(true);
    expect(result.isAnswer).toBe(true);
    expect(result.data).toMatchObject({ field: 'r2', value: 1, unit: 'µSv/h' });
  });

  it('rechnet den Schutzwert', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'schutzwert', r0: 100, s: 2, n: 2 }),
      makeDeps()
    );
    expect(result.data).toMatchObject({ field: 'r', value: 25 });
  });

  it('rechnet die Aufenthaltszeit', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'aufenthaltszeit', d: 15, r: 5 }),
      makeDeps()
    );
    expect(result.data).toMatchObject({ field: 't', value: 3, unit: 'h' });
  });

  it('rechnet die Dosisleistung eines Nuklids', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'nuklid', nuclide: 'cs-137', activity: 1 }),
      makeDeps()
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ nuclide: 'Cs-137', field: 'doseRate' });
  });

  it('meldet ein fehlendes Nuklid statt abzustürzen', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'nuklid', activity: 1 }),
      makeDeps()
    );
    expect(result.success).toBe(false);
  });

  it('lehnt eine unbekannte Formel ab', async () => {
    const result = await executeToolCall(
      call('calculateStrahlenschutz', { formel: 'foo', d1: 1 }),
      makeDeps()
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('abstand');
  });
});

describe('createVehicle', () => {
  it('nennt die gespeicherte Feuerwehr in der Rückmeldung', async () => {
    const deps = makeDeps();
    const result = await executeToolCall(
      call('createVehicle', { name: 'KLF', fw: 'Weiden' }),
      deps
    );

    expect(deps.addFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'vehicle', name: 'KLF', fw: 'Weiden' })
    );
    expect(result.message).toBe('Fahrzeug "KLF" (Weiden) erstellt');
  });

  it('sagt ohne Feuerwehr auch keine an', async () => {
    // Die Rückmeldung ist, woraus das Modell seine Antwort baut. Nennt sie
    // keine Feuerwehr, darf das Modell auch keine behaupten.
    const result = await executeToolCall(call('createVehicle', { name: 'KLF' }), makeDeps());
    expect(result.message).toBe('Fahrzeug "KLF" ohne Feuerwehr erstellt');
  });
});

describe('executeToolCall — updateItem', () => {
  const fahrzeug = {
    id: 'tlf',
    type: 'vehicle',
    name: 'TLF',
    fw: 'Parndorf',
    lat: 47.9,
    lng: 16.8,
  };

  it('nennt in der Rückmeldung, wohin das Element kam', async () => {
    const resolveOrigin = vi.fn(async () => ({
      lat: 47.95,
      lng: 16.84,
      type: 'nearItem',
      label: '"TLFA 4000"',
    }));
    const updateFirecallItem = vi.fn(async () => {});
    const result = await executeToolCall(
      call('updateItem', {
        itemName: 'TLF',
        updates: {
          position: { type: 'nearItem', itemName: 'TLFA', direction: 'left' },
        },
      }),
      makeDeps({
        existingItems: [fahrzeug] as never,
        resolveOrigin,
        updateFirecallItem,
      }),
    );

    expect(result).toEqual({
      success: true,
      message: '"TLF" links neben "TLFA 4000" gesetzt',
    });
    expect(resolveOrigin).toHaveBeenCalledWith({
      type: 'nearItem',
      itemName: 'TLFA',
      direction: 'left',
      excludeItemId: 'tlf',
    });
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tlf', lat: 47.95, lng: 16.84 }),
    );
  });

  it('sagt, wenn das Bezugselement fehlte', async () => {
    const result = await executeToolCall(
      call('updateItem', {
        itemName: 'TLF',
        updates: {
          position: { type: 'nearItem', itemName: 'RLFA', direction: 'right' },
        },
      }),
      makeDeps({
        existingItems: [fahrzeug] as never,
        resolveOrigin: vi.fn(async () => ({
          lat: 1,
          lng: 2,
          type: 'mapCenter',
          label: 'der Kartenmitte',
        })),
      }),
    );
    expect(result.message).toBe(
      '"TLF" an der Kartenmitte (Element "RLFA" nicht gefunden) gesetzt',
    );
  });

  it('lässt die Position ohne Angabe unverändert', async () => {
    const updateFirecallItem = vi.fn(async () => {});
    const resolveOrigin = vi.fn();
    const result = await executeToolCall(
      call('updateItem', { itemName: 'TLF', updates: { beschreibung: 'Pumpe' } }),
      makeDeps({
        existingItems: [fahrzeug] as never,
        resolveOrigin,
        updateFirecallItem,
      }),
    );
    expect(result.message).toBe('"TLF" aktualisiert');
    expect(resolveOrigin).not.toHaveBeenCalled();
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 47.9, lng: 16.8, beschreibung: 'Pumpe' }),
    );
  });
});

describe('executeToolCall — updateItem dreht', () => {
  const fahrzeug = { id: 'tlf', type: 'vehicle', name: 'TLF', lat: 47.9, lng: 16.8, rotation: '30' };

  const drehe = async (updates: Record<string, unknown>, item: object = fahrzeug) => {
    const updateFirecallItem = vi.fn(async () => {});
    const result = await executeToolCall(
      call('updateItem', { itemName: 'TLF', updates }),
      makeDeps({ existingItems: [item] as never, updateFirecallItem }),
    );
    return { result, updateFirecallItem };
  };

  it('dreht um einen Winkel vom jetzigen aus weiter', async () => {
    const { result, updateFirecallItem } = await drehe({ rotateBy: 45 });
    expect(result).toEqual({ success: true, message: '"TLF" auf 75° gedreht' });
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ rotation: '75', lat: 47.9, lng: 16.8 }),
    );
  });

  it('dreht nach links über 0 hinaus auf den Rest des Vollkreises', async () => {
    const { updateFirecallItem } = await drehe({ rotateBy: -45 });
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ rotation: '345' }),
    );
  });

  it('setzt einen Winkel und nimmt einen fehlenden Winkel als 0', async () => {
    const { updateFirecallItem } = await drehe(
      { rotation: 90 },
      { ...fahrzeug, rotation: undefined },
    );
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ rotation: '90' }),
    );
  });

  it('lehnt die Drehung bei Elementen ab, die die Karte nicht dreht', async () => {
    const { result, updateFirecallItem } = await drehe(
      { rotateBy: 45 },
      { id: 'm', type: 'marker', name: 'TLF-Marker', lat: 1, lng: 2 },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/lässt sich nicht drehen/);
    expect(updateFirecallItem).not.toHaveBeenCalled();
  });
});

describe('Ebenen und Messwerte', () => {
  const strahlen = {
    id: 'l1',
    type: 'layer',
    name: 'Strahlenmessung',
    dataSchema: [
      { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
    ],
  };
  const abschnitt = { id: 'l2', type: 'layer', name: 'Abschnitt Nord' };
  const layers = [strahlen, abschnitt] as never;

  it('legt eine Messung in die aktive Ebene und rechnet die Einheit um', async () => {
    const addFirecallItem = vi.fn(async () => ({ id: 'm1' }));
    const setActiveLayer = vi.fn();
    const result = await executeToolCall(
      call('createMarker', {
        name: 'Messung',
        values: [{ field: 'dosisleistung', value: '37', unit: 'mSv/h' }],
      }),
      makeDeps({ layers, activeLayerId: 'l1', setActiveLayer, addFirecallItem }),
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe(
      'Marker "Messung" in Ebene "Strahlenmessung" erstellt: Dosisleistung 37000 µSv/h',
    );
    expect(addFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'l1', fieldData: { dosisleistung: 37000 } }),
    );
    // Die Ebene war schon aktiv und wurde nicht genannt.
    expect(setActiveLayer).not.toHaveBeenCalled();
  });

  it('macht eine genannte Ebene zur aktiven', async () => {
    const setActiveLayer = vi.fn();
    await executeToolCall(
      call('createMarker', { name: 'Sperre', layer: 'Abschnitt' }),
      makeDeps({ layers, activeLayerId: 'l1', setActiveLayer }),
    );
    expect(setActiveLayer).toHaveBeenCalledWith('l2');
  });

  it('legt nichts an, wenn die Ebene oder ein Feld fehlt', async () => {
    const addFirecallItem = vi.fn(async () => ({ id: 'x' }));
    const deps = makeDeps({ layers, addFirecallItem });

    const ohneEbene = await executeToolCall(
      call('createMarker', { name: 'M', layer: 'Gibtsnicht' }),
      deps,
    );
    expect(ohneEbene.message).toBe(
      'Ebene "Gibtsnicht" nicht gefunden (Ebenen: "Strahlenmessung", "Abschnitt Nord")',
    );

    const ohneAktive = await executeToolCall(
      call('createMarker', { name: 'M', values: [{ field: 'dosisleistung', value: '1' }] }),
      deps,
    );
    expect(ohneAktive.success).toBe(false);
    expect(ohneAktive.message).toMatch(/keine genannt und keine aktiv/);

    const falschesFeld = await executeToolCall(
      call('createMarker', {
        name: 'M',
        layer: 'Strahlenmessung',
        values: [{ field: 'Temperatur', value: '20' }],
      }),
      deps,
    );
    expect(falschesFeld.success).toBe(false);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('ändert einen Messwert am Element in seiner Ebene', async () => {
    const updateFirecallItem = vi.fn(async () => {});
    const messung = {
      id: 'm1',
      type: 'marker',
      name: 'Messung',
      layer: 'l1',
      fieldData: { dosisleistung: 37000 },
    };
    const result = await executeToolCall(
      call('updateItem', {
        itemName: 'Messung',
        updates: { values: [{ field: 'dosisleistung', value: '40', unit: 'µSv/h' }] },
      }),
      makeDeps({ layers, existingItems: [messung] as never, updateFirecallItem }),
    );
    expect(result.message).toBe('"Messung" Werte gesetzt: Dosisleistung 40 µSv/h');
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ fieldData: { dosisleistung: 40 } }),
    );
  });
});

describe('updateItem — Felder des Typs', () => {
  const fahrzeug = { id: 'v1', type: 'vehicle', name: 'KLF', lat: 1, lng: 2 };

  it('setzt Feuerwehr, Besatzung und Eintreffen', async () => {
    const updateFirecallItem = vi.fn(async () => {});
    const result = await executeToolCall(
      call('updateItem', {
        itemName: 'KLF',
        updates: { fw: 'Weiden', besatzung: '1:8', eintreffen: 'jetzt' },
      }),
      makeDeps({ existingItems: [fahrzeug] as never, updateFirecallItem }),
    );
    expect(result.message).toBe('"KLF" geändert: fw, besatzung, eintreffen');
    const saved = (updateFirecallItem.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(saved).toMatchObject({ fw: 'Weiden', besatzung: '8' });
    expect(Number.isNaN(Date.parse(saved.eintreffen as string))).toBe(false);
  });

  it('lehnt ein Feld ab, das der Typ nicht hat, und schreibt nichts', async () => {
    const updateFirecallItem = vi.fn(async () => {});
    const result = await executeToolCall(
      call('updateItem', { itemName: 'KLF', updates: { durchfluss: 400 } }),
      makeDeps({ existingItems: [fahrzeug] as never, updateFirecallItem }),
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/"durchfluss" gibt es bei "KLF" nicht \(änderbar: fw,/);
    expect(updateFirecallItem).not.toHaveBeenCalled();
  });
});

describe('zeitpunkt', () => {
  const now = new Date('2026-09-23T18:00:00Z');

  it('liest jetzt, eine Uhrzeit und ISO', async () => {
    const { zeitpunkt } = await import('./toolHandlers');
    expect(zeitpunkt('jetzt', now)).toBe(now.toISOString());
    const uhrzeit = new Date(zeitpunkt('14:30', now)!);
    expect([uhrzeit.getHours(), uhrzeit.getMinutes()]).toEqual([14, 30]);
    expect(zeitpunkt('2026-09-23T12:00:00Z', now)).toBe('2026-09-23T12:00:00.000Z');
    expect(zeitpunkt('gestern irgendwann', now)).toBeUndefined();
  });
});

describe('findItems', () => {
  it('gibt die Treffer in data zurück und nennt den Bezugspunkt', async () => {
    const result = await executeToolCall(
      call('findItems', { type: 'vehicle', position: { type: 'einsatzort' }, radius: 50 }),
      makeDeps({
        existingItems: [
          { id: 'v', type: 'vehicle', name: 'TLFA', lat: einsatzort.lat, lng: einsatzort.lng },
          { id: 'w', type: 'vehicle', name: 'KLF', lat: einsatzort.lat + metersToLat(500), lng: einsatzort.lng },
        ] as never,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe('1 Treffer in data');
    expect(result.data.items.map((i: { id: string }) => i.id)).toEqual(['v']);
    expect(result.data.origin).toEqual({ type: 'einsatzort', label: 'dem Einsatzort' });
  });

  it('meldet einen Fehler der Abfrage als Misserfolg', async () => {
    const result = await executeToolCall(call('findItems', { layer: 'Süd' }), makeDeps());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Ebene "Süd" nicht gefunden/);
  });
});
