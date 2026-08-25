// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../../test-utils/intlRender';
import type { Wasserstand } from '../../../firebase/firestore';

/**
 * Die Eigenschaften, mit denen die Komponente Leaflet aufruft.
 *
 * Geprüft wird der **Aufruf**, nicht das Bild: Der Absturz beim Setzen eines
 * neuen Punktes hing an einer einzelnen Eigenschaft (`pane: undefined`), und
 * genau die ist hier sichtbar.
 */
const marker = vi.hoisted(() => ({ props: undefined as any }));
const polygons = vi.hoisted(() => ({ props: [] as any[] }));

vi.mock('react-leaflet', () => ({
  Marker: (props: any) => {
    marker.props = props;
    return <div data-testid="marker">{props.children}</div>;
  },
  Polygon: (props: any) => {
    polygons.props.push(props);
    return <div data-testid="polygon">{props.children}</div>;
  },
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// `PopupNavigateButton` kommt aus `FirecallItemBase`, und darüber hängt die
// Auth-Kette. Dieselben Absicherungen wie in `FirecallConnection.test.ts`.
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
vi.mock('../../../firebase/firebase', () => ({ firestore: {} }));
vi.mock('../../../../hooks/useFirecallItemUpdate', () => ({
  default: () => async () => undefined,
}));
vi.mock('../../../../hooks/useMapEditor', () => ({
  useMapEditable: () => false,
}));
vi.mock('../../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({ sample: async () => [null] }),
}));
// Das Panel zieht den ganzen Rechner samt Firestore-Hooks herein; hier zählt
// nur, was an Leaflet geht.
vi.mock('../../../Map/Wasserstand/WasserstandPanel', () => ({
  default: () => null,
}));
vi.mock('../../icons', () => ({
  leafletIcons: () => ({ wasserstand: { options: {} } }),
}));

import { FirecallWasserstand } from '../FirecallWasserstand';
import WasserstandComponent from './WasserstandComponent';

const szenario = (overrides: Partial<Wasserstand> = {}) =>
  new FirecallWasserstand({
    id: 'w1',
    type: 'wasserstand',
    name: 'Wulka Nord',
    lat: 47.9483,
    lng: 16.8482,
    wasserBasisHoehe: 115.8,
    wasserZuschlag: 0.5,
    ...overrides,
  } as Wasserstand);

describe('WasserstandComponent', () => {
  it('gibt ohne Pane gar kein `pane` weiter', () => {
    marker.props = undefined;
    renderWithIntl(
      <WasserstandComponent record={szenario()} selectItem={() => {}} />
    );
    // `L.setOptions` kopiert auch ein `pane: undefined` und überschreibt damit
    // die Vorbelegung `markerPane`; `map.getPane(undefined)` ist dann leer und
    // Leaflet stirbt in `appendChild`. Der Schlüssel darf also fehlen.
    expect('pane' in marker.props).toBe(false);
  });

  it('gibt ein gesetztes Pane weiter', () => {
    marker.props = undefined;
    renderWithIntl(
      <WasserstandComponent
        record={szenario()}
        selectItem={() => {}}
        pane="ffnPane3"
      />
    );
    expect(marker.props.pane).toBe('ffnPane3');
  });

  it('zeichnet die Vorschau eines Elements ohne Koordinaten', () => {
    marker.props = undefined;
    const frisch = szenario();
    // So kommt die Vorschau aus `AddFirecallItem`, bevor der Punkt gesetzt ist.
    frisch.lat = undefined as unknown as number;
    frisch.lng = undefined as unknown as number;
    renderWithIntl(
      <WasserstandComponent record={frisch} selectItem={() => {}} />
    );
    const [lat, lng] = marker.props.position as [number, number];
    expect(Number.isFinite(lat)).toBe(true);
    expect(Number.isFinite(lng)).toBe(true);
  });
});
