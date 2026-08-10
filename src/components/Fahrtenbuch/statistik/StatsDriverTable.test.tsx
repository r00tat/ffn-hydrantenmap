// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriverStat } from '../../../common/fahrtenbuchStatsSeries';
import { renderWithIntl } from '../../../test-utils/intlRender';
import StatsDriverTable from './StatsDriverTable';

function driver(partial: Partial<DriverStat>): DriverStat {
  return {
    key: 'p1',
    name: 'Max Muster',
    trips: 1,
    durationMinutes: 60,
    counterTotals: {},
    vehicleCount: 1,
    defects: 0,
    zwecke: { einsatz: 1, uebung: 0, versorgung: 0, sonstiges: 0 },
    ...partial,
  };
}

const drivers = [
  driver({
    key: 'p1',
    name: 'Max Muster',
    trips: 5,
    counterTotals: { km: 120 },
    lastEntryAt: '2026-03-14T09:00:00.000Z',
  }),
  driver({
    key: 'p2',
    name: 'Eva Beispiel',
    trips: 2,
    counterTotals: { km: 300, h: 4 },
    lastEntryAt: '2026-05-02T09:00:00.000Z',
  }),
];

/** Die Fahrernamen in der Reihenfolge der Tabellenzeilen. */
function rowNames(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
}

describe('StatsDriverTable', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  /**
   * Nur Reacts Key-Warnung, nicht jede Konsolenausgabe: Die Testumgebung meldet
   * daneben eine fehlende Zeitzonen-Vorgabe von next-intl, die mit dieser
   * Komponente nichts zu tun hat.
   */
  const keyWarnings = () =>
    consoleError.mock.calls.filter((call: unknown[]) =>
      call.some(
        (arg: unknown) =>
          typeof arg === 'string' && arg.includes('unique "key"'),
      ),
    );

  it('rendert die Kopfzeile ohne React-Warnung über fehlende Keys', () => {
    // Die Einheitenspalten entstehen aus einer Schleife. Ohne `key` an der
    // Zelle warnt React auf der Konsole — im Browser sichtbar, im Test nur so.
    renderWithIntl(<StatsDriverTable drivers={drivers} units={['km', 'h']} />);

    expect(keyWarnings()).toEqual([]);
    expect(screen.getByRole('columnheader', { name: 'km' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'h' })).toBeInTheDocument();
  });

  it('sortiert zunächst nach Fahrten, absteigend', () => {
    renderWithIntl(<StatsDriverTable drivers={drivers} units={['km']} />);
    expect(rowNames()).toEqual(['Max Muster', 'Eva Beispiel']);
  });

  it('sortiert auf Klick nach der Einheitenspalte', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StatsDriverTable drivers={drivers} units={['km']} />);

    // 300 km vor 120 km — „Top Fahrer" ist je nach Spalte eine andere Frage.
    await user.click(screen.getByRole('button', { name: 'km' }));
    expect(rowNames()).toEqual(['Eva Beispiel', 'Max Muster']);

    // Erneuter Klick dreht die Richtung.
    await user.click(screen.getByRole('button', { name: 'km' }));
    expect(rowNames()).toEqual(['Max Muster', 'Eva Beispiel']);
  });

  it('meldet einen Klick auf eine Zeile mit dem Fahrerschlüssel', async () => {
    const user = userEvent.setup();
    const onDriverClick = vi.fn();
    renderWithIntl(
      <StatsDriverTable
        drivers={drivers}
        units={['km']}
        onDriverClick={onDriverClick}
      />,
    );

    await user.click(screen.getByText('Eva Beispiel'));
    expect(onDriverClick).toHaveBeenCalledWith('p2');
  });
});
