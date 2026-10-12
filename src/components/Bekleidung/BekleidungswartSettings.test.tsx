// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const { getOptionsMock, saveMock } = vi.hoisted(() => ({
  getOptionsMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock('./bekleidungswartActions', () => ({
  getBekleidungswartOptions: (groupId: string) =>
    getOptionsMock(groupId),
  saveBekleidungswarte: (groupId: string, uids: string[]) =>
    saveMock(groupId, uids),
}));

import BekleidungswartSettings from './BekleidungswartSettings';

const OPTIONS = {
  success: true,
  members: [
    { uid: 'u1', displayName: 'Anna Bauer', email: 'anna@ff.at' },
    { uid: 'u2', displayName: 'Max Mustermann', email: 'max@ff.at' },
  ],
  selected: ['u1'],
};

beforeEach(() => {
  vi.clearAllMocks();
  getOptionsMock.mockResolvedValue(OPTIONS);
  saveMock.mockResolvedValue({ success: true });
});

describe('BekleidungswartSettings', () => {
  it('zeigt die eingetragenen Bekleidungswarte als Chips', async () => {
    renderWithIntl(<BekleidungswartSettings groupId="ffnd" />);

    expect(
      await screen.findByText('Anna Bauer (anna@ff.at)'),
    ).toBeInTheDocument();
  });

  it('speichert die gewählten UIDs', async () => {
    const user = userEvent.setup();
    renderWithIntl(<BekleidungswartSettings groupId="ffnd" />);
    await screen.findByText('Anna Bauer (anna@ff.at)');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Max Mustermann (max@ff.at)'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith('ffnd', ['u1', 'u2']),
    );
  });

  it('sperrt den Speichern-Knopf nach einem Ladefehler', async () => {
    // Sonst entzöge ein Klick auf das leere Formular allen die Rolle.
    getOptionsMock.mockResolvedValue({
      success: false,
      members: [],
      selected: [],
      error: 'kaputt',
    });
    renderWithIntl(<BekleidungswartSettings groupId="ffnd" />);

    expect(await screen.findByText(/kaputt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('meldet ein Nicht-Mitglied verständlich', async () => {
    saveMock.mockResolvedValue({ success: false, error: 'notAMember' });
    const user = userEvent.setup();
    renderWithIntl(<BekleidungswartSettings groupId="ffnd" />);
    await screen.findByText('Anna Bauer (anna@ff.at)');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText(
        'Mindestens ein gewählter Benutzer gehört nicht zu dieser Gruppe.',
      ),
    ).toBeInTheDocument();
  });
});
