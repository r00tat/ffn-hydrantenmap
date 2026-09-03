// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../../common/geo';

/**
 * Geprüft wird der **Aufruf** an Leaflet, nicht das Bild — dasselbe Vorgehen
 * wie in `WasserstandComponent.test.tsx`. Interessant sind hier die Zahl der
 * Querstriche und ihre Ausrichtung, und die hängen an einer Rechnung, nicht an
 * einer Kachel.
 */
const polylines = vi.hoisted(() => ({ props: [] as any[] }));
const map = vi.hoisted(() => ({
  /** Meter je 100 px — über die Karte gerechnet, hier gestellt. */
  metresPer100px: 1000,
}));

vi.mock('react-leaflet', () => ({
  Polyline: (props: any) => {
    polylines.props.push(props);
    return <div data-testid="polyline" />;
  },
  CircleMarker: (props: any) => <div>{props.children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="label">{children}</div>
  ),
  useMap: () => ({
    getZoom: () => 15,
    containerPointToLatLng: ([x]: [number, number]) => ({
      lat: 47.9,
      lng: 16.8 + x,
    }),
    distance: () => map.metresPer100px,
  }),
  useMapEvent: () => undefined,
}));

const { default: HoseLengthOverlay } = await import('./HoseLengthOverlay');

/** Rund 400 m nach Norden — 20 Schlauchlängen zu 20 m. */
const gerade: LatLngPosition[] = [
  [47.9, 16.8],
  [47.9 + 400 / 111_320, 16.8],
];

describe('HoseLengthOverlay', () => {
  beforeEach(() => {
    polylines.props = [];
    // 10 m je Pixel: Ein 20-m-Schlauch ist damit 2 px — bewusst grob, damit
    // jeder Test seinen Maßstab selbst setzt.
    map.metresPer100px = 1000;
  });

  it('beschriftet Länge und Schlauchzahl', () => {
    map.metresPer100px = 100; // 1 m je Pixel
    render(
      <HoseLengthOverlay positions={gerade} dimension="B" hoseLengthM={20} />
    );
    expect(screen.getByTestId('label')).toHaveTextContent('400 m · 20 × B');
  });

  it('nennt an einer Linie ohne Dimension nur die Länge', () => {
    map.metresPer100px = 100;
    render(<HoseLengthOverlay positions={gerade} />);
    expect(screen.getByTestId('label')).toHaveTextContent('400 m');
    // Ohne Dimension gibt es auch keine Schlauchgrenzen zu zeichnen.
    expect(polylines.props).toHaveLength(0);
  });

  it('zeichnet je Schlauchgrenze einen Querstrich', () => {
    map.metresPer100px = 100; // 1 m je Pixel, ein Schlauch also 20 px
    render(
      <HoseLengthOverlay positions={gerade} dimension="B" hoseLengthM={20} />
    );
    // 20 Schläuche, 19 Grenzen dazwischen.
    expect(polylines.props).toHaveLength(19);
  });

  it('lässt die Striche weg, wenn sie zu dicht stünden', () => {
    // 10 m je Pixel: Ein 20-m-Schlauch wäre 2 px breit. 19 Striche im Abstand
    // von 2 px sind ein Schmierstreifen und keine Auskunft.
    map.metresPer100px = 1000;
    render(
      <HoseLengthOverlay positions={gerade} dimension="B" hoseLengthM={20} />
    );
    expect(polylines.props).toHaveLength(0);
    // Das Etikett bleibt trotzdem — die Länge ist in jedem Maßstab lesbar.
    expect(screen.getByTestId('label')).toHaveTextContent('400 m');
  });

  it('skaliert die Strichlänge mit dem Maßstab', () => {
    map.metresPer100px = 100;
    render(
      <HoseLengthOverlay positions={gerade} dimension="B" hoseLengthM={100} />
    );
    const [[a, b]] = polylines.props.map((p) => p.positions);
    // Der Strich steht senkrecht auf der nach Norden laufenden Leitung: gleiche
    // Breite, verschiedene Länge.
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).not.toBeCloseTo(b[1], 6);

    const feinerMassstab = Math.abs(a[1] - b[1]);
    polylines.props = [];
    map.metresPer100px = 200; // 2 m je Pixel — derselbe Strich in Pixeln
    render(
      <HoseLengthOverlay positions={gerade} dimension="B" hoseLengthM={100} />
    );
    const [[c, d]] = polylines.props.map((p) => p.positions);
    // In Metern doppelt so lang, damit er auf dem Bildschirm gleich bleibt.
    expect(Math.abs(c[1] - d[1])).toBeCloseTo(feinerMassstab * 2, 6);
  });

  it('zeichnet nichts an einer Linie ohne Ausdehnung', () => {
    render(<HoseLengthOverlay positions={[[47.9, 16.8]]} dimension="B" />);
    expect(screen.queryByTestId('label')).not.toBeInTheDocument();
    expect(polylines.props).toHaveLength(0);
  });

  it('gibt die Linienfarbe an die Striche weiter', () => {
    map.metresPer100px = 100;
    render(
      <HoseLengthOverlay
        positions={gerade}
        dimension="B"
        hoseLengthM={100}
        color="#ff0000"
      />
    );
    expect(polylines.props[0].pathOptions).toMatchObject({
      color: '#ff0000',
      // Die Striche sind Beschriftung: Ein Treffer auf ihnen darf nicht als
      // Klick auf die Leitung gelten.
      interactive: false,
    });
  });
});
