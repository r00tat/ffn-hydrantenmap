import { describe, expect, it } from 'vitest';
import type { FirecallLayers } from '../../../hooks/useFirecallLayers';
import type { FirecallItem } from '../../firebase/firestore';
import {
  BASE_OVERLAY_NAME,
  isItemVisible,
  isOverlayVisible,
  layerOverlayName,
  visibleItems,
} from './visibleItems';

const layers = {
  l1: { id: 'l1', name: 'Gefahr', type: 'layer' },
  l2: { id: 'l2', name: 'Versteckt', type: 'layer', defaultVisible: 'false' },
} as unknown as FirecallLayers;

const item = (layer?: string): FirecallItem =>
  ({ id: `i-${layer ?? 'ohne'}`, name: 'x', type: 'marker', layer }) as FirecallItem;

describe('isOverlayVisible', () => {
  it('nimmt die Vorbelegung, solange keine Meldung kam', () => {
    expect(isOverlayVisible('Einsatz', {}, true)).toBe(true);
    expect(isOverlayVisible('Einsatz', {}, false)).toBe(false);
  });

  it('lässt eine Meldung die Vorbelegung schlagen', () => {
    expect(isOverlayVisible('Einsatz', { Einsatz: false }, true)).toBe(false);
  });
});

describe('isItemVisible', () => {
  it('hängt ein Objekt ohne Ebene an die Überlagerung „Einsatz"', () => {
    expect(isItemVisible(item(), layers, {})).toBe(true);
    expect(
      isItemVisible(item(), layers, { [BASE_OVERLAY_NAME]: false })
    ).toBe(false);
  });

  it('behandelt eine verwaiste Ebene wie kein Ebene', () => {
    // Die Ebene wurde gelöscht, das Objekt trägt ihre ID noch.
    expect(
      isItemVisible(item('weg'), layers, { [BASE_OVERLAY_NAME]: false })
    ).toBe(false);
  });

  it('folgt der Ebene, wenn sie ausgeblendet wird', () => {
    expect(isItemVisible(item('l1'), layers, {})).toBe(true);
    expect(
      isItemVisible(item('l1'), layers, { [layerOverlayName('Gefahr')]: false })
    ).toBe(false);
  });

  it('achtet auf eine Ebene, die von Haus aus aus ist', () => {
    expect(isItemVisible(item('l2'), layers, {})).toBe(false);
    expect(
      isItemVisible(item('l2'), layers, {
        [layerOverlayName('Versteckt')]: true,
      })
    ).toBe(true);
  });
});

describe('visibleItems', () => {
  it('lässt nur durch, was die Karte auch zeigt', () => {
    const result = visibleItems(
      [item(), item('l1'), item('l2')],
      layers,
      { [layerOverlayName('Gefahr')]: false }
    );
    expect(result.map((entry) => entry.id)).toEqual(['i-ohne']);
  });
});
