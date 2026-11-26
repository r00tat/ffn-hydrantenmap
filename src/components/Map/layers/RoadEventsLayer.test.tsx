// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

const handlers = new Map<string, Set<(event: unknown) => void>>();

const fakeMap = {
  getBounds: () => ({
    getSouth: () => 47.9,
    getWest: () => 16.8,
    getNorth: () => 48.0,
    getEast: () => 16.9,
  }),
  on: (name: string, fn: (event: unknown) => void) => {
    const set = handlers.get(name) ?? new Set();
    set.add(fn);
    handlers.set(name, set);
  },
  off: (name: string, fn: (event: unknown) => void) => {
    handlers.get(name)?.delete(fn);
  },
  // Gerade Projektion: 1 Grad = 1000 px.
  latLngToContainerPoint: ([lat, lng]: [number, number]) => ({
    x: lng * 1000,
    y: -lat * 1000,
  }),
};

const fire = (name: string, event: unknown) => {
  act(() => {
    for (const fn of handlers.get(name) ?? []) fn(event);
  });
};

vi.mock('react-leaflet', () => ({
  useMap: () => fakeMap,
  LayerGroup: ({
    children,
    attribution,
  }: {
    children?: React.ReactNode;
    attribution?: string;
  }) => (
    <div data-testid="layergroup" data-attribution={attribution ?? ''}>
      {children}
    </div>
  ),
  Polyline: ({
    eventHandlers,
  }: {
    eventHandlers: { click: (e: unknown) => void };
  }) => (
    <button
      data-testid="line"
      onClick={() =>
        eventHandlers.click({
          latlng: [47.13, 10.2],
          containerPoint: { x: 10200, y: -47130 },
          originalEvent: new MouseEvent('click'),
        })
      }
    />
  ),
  CircleMarker: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
}));

vi.mock('./RoadEventsAction', () => ({
  fetchRoadEvents: vi.fn(async () => ({
    configured: true,
    // Wie am Arlberg: Sperre und Baustelle auf demselben Abschnitt.
    events: [
      {
        key: 'c',
        id: 'sperre',
        kind: 'closure',
        description: 'Tunnel Arlberg gesperrt',
        path: [
          [47.13, 10.1],
          [47.13, 10.3],
        ],
      },
      {
        key: 'r',
        id: 'baustelle',
        kind: 'restriction',
        description: 'veränderte Verkehrsführung im Baustellenbereich',
        path: [
          [47.13, 10.12],
          [47.13, 10.31],
        ],
      },
    ],
    failedFeeds: [],
  })),
}));

vi.mock('../../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../firebase/crashlytics', () => ({ recordError: vi.fn() }));

import RoadEventsLayer, { ROAD_EVENTS_LAYER_NAME } from './RoadEventsLayer';

describe('RoadEventsLayer', () => {
  beforeEach(() => handlers.clear());

  it('nennt die Quellen nur, solange die Ebene eingeschaltet ist', async () => {
    renderWithIntl(<RoadEventsLayer />);
    const group = () => screen.getByTestId('layergroup');

    // Ausgeschaltet: react-leaflet trüge die Attribution sonst dauerhaft ein.
    expect(group().dataset.attribution).toBe('');

    fire('overlayadd', { name: ROAD_EVENTS_LAYER_NAME });
    expect(group().dataset.attribution).toContain('ASFINAG');
    expect(group().dataset.attribution).toContain('<a ');

    fire('overlayremove', { name: ROAD_EVENTS_LAYER_NAME });
    expect(group().dataset.attribution).toBe('');
  });

  it('reagiert nicht auf andere Overlays', () => {
    renderWithIntl(<RoadEventsLayer />);
    fire('overlayadd', { name: 'Stromausfälle' });
    expect(screen.getByTestId('layergroup').dataset.attribution).toBe('');
  });

  it('zeigt beim Klick alle übereinanderliegenden Meldungen', async () => {
    renderWithIntl(<RoadEventsLayer />);
    fire('overlayadd', { name: ROAD_EVENTS_LAYER_NAME });
    const lines = await screen.findAllByTestId('line');
    expect(lines).toHaveLength(2);

    // Die Sperre liegt oben; ein Klick auf sie muss die Baustelle mitzeigen.
    fireEvent.click(lines[1]);
    await waitFor(() => expect(screen.getByTestId('popup')).toBeTruthy());
    const popup = screen.getByTestId('popup').textContent ?? '';
    expect(popup).toContain('Tunnel Arlberg gesperrt');
    expect(popup).toContain('Baustellenbereich');
    expect(popup.indexOf('gesperrt')).toBeLessThan(
      popup.indexOf('Baustellenbereich')
    );
  });
});
