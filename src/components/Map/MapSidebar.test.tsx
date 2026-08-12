// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MapEditorContext,
  type MapEditorOptions,
} from '../../hooks/useMapEditor';
import { renderWithIntl } from '../../test-utils/intlRender';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));

// Die Unterpanels hängen an Firestore-Listenern und tragen zur Frage, ob der
// Bearbeiten-Knopf erscheint, nichts bei.
vi.mock('./SidebarAddItemPanel', () => ({ default: () => null }));
vi.mock('./SidebarDiaryPreview', () => ({ default: () => null }));
vi.mock('./SidebarFirecallSummary', () => ({ default: () => null }));
vi.mock('../../hooks/useFirecallItemUpdate', () => ({
  default: () => vi.fn(),
}));
vi.mock('../firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(async () => ''),
  getBlob: vi.fn(async () => new Blob()),
  listAll: vi.fn(async () => ({ items: [], prefixes: [] })),
  uploadBytesResumable: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

const { default: MapSidebar } = await import('./MapSidebar');

function renderSidebar(options: Partial<MapEditorOptions> = {}) {
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
      <MapSidebar />
    </MapEditorContext.Provider>
  );
}

describe('MapSidebar', () => {
  it('offers to enable editing for a user with write access', () => {
    renderSidebar();

    expect(
      screen.getByRole('button', { name: 'Bearbeiten aktivieren' })
    ).toBeVisible();
  });

  it('hides the edit button for a read-only guest', () => {
    // Der Knopf war für Nur-Lese-Gäste sichtbar, aber wirkungslos: der Provider
    // erzwingt `editable: false`, der Klick lief ins Leere.
    renderSidebar({ canWrite: false });

    expect(
      screen.queryByRole('button', { name: 'Bearbeiten aktivieren' })
    ).toBeNull();
  });

  it('tells a read-only guest why there is nothing to do here', () => {
    renderSidebar({ canWrite: false });

    expect(
      screen.getByText(
        'Nur Lesezugriff — Änderungen sind für diesen Zugang nicht möglich.'
      )
    ).toBeVisible();
    expect(
      screen.queryByText(/Aktiviere den Bearbeitungsmodus/)
    ).toBeNull();
  });

  it('hides the edit button in history mode', () => {
    renderSidebar({ historyModeActive: true });

    expect(
      screen.queryByRole('button', { name: 'Bearbeiten aktivieren' })
    ).toBeNull();
  });
});
