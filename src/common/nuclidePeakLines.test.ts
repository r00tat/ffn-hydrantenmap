import { describe, it, expect } from 'vitest';
import { buildNuclidePeakLines } from './nuclidePeakLines';
import type { Nuclide } from './strahlenschutz';

const NUCLIDES_FIXTURE: Nuclide[] = [
  { name: 'Cs-137', gamma: 92, peaks: [661.7] },
  { name: 'Co-60', gamma: 351, peaks: [1173.2, 1332.5] },
  { name: 'Sr-90', gamma: 6 }, // no peaks
];

const PALETTE = ['#111', '#222', '#333'];

describe('buildNuclidePeakLines', () => {
  it('returns empty array for empty selection', () => {
    expect(buildNuclidePeakLines([], NUCLIDES_FIXTURE, PALETTE)).toEqual([]);
  });

  it('builds one line per peak for a selected nuclide', () => {
    const lines = buildNuclidePeakLines(['Co-60'], NUCLIDES_FIXTURE, PALETTE);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      energy: 1173.2,
      label: 'Co-60 (1173.2 keV)',
      color: '#111',
    });
    expect(lines[1]).toMatchObject({
      energy: 1332.5,
      label: 'Co-60 (1332.5 keV)',
      color: '#111',
    });
  });

  it('assigns a distinct color per nuclide based on selection order', () => {
    const lines = buildNuclidePeakLines(
      ['Cs-137', 'Co-60'],
      NUCLIDES_FIXTURE,
      PALETTE
    );
    const cs = lines.filter((l) => l.label.startsWith('Cs-137'));
    const co = lines.filter((l) => l.label.startsWith('Co-60'));
    expect(cs[0].color).toBe('#111');
    expect(co[0].color).toBe('#222');
    expect(co[1].color).toBe('#222');
  });

  it('ignores unknown nuclide names', () => {
    const lines = buildNuclidePeakLines(
      ['Does-Not-Exist', 'Cs-137'],
      NUCLIDES_FIXTURE,
      PALETTE
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe('Cs-137 (661.7 keV)');
    // Palette index must still follow the selection order → second slot
    expect(lines[0].color).toBe('#222');
  });

  it('skips nuclides without peaks', () => {
    const lines = buildNuclidePeakLines(['Sr-90'], NUCLIDES_FIXTURE, PALETTE);
    expect(lines).toEqual([]);
  });

  it('produces stable, unique keys per line', () => {
    const lines = buildNuclidePeakLines(
      ['Cs-137', 'Co-60'],
      NUCLIDES_FIXTURE,
      PALETTE
    );
    const keys = lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cycles through the palette when more nuclides than colors', () => {
    const lines = buildNuclidePeakLines(
      ['Cs-137', 'Co-60', 'Cs-137'],
      NUCLIDES_FIXTURE,
      ['#aaa', '#bbb']
    );
    const firstCs = lines.find((l) => l.key.startsWith('0:'));
    const thirdCs = lines.find((l) => l.key.startsWith('2:'));
    expect(firstCs?.color).toBe('#aaa');
    expect(thirdCs?.color).toBe('#aaa');
  });
});
