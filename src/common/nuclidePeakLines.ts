import type { Nuclide } from './strahlenschutz';

export interface NuclidePeakLine {
  key: string;
  label: string;
  energy: number;
  color: string;
}

/**
 * Build reference-line descriptors for the peaks of a user-selected subset of
 * nuclides. Each selected nuclide gets its own color from the palette (cycling
 * by selection order, not by nuclide identity, so duplicate selections or
 * unknown names don't shift the palette index for later entries).
 */
export function buildNuclidePeakLines(
  selectedNames: string[],
  nuclides: Nuclide[],
  palette: string[]
): NuclidePeakLine[] {
  if (palette.length === 0) return [];
  const lines: NuclidePeakLine[] = [];
  selectedNames.forEach((name, idx) => {
    const nuclide = nuclides.find((n) => n.name === name);
    if (!nuclide?.peaks?.length) return;
    const color = palette[idx % palette.length];
    for (const { energy } of nuclide.peaks) {
      lines.push({
        key: `${idx}:${name}:${energy}`,
        label: `${name} (${energy} keV)`,
        energy,
        color,
      });
    }
  });
  return lines;
}
