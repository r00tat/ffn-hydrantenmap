// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { adjustBestand } = vi.hoisted(() => ({ adjustBestand: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ adjustBestand }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import LagerstandTab from './LagerstandTab';

function rowOf(text: string) {
  return screen.getAllByRole('row').filter((r) => within(r).queryByText(text));
}

describe('LagerstandTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adjustBestand.mockResolvedValue({ success: true });
  });

  it('zeigt die berechneten Zeilen je Kategorie', () => {
    renderWithIntl(<LagerstandTab view={sampleView()} />);
    expect(screen.getByText('Einsatzbekleidung')).toBeInTheDocument();
    expect(screen.getByText('Dienstbekleidung')).toBeInTheDocument();

    const jacken = rowOf('Einsatzjacke');
    // L: s1 im Lager; M: s2 ausgegeben; das private s3 zählt nicht.
    expect(jacken.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['Einsatzjacke', 'L', '1', '0', ''],
      ['Einsatzjacke', 'M', '0', '1', ''],
    ]);
    const polo = rowOf('Poloshirt')[0];
    expect(within(polo).getAllByRole('cell').slice(0, 4).map((c) => c.textContent)).toEqual([
      'Poloshirt',
      'M',
      '5',
      '2',
    ]);
  });

  it('bucht eine Korrektur als Differenz zum gezählten Bestand', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LagerstandTab view={sampleView()} />);
    await user.click(within(rowOf('Poloshirt')[0]).getByRole('button', { name: 'Zugang/Korrektur' }));
    expect(screen.getByText('Aktuell im Lager: 5')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Korrektur (Ist-Bestand)' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Gezählter Bestand' }), '3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(adjustBestand).toHaveBeenCalledWith('ffnd', {
      artikelId: 'polo',
      groesse: 'M',
      delta: -2,
      bemerkung: undefined,
    });
  });
});
