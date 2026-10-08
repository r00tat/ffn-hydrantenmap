// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { issue, returnItems } = vi.hoisted(() => ({ issue: vi.fn(), returnItems: vi.fn() }));
vi.mock('./bekleidungActions', () => ({ issue, returnItems }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

import AusgabeDialog from './AusgabeDialog';

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByRole('button', { name: 'Scannen' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }),
    `${code}{Enter}`,
  );
}

describe('AusgabeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bucht gesammelte Stücke und Mengen in einem Aufruf', async () => {
    issue.mockResolvedValue({ ausgabeIds: ['x', 'y'] });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<AusgabeDialog open view={sampleView()} onClose={onClose} />);

    await user.click(screen.getByRole('combobox', { name: 'Person' }));
    await user.click(screen.getByRole('option', { name: 'Max Mustermann' }));
    // Inaktive Personen stehen nicht zur Wahl.
    await user.click(screen.getByRole('combobox', { name: 'Person' }));
    expect(screen.queryByRole('option', { name: 'Erika Mustermann' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.clear(screen.getByLabelText('Datum'));
    await user.type(screen.getByLabelText('Datum'), '2026-10-01');
    await scan(user, '1001');

    await user.click(screen.getByRole('button', { name: 'Mengenartikel hinzufügen' }));
    await user.click(screen.getByRole('combobox', { name: 'Artikel' }));
    await user.click(screen.getByRole('option', { name: 'Poloshirt' }));
    await user.type(screen.getByRole('combobox', { name: 'Größe' }), 'M');
    expect(screen.getByText('Im Lager: 5')).toBeInTheDocument();
    const menge = screen.getByRole('spinbutton', { name: 'Menge' });
    await user.clear(menge);
    await user.type(menge, '2');

    await user.click(screen.getByRole('button', { name: 'Ausgeben' }));
    expect(issue).toHaveBeenCalledWith('ffnd', {
      personId: 'p1',
      datum: '2026-10-01',
      bemerkung: undefined,
      stueckIds: ['s1'],
      mengen: [{ artikelId: 'polo', groesse: 'M', menge: 2 }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('bietet bei einem noch ausgegebenen Stück Zurücknehmen und neu Ausgeben an', async () => {
    issue
      .mockResolvedValueOnce({ success: false, error: 'alreadyIssued:s2' })
      .mockResolvedValueOnce({ ausgabeIds: ['x'] });
    returnItems.mockResolvedValue({ success: true });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <AusgabeDialog open view={sampleView()} initialPersonId="p2" onClose={onClose} />,
    );

    await scan(user, '1002');
    expect(screen.getByText('noch ausgegeben an Max Mustermann')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ausgeben' }));

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByText('Einsatzjacke · M · #1002 ist noch an Max Mustermann ausgegeben.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: 'Zurücknehmen und neu ausgeben' }));
    expect(returnItems).toHaveBeenCalledWith('ffnd', {
      datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ziel: 'lager',
      stueckIds: ['s2'],
      mengen: [],
    });
    expect(issue).toHaveBeenCalledTimes(2);
    expect(issue.mock.calls[1][1]).toMatchObject({ personId: 'p2', stueckIds: ['s2'] });
    expect(returnItems.mock.invocationCallOrder[0]).toBeLessThan(
      issue.mock.invocationCallOrder[1],
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('bietet bei einem nicht verfügbaren Stück kein Neu-Ausgeben an', async () => {
    issue.mockResolvedValue({ success: false, error: 'notAvailable:s1:ausgeschieden' });
    const user = userEvent.setup();
    renderWithIntl(
      <AusgabeDialog open view={sampleView()} initialPersonId="p1" onClose={vi.fn()} />,
    );
    await scan(user, '1001');
    await user.click(screen.getByRole('button', { name: 'Ausgeben' }));
    expect(
      screen.getByText('Einsatzjacke · L · #1001 kann nicht ausgegeben werden (Status: ausgeschieden).'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Zurücknehmen und neu ausgeben' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt andere Fehler übersetzt an', async () => {
    issue.mockResolvedValue({ success: false, error: 'insufficientStock:polo:M' });
    const user = userEvent.setup();
    renderWithIntl(
      <AusgabeDialog open view={sampleView()} initialPersonId="p1" onClose={vi.fn()} />,
    );
    await scan(user, '1001');
    await user.click(screen.getByRole('button', { name: 'Ausgeben' }));
    expect(screen.getByText('Zu wenig im Lager: Poloshirt, Größe M.')).toBeInTheDocument();
  });
});
