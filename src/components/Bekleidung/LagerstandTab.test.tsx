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

const cells = (row: HTMLElement, count = 4) =>
  within(row)
    .getAllByRole('cell')
    .slice(0, count)
    .map((c) => c.textContent);

describe('LagerstandTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adjustBestand.mockResolvedValue({ success: true });
  });

  it('zeigt je Artikel eine Zeile und klappt die Größen auf', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LagerstandTab view={sampleView()} />);
    expect(screen.getByText('Einsatzbekleidung')).toBeInTheDocument();
    expect(screen.getByText('Dienstbekleidung')).toBeInTheDocument();

    // L: s1 im Lager; M: s2 ausgegeben; das private s3 zählt nicht.
    expect(cells(rowOf('Einsatzjacke')[0])).toEqual(['Einsatzjacke', '2 Größen', '1', '1']);
    expect(cells(rowOf('Poloshirt')[0])).toEqual(['Poloshirt', '1 Größe', '5', '2']);
    expect(screen.queryByText('L')).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Details zu Einsatzjacke' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(cells(rowOf('L')[0])).toEqual(['', 'L', '1', '0']);
    expect(cells(rowOf('M')[0])).toEqual(['', 'M', '0', '1']);

    await user.click(toggle);
    expect(screen.queryByText('L')).toBeNull();
  });

  it('bucht eine Korrektur als Differenz zum gezählten Bestand', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LagerstandTab view={sampleView()} />);
    // Korrigiert wird in der Größenzeile, nicht in der Artikelzeile.
    expect(screen.queryByRole('button', { name: 'Zugang/Korrektur' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Details zu Poloshirt' }));
    await user.click(within(rowOf('M')[0]).getByRole('button', { name: 'Zugang/Korrektur' }));
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

  it('teilt einen Mengenartikel nach Chargen auf und korrigiert je Charge', async () => {
    const user = userEvent.setup();
    const view = sampleView();
    view.bestand.push({
      id: 'polo__M__c_BRAND',
      artikelId: 'polo',
      groesse: 'M',
      charge: 'Brand',
      anzahl: 3,
      updatedAt: '',
      updatedBy: '',
    });
    renderWithIntl(<LagerstandTab view={view} />);

    expect(cells(rowOf('Poloshirt')[0])).toEqual(['Poloshirt', '1 Größe', '8', '2']);
    await user.click(screen.getByRole('button', { name: 'Details zu Poloshirt' }));
    const size = rowOf('M')[0];
    expect(cells(size)).toEqual(['', 'M', '8', '2']);
    const brand = rowOf('Charge Brand')[0];
    expect(cells(brand)).toEqual(['', 'Charge Brand', '3', '0']);
    expect(rowOf('ohne Charge')).toHaveLength(1);
    // Korrigiert wird je Charge, nicht in der Summenzeile der Größe.
    expect(within(size).queryByRole('button', { name: 'Zugang/Korrektur' })).toBeNull();

    await user.click(within(brand).getByRole('button', { name: 'Zugang/Korrektur' }));
    expect(screen.getByText('Aktuell im Lager: 3')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Charge' })).toHaveValue('Brand');
    await user.type(screen.getByRole('spinbutton', { name: 'Zugang (Stück)' }), '4');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(adjustBestand).toHaveBeenCalledWith('ffnd', {
      artikelId: 'polo',
      groesse: 'M',
      charge: 'Brand',
      delta: 4,
      bemerkung: undefined,
    });
  });

  it('nimmt beim neuen Zugang eine Charge an', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LagerstandTab view={sampleView()} />);
    await user.click(screen.getByRole('button', { name: 'Zugang' }));
    await user.click(screen.getByRole('combobox', { name: 'Artikel' }));
    await user.click(screen.getByRole('option', { name: 'Poloshirt' }));
    await user.type(screen.getByRole('combobox', { name: 'Größe' }), 'L');
    await user.type(screen.getByRole('combobox', { name: 'Charge' }), 'Technisch');
    await user.type(screen.getByRole('spinbutton', { name: 'Zugang (Stück)' }), '6');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(adjustBestand).toHaveBeenCalledWith('ffnd', {
      artikelId: 'polo',
      groesse: 'L',
      charge: 'Technisch',
      delta: 6,
      bemerkung: undefined,
    });
  });
});
