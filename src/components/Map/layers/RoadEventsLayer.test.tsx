// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
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
  Polyline: () => null,
  CircleMarker: () => null,
  Popup: () => null,
}));

vi.mock('./RoadEventsAction', () => ({
  fetchRoadEvents: vi.fn(async () => ({
    configured: true,
    events: [],
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
});
