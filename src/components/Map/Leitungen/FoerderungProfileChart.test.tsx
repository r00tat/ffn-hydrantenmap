// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  FoerderungPumpMarker,
  FoerderungView,
} from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { renderWithIntl } from '../../../test-utils/intlRender';
import { MAX_CHART_POINTS } from './thinProfile';

/**
 * `@mui/x-charts` misst im Browser seine Breite und braucht dafür einen
 * ResizeObserver, den JSDOM nicht hat — dieselbe Mock-Bauweise wie in
 * `DruckVerlaufChart.test.tsx`. Geprüft wird die **Verdrahtung**: welche Werte
 * als Reihe und Achse hineingehen und welche Pumpenmarken gezeichnet werden.
 * Wie MUI daraus Pixel macht, ist nicht Sache dieses Tests.
 */
interface ChartProps {
  series: { data: number[]; baseline?: number | 'min' | 'max' }[];
  xAxis: { data?: number[] }[];
  yAxis: { min?: number; max?: number }[];
  children?: ReactNode;
}

vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ series, xAxis, yAxis, children }: ChartProps) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series[0].data)}
      data-baseline={String(series[0].baseline)}
      data-x={JSON.stringify(xAxis[0].data)}
      data-y={JSON.stringify([yAxis[0].min, yAxis[0].max])}
    >
      {children}
    </div>
  ),
}));

vi.mock('@mui/x-charts/ChartsReferenceLine', () => ({
  ChartsReferenceLine: ({ label }: { label?: string }) => (
    <div data-testid="pumpe">{label}</div>
  ),
}));

const { default: FoerderungProfileChart } = await import(
  './FoerderungProfileChart'
);

const pumpe = (distance: number): FoerderungPumpMarker => ({
  position: [0, 0],
  distance,
  ausgangsdruck: 8,
});

function view(
  profile: { distance: number; elevation: number }[],
  pumps: FoerderungPumpMarker[] = []
) {
  return { profile, pumps } as FoerderungView;
}

function render(v: FoerderungView) {
  renderWithIntl(<FoerderungProfileChart view={v} />);
}

describe('FoerderungProfileChart', () => {
  it('gibt Strecke und Höhe an die Achsen', () => {
    render(
      view([
        { distance: 0, elevation: 130 },
        { distance: 100, elevation: 138 },
        { distance: 200, elevation: 134 },
      ])
    );
    const chart = screen.getByTestId('chart');
    expect(JSON.parse(chart.dataset.x as string)).toEqual([0, 100, 200]);
    expect(JSON.parse(chart.dataset.series as string)).toEqual([130, 138, 134]);
    // Die Fläche liegt auf der unteren Achsengrenze, nicht auf 0 — sonst wären
    // 130 m über Adria eine 130 m hohe Wand.
    expect(chart.dataset.baseline).toBe('min');
    expect(JSON.parse(chart.dataset.y as string)).toEqual([130, 138]);
  });

  it('spreizt die Höhenachse bei ebener Leitung', () => {
    render(
      view([
        { distance: 0, elevation: 130 },
        { distance: 100, elevation: 130 },
      ])
    );
    const [min, max] = JSON.parse(
      screen.getByTestId('chart').dataset.y as string
    ) as number[];
    expect(max).toBeGreaterThan(min);
  });

  it('zeichnet je Pumpe eine Marke, die Entnahmepumpe benannt', () => {
    render(
      view(
        [
          { distance: 0, elevation: 130 },
          { distance: 400, elevation: 150 },
        ],
        [pumpe(0), pumpe(200)]
      )
    );
    expect(screen.getAllByTestId('pumpe').map((x) => x.textContent)).toEqual([
      'E',
      '1',
    ]);
  });

  it('dünnt ein feines Profil auf die Punktzahl des Diagramms aus', () => {
    render(
      view(
        Array.from({ length: 5000 }, (_, i) => ({
          distance: i * 25,
          elevation: 130 + Math.sin(i / 40) * 10,
        }))
      )
    );
    const punkte = JSON.parse(
      screen.getByTestId('chart').dataset.series as string
    ) as number[];
    expect(punkte.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    expect(punkte.length).toBeGreaterThan(2);
  });

  it('zeichnet nichts bei weniger als zwei Punkten', () => {
    render(view([{ distance: 0, elevation: 130 }]));
    expect(screen.queryByTestId('chart')).toBeNull();
  });
});
