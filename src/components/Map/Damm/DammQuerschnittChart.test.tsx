// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../common/geo';
import type { Line } from '../../firebase/firestore';
import { dammbauView } from '../../FirecallItems/elements/damm/sandsack';
import { renderWithIntl } from '../../../test-utils/intlRender';
import DammQuerschnittChart from './DammQuerschnittChart';

const start: LatLngPosition = [47.9482, 16.8482];
const ende: LatLngPosition = [47.9482 + 100 / 111_320, 16.8482];

const view = (overrides: Partial<Line> = {}) =>
  dammbauView({
    type: 'line',
    name: 'Uferstraße',
    dammbau: 'true',
    positions: JSON.stringify([start, ende]),
    ...overrides,
  } as Line)!;

/** Die Rechtecke der Sacklagen — der Umriss selbst ist ein `path`. */
const saeckeImBild = () =>
  document.querySelectorAll('svg rect[stroke-width="0.4"]').length;

describe('DammQuerschnittChart', () => {
  it('beschriftet Krone, Basis und Höhe mit den gerechneten Maßen', () => {
    renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 1, dammBoeschung: 3 })} />
    );

    expect(screen.getByLabelText('Querschnitt des Dammes')).toBeInTheDocument();
    expect(screen.getByText(/^Krone 0\.50 m$/)).toBeInTheDocument();
    expect(screen.getByText(/^Basis 3\.00 m$/)).toBeInTheDocument();
    expect(screen.getByText('1.00 m')).toBeInTheDocument();
  });

  it('macht eine flachere Böschung als breitere Basis sichtbar', () => {
    const { unmount } = renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 1, dammBoeschung: 2 })} />
    );
    expect(screen.getByText(/^Basis 2\.00 m$/)).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 1, dammBoeschung: 4 })} />
    );
    expect(screen.getByText(/^Basis 4\.00 m$/)).toBeInTheDocument();
  });

  it('zeichnet den einreihigen Wall ohne Böschung', () => {
    renderWithIntl(
      <DammQuerschnittChart
        view={view({ dammHoehe: 0.4, dammBauweise: 'einfach' })}
      />
    );
    // Basis wie Krone: eine Sacklänge
    expect(screen.getByText(/^Basis 0\.50 m$/)).toBeInTheDocument();
    expect(screen.getByText(/^Krone 0\.50 m$/)).toBeInTheDocument();
  });

  it('zeichnet den Dammbalken-Ersatz zwei Sacklängen tief', () => {
    renderWithIntl(
      <DammQuerschnittChart
        view={view({ dammHoehe: 0.8, dammBauweise: 'dammbalken' })}
      />
    );
    expect(screen.getByText(/^Basis 1\.00 m$/)).toBeInTheDocument();
  });

  it('nennt den Wasserstand und das Freibord', () => {
    renderWithIntl(
      <DammQuerschnittChart
        view={view({ dammHoehe: 1, freibord: 0.3 })}
      />
    );
    expect(screen.getByText(/Wasserseite · 0\.70 m/)).toBeInTheDocument();
    expect(screen.getByText(/Freibord 0\.30/)).toBeInTheDocument();
  });

  it('zeichnet die Sacklagen einzeln', () => {
    renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 0.5 })} />
    );
    // 5 Lagen à 10 cm, unten breiter als oben
    expect(saeckeImBild()).toBeGreaterThan(5);
  });

  it('lässt die Lagen weg, wenn es zu viele für ein Bild sind', () => {
    renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 4 })} />
    );
    expect(saeckeImBild()).toBe(0);
    expect(
      screen.getByText(/nicht mehr einzeln dargestellt/)
    ).toBeInTheDocument();
  });

  it('zeichnet nichts ohne Höhe', () => {
    const { container } = renderWithIntl(
      <DammQuerschnittChart view={view({ dammHoehe: 0 })} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
