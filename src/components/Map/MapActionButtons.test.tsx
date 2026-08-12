// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type L from 'leaflet';
import { describe, expect, it, vi } from 'vitest';
import {
  MapEditorContext,
  type MapEditorOptions,
} from '../../hooks/useMapEditor';
import { renderWithIntl } from '../../test-utils/intlRender';

// Die übrigen Karten-Buttons hängen an Firestore, Leaflet und dem AI-Assistant
// und tragen zur Frage, ob der Bearbeiten-Umschalter erscheint, nichts bei.
vi.mock('../LiveLocation/LiveLocationFab', () => ({ default: () => null }));
vi.mock('./AddFirecallItem', () => ({ default: () => null }));
vi.mock('./AiAssistantButton', () => ({ default: () => null }));
vi.mock('./RecordButton', () => ({ default: () => null }));
vi.mock('./SearchButton', () => ({ default: () => null }));
vi.mock('../firebase/firestoreHooks', () => ({
  useFirecallItems: () => [],
}));

const { default: MapActionButtons } = await import('./MapActionButtons');

function renderButtons(options: Partial<MapEditorOptions> = {}) {
  const value: MapEditorOptions = {
    canWrite: true,
    editable: false,
    setEditable: vi.fn(),
    saveHistory: vi.fn(),
    saveInProgress: false,
    history: [],
    selectHistory: vi.fn(),
    historyPathSegments: [],
    historyModeActive: false,
    selectFirecallItem: vi.fn(),
    openFirecallItemDialog: vi.fn(),
    editFirecallItemIsOpen: false,
    setEditFirecallItemIsOpen: vi.fn(),
    lastSelectedLayer: '',
    setLastSelectedLayer: vi.fn(),
    ...options,
  };
  return renderWithIntl(
    <MapEditorContext.Provider value={value}>
      <MapActionButtons map={{} as L.Map} />
    </MapEditorContext.Provider>
  );
}

/* Der Umschalter und der History-Knopf teilen sich `aria-label="edit"`,
   deshalb wird hier über das Icon unterschieden. */
describe('MapActionButtons', () => {
  it('offers the edit toggle to a user with write access', () => {
    renderButtons();

    expect(screen.getByTestId('EditIcon')).toBeVisible();
  });

  it('hides the edit toggle for a read-only guest', () => {
    // Der Umschalter war sichtbar, aber wirkungslos: der Provider erzwingt für
    // Nur-Lese-Gäste `editable: false`.
    renderButtons({ canWrite: false });

    expect(screen.queryByTestId('EditIcon')).toBeNull();
    expect(screen.queryByTestId('VisibilityIcon')).toBeNull();
  });

  it('shows the history exit button instead while browsing history', () => {
    renderButtons({ historyId: 'h1', historyModeActive: true });

    expect(screen.getByTestId('HistoryIcon')).toBeVisible();
    expect(screen.queryByTestId('EditIcon')).toBeNull();
  });
});
