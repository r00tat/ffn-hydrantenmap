// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { FirecallItem } from '../firebase/firestore';

// Das Elementregister zieht Firestore, Storage und die Server Actions herein;
// für die Frage, worin die Karte `body()` rendert, zählt nur, dass der Inhalt
// ein Blockelement sein kann — so wie bei einem Marker mit Anhängen.
vi.mock('./elements', () => ({
  getItemInstance: () => ({
    id: 'm1',
    type: 'marker',
    name: 'Gefahrenstelle',
    title: () => 'Marker Gefahrenstelle',
    markerName: () => 'Marker',
    icon: () => undefined,
    info: () => 'Kurzinfo',
    body: () => <div>Anhänge</div>,
    filteredData: () => ({ id: 'm1' }),
  }),
  FirecallVehicle: class {},
}));
vi.mock('./elements/FirecallVehicle', () => ({ FirecallVehicle: class {} }));
vi.mock('../firebase/firebase', () => ({ default: {}, firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'fc1',
  useCrewCountForVehicle: () => 0,
  useAtsCountForVehicle: () => 0,
}));
vi.mock('../../hooks/useFirecallItemUpdate', () => ({ default: () => vi.fn() }));
vi.mock('../../hooks/useMapEditor', () => ({ useMapEditorCanEdit: () => false }));
vi.mock('../../hooks/copyLayer', () => ({ default: vi.fn() }));
vi.mock('../firebase/LayerExportMenu', () => ({ default: () => null }));
vi.mock('./FirecallItemUpdateDialog', () => ({ default: () => null }));

const { default: FirecallItemCard } = await import('./FirecallItemCard');

const marker = {
  id: 'm1',
  type: 'marker',
  name: 'Gefahrenstelle',
} as FirecallItem;

describe('FirecallItemCard', () => {
  /**
   * `body()` eines Markers enthält die Anhangsgalerie, also `div`-Elemente.
   * Steckt sie in einer `Typography` ohne `component="div"`, rendert MUI ein
   * `<p>` darum — ungültiges HTML und ein Hydration-Fehler.
   */
  it('rendert den Inhalt ohne div in einem p', () => {
    const { container } = render(<FirecallItemCard item={marker} />);

    expect(container.querySelector('p div')).toBeNull();
    expect(container.textContent).toContain('Anhänge');
  });
});
