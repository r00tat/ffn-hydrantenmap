// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Geprüft wird, **was beim Klick auf die Karte passiert**, nicht das Bild.
 *
 * Der Anlass ist ein Fehlerbericht vom Laptop: Seit der laufenden Summe am
 * Zeiger ließ sich kaum noch ein Punkt setzen. Die Beschriftung und die
 * Vorschaulinie liegen in derselben Zeichenebene wie die gesetzten Punkte, und
 * der Klickfänger ließ alles aus dieser Ebene durch — der Klick landete auf der
 * Beschriftung statt auf der Karte.
 */
const leitungen = vi.hoisted(() => ({
  isDrawing: true,
  setIsDrawing: vi.fn(),
  firecallItem: { type: 'connection' } as any,
  setFirecallItem: vi.fn(),
  complete: vi.fn(async () => undefined),
}));

const container = vi.hoisted(() => ({ el: undefined as HTMLElement | undefined }));
const panes = vi.hoisted(() => ({ map: new Map<string, HTMLElement>() }));
const mapEvents = vi.hoisted(() => ({
  handlers: new Map<string, (event: any) => void>(),
}));

vi.mock('./context', () => ({
  useLeitungen: () => leitungen,
}));

vi.mock('../../FirecallItems/elements/connection/HoseLengthOverlay', () => ({
  default: () => <div data-testid="hose-length-overlay" />,
}));

vi.mock('../../FirecallItems/icons', () => ({
  leafletIcons: () => ({ circle: undefined }),
}));

vi.mock('react-leaflet', () => ({
  Marker: (props: any) => <div data-testid="point" />,
  Polyline: (props: any) => (
    <div data-testid="polyline" data-interactive={String(props.interactive)} />
  ),
  CircleMarker: (props: any) => (
    <div data-testid="circle" data-interactive={String(props.interactive)}>
      {props.children}
    </div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  useMap: () => mapInstance.value,
}));

/** Eine **stabile** Karte: Draw.tsx hängt seine Effekte an ihre Identität. */
const mapInstance = vi.hoisted(() => ({ value: undefined as any }));
mapInstance.value = {
  getPane: (name: string) => panes.map.get(name),
  createPane: (name: string) => {
    const pane = document.createElement('div');
    panes.map.set(name, pane);
    container.el?.appendChild(pane);
    return pane;
  },
  getContainer: () => container.el as HTMLElement,
  containerPointToLatLng: () => ({ lat: 47.9, lng: 16.8 }),
  on: (name: string, handler: (event: any) => void) => {
    mapEvents.handlers.set(name, handler);
  },
  off: (name: string) => {
    mapEvents.handlers.delete(name);
  },
};

const { default: LeitungenDraw } = await import('./Draw');

/** Ein Klick auf `target`, der wie ein echter über den Kartencontainer läuft. */
function clickOn(target: Element) {
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 })
  );
}

describe('LeitungenDraw', () => {
  beforeEach(() => {
    panes.map = new Map();
    mapEvents.handlers = new Map();
    container.el = document.createElement('div');
    document.body.appendChild(container.el);
    leitungen.isDrawing = true;
  });

  it('setzt einen Punkt, wenn auf die Beschriftung in der Zeichenebene geklickt wird', () => {
    render(<LeitungenDraw />);
    const pane = panes.map.get('drawingPane') as HTMLElement;
    const label = document.createElement('div');
    label.className = 'ffn-hose-label';
    pane.appendChild(label);

    act(() => clickOn(label));

    expect(screen.getAllByTestId('point')).toHaveLength(1);
  });

  it('setzt keinen Punkt, wenn auf einen gesetzten Punkt geklickt wird', () => {
    render(<LeitungenDraw />);
    const pane = panes.map.get('drawingPane') as HTMLElement;
    const marker = document.createElement('img');
    marker.className = 'leaflet-marker-icon';
    pane.appendChild(marker);

    act(() => clickOn(marker));

    expect(screen.queryAllByTestId('point')).toHaveLength(0);
  });

  it('zeichnet Vorschaulinie und Beschriftungsträger nicht anklickbar', () => {
    render(<LeitungenDraw />);
    const pane = panes.map.get('drawingPane') as HTMLElement;
    const surface = document.createElement('div');
    pane.appendChild(surface);

    // Ein gesetzter Punkt und ein Zeiger — erst dann gibt es eine Vorschau.
    act(() => clickOn(surface));
    act(() => mapEvents.handlers.get('mousemove')?.({
      latlng: { lat: 47.91, lng: 16.81 },
    }));

    expect(
      screen.getAllByTestId('polyline').map((el) => el.dataset.interactive)
    ).toContain('false');
    expect(
      screen.getAllByTestId('circle').map((el) => el.dataset.interactive)
    ).toContain('false');
  });
});
