// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { makeStueck, sampleData, sampleView } from './bekleidungFixtures';

const { returnItems } = vi.hoisted(() => ({ returnItems: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ returnItems }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

import RuecknahmeDialog from './RuecknahmeDialog';

describe('RuecknahmeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    returnItems.mockResolvedValue({ success: true });
  });

  it('nimmt Stück und Teilmenge der vorgewählten Person zurück', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <RuecknahmeDialog open view={sampleView()} initialPersonId="p1" onClose={onClose} />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Einsatzjacke · M · #1002' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Zurück (von 2)' }), '1');
    await user.click(screen.getByRole('combobox', { name: 'Ziel' }));
    await user.click(screen.getByRole('option', { name: 'ausscheiden' }));
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));

    expect(returnItems).toHaveBeenCalledWith('ffnd', {
      datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      bemerkung: undefined,
      ziel: 'ausgeschieden',
      stueckIds: ['s2'],
      mengen: [{ ausgabeId: 'a2', menge: 1 }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('wählt beim Scan die Person des Stücks', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RuecknahmeDialog open view={sampleView()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }),
      '1002{Enter}',
    );
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('Max Mustermann');
    expect(screen.getByRole('checkbox', { name: 'Einsatzjacke · M · #1002' })).toBeChecked();
  });

  it('zeigt einen Fehler zu einer Mengen-Ausgabe mit Artikel und Größe statt der ID', async () => {
    returnItems.mockResolvedValue({ success: false, error: 'notIssued:a2' });
    const user = userEvent.setup();
    renderWithIntl(
      <RuecknahmeDialog open view={sampleView()} initialPersonId="p1" onClose={vi.fn()} />,
    );
    await user.type(screen.getByRole('spinbutton', { name: 'Zurück (von 2)' }), '1');
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(
      await screen.findByText('Poloshirt · M ist nicht (mehr) ausgegeben.'),
    ).toBeInTheDocument();
  });

  it('nimmt ausgegebene Stücke ohne bekannte Person (Import) zurück', async () => {
    const data = sampleData();
    data.stuecke.push(
      makeStueck({ id: 's4', tagNummer: '1004', status: 'ausgegeben' }),
      makeStueck({ id: 's5', tagNummer: '1005', status: 'ausgegeben', groesse: 'S' }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<RuecknahmeDialog open view={sampleView(data)} onClose={onClose} />);

    expect(screen.getByText('Ausgegeben, Person unbekannt')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Einsatzjacke · S · #1005' }));
    // per Scan dazu
    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }),
      '1004{Enter}',
    );
    expect(screen.getByRole('checkbox', { name: 'Einsatzjacke · L · #1004' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    expect(returnItems).toHaveBeenCalledWith(
      'ffnd',
      expect.objectContaining({ stueckIds: ['s5', 's4'], mengen: [] }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
