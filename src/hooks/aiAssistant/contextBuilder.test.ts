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
