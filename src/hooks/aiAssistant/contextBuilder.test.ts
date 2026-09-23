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
