import { describe, expect, it } from 'vitest';
import { buildAiContext } from './contextBuilder';

const basis = {
  map: null,
  defaultPosition: { lat: 47.9, lng: 16.8 },
  existingItems: [],
  isPositionSet: false,
  position: { lat: 0, lng: 0 },
  interactions: [],
};

describe('buildAiContext — Atemschutztrupps', () => {
  it('lässt den Abschnitt weg, solange es keine Trupps gibt', () => {
    // Der Kontext geht bei jedem Zug hinaus; wo kein Atemschutz läuft, soll
    // er nicht wachsen.
    expect(buildAiContext(basis)).not.toHaveProperty('atemschutzTrupps');
    expect(buildAiContext({ ...basis, trupps: [] })).not.toHaveProperty('atemschutzTrupps');
  });

  it('nimmt die Trupps auf, wenn es welche gibt', () => {
    const trupp = {
      name: 'Trupp 1',
      feuerwehr: 'Musterdorf',
      mitglieder: ['Max Huber'],
      status: 'imEinsatz' as const,
      amZiel: false,
      rueckzug: false,
    };
    expect(buildAiContext({ ...basis, trupps: [trupp] }).atemschutzTrupps).toEqual([trupp]);
  });
});

describe('buildAiContext — Ebenen', () => {
  const layers = [
    {
      id: 'l1',
      type: 'layer',
      name: 'Strahlenmessung',
      dataSchema: [
        { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' as const },
      ],
    },
    { id: 'l2', type: 'layer', name: 'Gelöscht', deleted: true },
  ];

  it('lässt Ebenen und aktive Ebene weg, solange es keine gibt', () => {
    const context = buildAiContext(basis);
    expect(context).not.toHaveProperty('layers');
    expect(context).not.toHaveProperty('activeLayer');
  });

  it('nennt die Ebenen mit Feldern und die aktive beim Namen', () => {
    const context = buildAiContext({ ...basis, layers, activeLayerId: 'l1' });
    expect(context.layers).toEqual([
      {
        id: 'l1',
        name: 'Strahlenmessung',
        fields: [{ key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' }],
        measurements: 0,
      },
    ]);
    expect(context.activeLayer).toBe('Strahlenmessung');
  });

  it('nennt keine aktive Ebene, die es nicht mehr gibt', () => {
    expect(buildAiContext({ ...basis, layers, activeLayerId: 'l2' })).not.toHaveProperty(
      'activeLayer',
    );
  });
});

describe('buildAiContext — Überblick statt aller Elemente', () => {
  const messebene = {
    id: 'mess',
    type: 'layer',
    name: 'Strahlenmessung',
    dataSchema: [
      { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' as const },
    ],
  };
  const punkt = (id: string, created: string, wert: number) => ({
    id,
    type: 'marker',
    name: `Messung ${id}`,
    layer: 'mess',
    lat: 47.9,
    lng: 16.8,
    created,
    fieldData: { dosisleistung: wert },
  });
  const eintrag = (id: string, datum: string) => ({
    id,
    type: 'diary',
    name: `Eintrag ${id}`,
    beschreibung: 'langer Text',
    datum,
  });
  const existingItems = [
    { id: 'v', type: 'vehicle', name: 'TLFA', fw: 'Neusiedl', lat: 47.9, lng: 16.8, eintreffen: '2026-09-24T10:00:00Z' },
    punkt('p1', '2026-09-24T10:00:00Z', 5),
    punkt('p2', '2026-09-24T10:05:00Z', 40),
    ...Array.from({ length: 7 }, (_, i) => eintrag(`d${i}`, `2026-09-24T0${i}:00:00Z`)),
  ];
  const context = buildAiContext({
    ...basis,
    existingItems: existingItems as never,
    layers: [messebene],
  });

  it('führt benannte Elemente ohne Koordinaten, aber mit ihren Feldern', () => {
    expect(context.existingItems).toEqual([
      { id: 'v', type: 'vehicle', name: 'TLFA', fw: 'Neusiedl', eintreffen: '2026-09-24T10:00:00Z' },
    ]);
  });

  it('fasst Messebenen zusammen statt jeden Punkt zu führen', () => {
    expect(context.layers?.[0]).toMatchObject({
      measurements: 2,
      latest: { id: 'p2', name: 'Messung p2', fieldData: { dosisleistung: 40 } },
    });
  });

  it('zählt alles und nennt nur die jüngsten Tagebucheinträge ohne Text', () => {
    expect(context.itemCounts).toEqual({ vehicle: 1, marker: 2, diary: 7 });
    expect(context.latestDiary.map((e) => e.id)).toEqual(['d6', 'd5', 'd4', 'd3', 'd2']);
    expect(context.latestDiary[0]).not.toHaveProperty('beschreibung');
  });
});
