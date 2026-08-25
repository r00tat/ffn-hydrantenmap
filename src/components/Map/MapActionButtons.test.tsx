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

const { default: MapActionButtons, threeDFabBottom } = await import(
  './MapActionButtons'
);

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
  /* Nur, was die Komponente anfasst: den Wechsel des Grundlayers beobachtet
     sie für die 3D-Ansicht, die Ausmaße liest sie erst beim Öffnen. */
  const map = {
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as L.Map;
  return renderWithIntl(
    <MapEditorContext.Provider value={value}>
      <MapActionButtons map={map} />
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

describe('threeDFabBottom', () => {
  it('rückt beim Bearbeiten über den Assistenten', () => {
    expect(threeDFabBottom({ editable: true, canEdit: true })).toBe(224);
  });

  it('rückt ohne Bearbeiten direkt über die Gruppe unten', () => {
    // Suche, Aufzeichnung und Assistent gibt es dann nicht — der Knopf hinge
    // sonst über einer Lücke.
    expect(threeDFabBottom({ editable: false, canEdit: true })).toBe(120);
  });

  it('rückt über den Verlauf-Knopf, auch ohne Schreibrecht', () => {
    expect(
      threeDFabBottom({ editable: false, canEdit: false, historyId: 'h1' })
    ).toBe(120);
  });

  it('rückt ganz nach unten, wenn darunter nichts steht', () => {
    // Nur-Lese-Gast ohne Verlauf: die Gruppe unten rechts bleibt leer.
    expect(threeDFabBottom({ editable: false, canEdit: false })).toBe(64);
  });
});
