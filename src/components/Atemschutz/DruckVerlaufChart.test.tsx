// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { berechneStand } from '../../common/atemschutzUeberwachung';
import { renderWithIntl } from '../../test-utils/intlRender';

/**
 * `@mui/x-charts` misst im Browser seine Breite und braucht dafür einen
 * ResizeObserver, den es in JSDOM nicht gibt — dieselbe Mock-Bauweise wie in
 * `Dosimetrie.test.tsx` und der Fahrtenbuch-Statistik. Geprüft wird damit
 * ausdrücklich die **Verdrahtung**: welche Werte als Reihen hineingehen und
 * welche Marken gezeichnet werden. Wie MUI daraus Pixel macht, ist nicht Sache
 * dieses Tests; die Geometrie steckt in `druckVerlaufModell`.
 */
interface Reihe {
  id?: string;
  data: (number | null)[];
  showMark?: boolean;
}

interface ChartProps {
  series: Reihe[];
  xAxis: { min?: Date; max?: Date }[];
  yAxis: { min?: number; max?: number }[];
  children?: ReactNode;
}

vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ series, xAxis, yAxis, children }: ChartProps) => (
    <div
      data-testid="chart"
      data-series={JSON.stringify(series.map((s) => [s.id, s.data]))}
      data-marks={JSON.stringify(series.map((s) => [s.id, s.showMark]))}
      data-x={JSON.stringify([xAxis[0].min, xAxis[0].max])}
      data-y={JSON.stringify([yAxis[0].min, yAxis[0].max])}
    >
      {children}
    </div>
  ),
}));

vi.mock('@mui/x-charts/ChartsReferenceLine', () => ({
  ChartsReferenceLine: ({ label }: { label?: string }) => (
    <div data-testid="marke">{label}</div>
  ),
}));

const { default: DruckVerlaufChart } = await import('./DruckVerlaufChart');

const ABMARSCH = '2026-09-02T10:00:00.000Z';
const nachAbmarsch = (minuten: number) =>
  new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Huber'],
  status: 'imEinsatz',
  bereitSeit: ABMARSCH,
  abmarschZeit: ABMARSCH,
  druckAbmarsch: 300,
  paTyp: 'standard300',
  abfragen: [
    { zeitpunkt: nachAbmarsch(5).toISOString(), druck: 240, amZiel: true },
  ],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

function render(t: AtemschutzTrupp, minuten: number) {
  const jetzt = nachAbmarsch(minuten);
  const stand = berechneStand(t, jetzt)!;
  renderWithIntl(<DruckVerlaufChart trupp={t} stand={stand} jetzt={jetzt} />);
  return stand;
}

describe('DruckVerlaufChart', () => {
  it('zeichnet Marken für Fristen und Schwellen', () => {
    render(trupp, 10);
    const marken = screen.getAllByTestId('marke').map((x) => x.textContent);
    // 300 → 240 am Ziel: doppelter Vormarschdruckabfall 120 bar.
    expect(marken).toContain('Rückzug 120 bar');
    expect(marken).toContain('Reserve 55 bar');
    expect(marken).toContain('1/3');
    expect(marken).toContain('2/3');
    expect(marken).toContain('rechn. Ende');
    expect(marken).toContain('jetzt');
  });

  it('beschriftet die gemeldeten Ereignisse', () => {
    render(
      {
        ...trupp,
        status: 'zurueck',
        abfragen: [
          { zeitpunkt: nachAbmarsch(5).toISOString(), druck: 240, amZiel: true },
          {
            zeitpunkt: nachAbmarsch(15).toISOString(),
            druck: 140,
            rueckzug: true,
          },
        ],
        rueckkehrZeit: nachAbmarsch(25).toISOString(),
        druckRueckkehr: 80,
      },
      30,
    );
    const marken = screen.getAllByTestId('marke').map((x) => x.textContent);
    expect(marken).toContain('Ankunft');
    expect(marken).toContain('Rückzug');
    expect(marken).toContain('zurück');
  });

  it('zeichnet die Druckabfragen als Punkte', () => {
    // Ohne Punkte ist nicht zu sehen, *wann* abgefragt wurde — der Knick der
    // Linie liegt genau dort.
    render(trupp, 10);
    expect(
      JSON.parse(screen.getByTestId('chart').dataset.marks as string),
    ).toEqual([
      ['gemessen', true],
      ['prognose', false],
    ]);
  });

  it('trennt gemessene Werte von der Fortschreibung', () => {
    render(trupp, 10);
    const reihen = JSON.parse(
      screen.getByTestId('chart').dataset.series as string,
    ) as [string, (number | null)[]][];
    // Drei Stützstellen: Abmarsch, Zielmeldung, Ende der Fortschreibung.
    expect(reihen[0]).toEqual(['gemessen', [300, 240, null]]);
    // Die gestrichelte Reihe beginnt am letzten Messwert und endet an der
    // Schwelle — dazwischen liegt kein zusätzlicher Punkt.
    expect(reihen[1]).toEqual(['prognose', [null, 240, 120]]);
  });

  it('spannt die Achsen über Abmarsch bis zur spätesten Marke, Druck ab 0', () => {
    const stand = render(trupp, 10);
    const chart = screen.getByTestId('chart');
    const [min, max] = JSON.parse(chart.dataset.x as string) as string[];
    expect(new Date(min).toISOString()).toBe(ABMARSCH);
    expect(new Date(max).getTime()).toBeGreaterThanOrEqual(
      new Date(stand.zweiDrittelZeit).getTime(),
    );
    expect(JSON.parse(chart.dataset.y as string)).toEqual([0, 300]);
  });

  it('zeichnet nichts, solange es nur den Abmarsch gibt', () => {
    render({ ...trupp, abfragen: [] }, 3);
    expect(screen.queryByTestId('chart')).toBeNull();
  });
});
