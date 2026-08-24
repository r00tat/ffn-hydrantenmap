// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';
import type { ContourResult } from '../../../common/terrain/terrainTypes';

/**
 * Eine Leaflet-Karte, die der Test steuert: Ausschnitt, Zoomstufe und die
 * Ereignisse, mit denen der Layer ein- und ausgeschaltet wird.
 */
const handlers = new Map<string, Set<(event: unknown) => void>>();
let zoom = 17;

const fakeMap = {
  getZoom: () => zoom,
  getBounds: () => ({
    pad: () => ({
      getSouth: () => 47.94,
      getWest: () => 16.84,
      getNorth: () => 47.95,
      getEast: () => 16.86,
    }),
  }),
  /**
   * Eine gerade Projektion reicht: die Setzung der Beschriftungen rechnet in
   * Bildschirmpixeln, und was sie von der Karte braucht, ist nur ein
   * umkehrbarer Zusammenhang zwischen Koordinate und Pixel.
   */
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({
    x: (lng - 16.84) * 100_000,
    y: (47.95 - lat) * 100_000,
  }),
  containerPointToLatLng: ([x, y]: [number, number]) =>
    [47.95 - y / 100_000, 16.84 + x / 100_000] as [number, number],
  on: (name: string, fn: (event: unknown) => void) => {
    const set = handlers.get(name) ?? new Set();
    set.add(fn);
    handlers.set(name, set);
  },
  off: (name: string, fn: (event: unknown) => void) => {
    handlers.get(name)?.delete(fn);
  },
};

const fire = (name: string, event: unknown) => {
  for (const fn of handlers.get(name) ?? []) fn(event);
};

vi.mock('react-leaflet', () => ({
  useMap: () => fakeMap,
  LayerGroup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="layergroup">{children}</div>
  ),
  Polyline: ({
    positions,
    pathOptions,
  }: {
    positions: unknown[];
    pathOptions: { color: string; weight: number };
  }) => (
    <div
      data-testid="polyline"
      data-points={positions.length}
      data-color={pathOptions.color}
      data-weight={pathOptions.weight}
    />
  ),
  Marker: ({ icon }: { icon: { html: string } }) => (
    <div data-testid="label" dangerouslySetInnerHTML={{ __html: icon.html }} />
  ),
}));

vi.mock('leaflet', () => ({
  default: {
    canvas: () => ({ marker: 'canvas' }),
    divIcon: (options: unknown) => options,
  },
}));

const contours = vi.fn<(...args: unknown[]) => Promise<ContourResult>>();
vi.mock('../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({
    contours: (...args: unknown[]) => contours(...args),
    sample: vi.fn(),
    prefetch: vi.fn(),
    blocks: vi.fn(),
  }),
}));

import HoehenlinienLayer from './HoehenlinienLayer';
import {
  EQUIDISTANCE_STORAGE_KEY,
  HOEHENLINIEN_LAYER_NAME,
} from './hoehenlinien';

const result = (count: number): ContourResult => ({
  lines: Array.from({ length: count }, (_, index) => ({
    heightM: 130 + index,
    points: [
      [47.94, 16.84],
      [47.945, 16.85],
    ] as [number, number][],
    closed: false,
  })),
  level: 'detail',
  resolutionM: 1,
  // Die Spanne ist weiter als die Linien — so kommt sie auch aus dem Worker.
  minM: 129.2,
  maxM: 133.4,
});

const enable = () => fire('overlayadd', { name: HOEHENLINIEN_LAYER_NAME });

beforeEach(() => {
  handlers.clear();
  contours.mockReset();
  contours.mockResolvedValue(result(3));
  zoom = 17;
  window.localStorage.removeItem(EQUIDISTANCE_STORAGE_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(EQUIDISTANCE_STORAGE_KEY);
});

describe('HoehenlinienLayer', () => {
  it('rechnet nichts, solange der Layer aus ist', () => {
    renderWithIntl(<HoehenlinienLayer />);
    // Der Sinn der Lazy-Auswertung: eine gewöhnliche Karte kostet keine
    // Kachel und keine Rechenzeit.
    expect(contours).not.toHaveBeenCalled();
    expect(screen.queryByTestId('polyline')).not.toBeInTheDocument();
  });

  it('fragt nach dem Einschalten genau einmal mit den Kartengrenzen', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    await waitFor(() => expect(contours).toHaveBeenCalledTimes(1));
    expect(contours).toHaveBeenCalledWith(
      { south: 47.94, west: 16.84, north: 47.95, east: 16.86 },
      // Zoom 17 ⇒ 1 m Äquidistanz.
      1
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('polyline')).toHaveLength(3)
    );
  });

  it('sagt es, wenn für den Ausschnitt keine Höhendaten vorliegen', async () => {
    contours.mockResolvedValue({ lines: [] });
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    // Ein leerer Layer ohne Hinweis wäre von „noch nicht geladen" nicht zu
    // unterscheiden.
    await waitFor(() =>
      expect(
        screen.getByText(/keine Höhendaten vor/)
      ).toBeInTheDocument()
    );
    expect(screen.queryByTestId('polyline')).not.toBeInTheDocument();
  });

  it('meldet einen Fehlschlag statt still leer zu bleiben', async () => {
    contours.mockRejectedValue(new Error('Worker tot'));
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    await waitFor(() =>
      expect(
        screen.getByText(/konnten nicht berechnet werden/)
      ).toBeInTheDocument()
    );
  });

  it('fragt mit dem neuen Wert nach, wenn die Äquidistanz gewählt wird', async () => {
    const user = userEvent.setup();
    renderWithIntl(<HoehenlinienLayer />);
    enable();
    await waitFor(() => expect(contours).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '5 m' }));

    await waitFor(() => expect(contours).toHaveBeenCalledTimes(2));
    expect(contours).toHaveBeenLastCalledWith(expect.anything(), 5);
    // Die Wahl überlebt den nächsten Kartenaufruf.
    expect(window.localStorage.getItem(EQUIDISTANCE_STORAGE_KEY)).toBe('5');
  });

  it('nimmt eine gespeicherte Wahl statt der Zoomstufe', async () => {
    window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, '10');
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    await waitFor(() =>
      expect(contours).toHaveBeenCalledWith(expect.anything(), 10)
    );
  });

  it('weist Rasterweite und Stufe der Linien aus', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    // Eine Linie aus der Übersichtsstufe sieht genauso genau aus wie eine aus
    // der Detailstufe — deshalb steht es dabei.
    await waitFor(() =>
      expect(screen.getByText(/Raster 1 m/)).toBeInTheDocument()
    );
    expect(screen.getByText(/Stufe Detail/)).toBeInTheDocument();
  });

  it('nennt die Datenquelle, weil die Lizenz es verlangt', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();
    await waitFor(() =>
      expect(
        screen.getByText(/Bundesamt für Eich- und Vermessungswesen/)
      ).toBeInTheDocument()
    );
  });

  it('rechnet nach dem Verschieben der Karte neu', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();
    await waitFor(() => expect(contours).toHaveBeenCalledTimes(1));

    zoom = 15;
    fire('moveend', {});

    await waitFor(() => expect(contours).toHaveBeenCalledTimes(2));
    // Zoom 15 ⇒ 5 m Äquidistanz.
    expect(contours).toHaveBeenLastCalledWith(expect.anything(), 5);
  });

  it('verwirft eine überholte Antwort', async () => {
    let resolveFirst: (value: ContourResult) => void = () => {};
    contours.mockImplementationOnce(
      () =>
        new Promise<ContourResult>((resolve) => {
          resolveFirst = resolve;
        })
    );
    contours.mockResolvedValueOnce(result(2));

    renderWithIntl(<HoehenlinienLayer />);
    enable();
    await waitFor(() => expect(contours).toHaveBeenCalledTimes(1));

    zoom = 15;
    fire('moveend', {});
    await waitFor(() => expect(contours).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByTestId('polyline')).toHaveLength(2)
    );

    // Jetzt trifft die alte Antwort ein. Sie gehört zu einem Ausschnitt, der
    // nicht mehr zu sehen ist, und darf die neuere nicht verdrängen.
    resolveFirst(result(7));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getAllByTestId('polyline')).toHaveLength(2);
  });

  it('beschriftet die Zähllinien mit ihrer Höhe', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    // Höhen 130, 131, 132 bei 1 m Äquidistanz: Zähllinien stehen alle 5 m,
    // also ist nur die 130 eine. Wäre jede Linie beschriftet, stünden bei
    // 0,5 m Äquidistanz dutzende Zahlen übereinander.
    await waitFor(() =>
      expect(screen.getAllByText('130').length).toBeGreaterThan(0)
    );
    expect(screen.queryByText('131')).not.toBeInTheDocument();
    expect(screen.queryByText('132')).not.toBeInTheDocument();
  });

  it('gibt der tiefsten und der höchsten Linie verschiedene Farben', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    await waitFor(() =>
      expect(screen.getAllByTestId('polyline')).toHaveLength(3)
    );
    const farben = screen
      .getAllByTestId('polyline')
      .map((el) => el.getAttribute('data-color'));
    expect(new Set(farben).size).toBe(3);
  });

  it('beschriftet die Enden der Farbrampe in Metern', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();

    // Ohne diese beiden Zahlen ist die Farbe eine Ordnung ohne Werte: die
    // Rampe ist auf den Ausschnitt gedehnt, nicht auf eine feste Spanne.
    await waitFor(() =>
      expect(screen.getByText('129,2 m')).toBeInTheDocument()
    );
    expect(screen.getByText('133,4 m')).toBeInTheDocument();
    expect(
      screen.getByText('Farbe nach Höhe im Ausschnitt')
    ).toBeInTheDocument();
  });

  it('hört auf zu zeichnen, wenn der Layer abgeschaltet wird', async () => {
    renderWithIntl(<HoehenlinienLayer />);
    enable();
    await waitFor(() =>
      expect(screen.getAllByTestId('polyline')).toHaveLength(3)
    );

    fire('overlayremove', { name: HOEHENLINIEN_LAYER_NAME });
    await waitFor(() =>
      expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
    );
  });
});
