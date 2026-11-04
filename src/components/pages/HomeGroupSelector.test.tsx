// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import deMessages from '../../../messages/de.json';
import type { LoginStatus } from '../../hooks/auth/types';

const setMyHomeGroupMock = vi.fn();
const loginStatus = vi.fn<() => Partial<LoginStatus>>(() => ({}));

vi.mock('../../app/actions/homeGroup', () => ({
  setMyHomeGroup: (groupId: string | null) => setMyHomeGroupMock(groupId),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => loginStatus(),
}));

import HomeGroupSelector from './HomeGroupSelector';

function renderSelector() {
  return render(
    <NextIntlClientProvider locale="de" messages={deMessages}>
      <HomeGroupSelector />
    </NextIntlClientProvider>,
  );
}

describe('HomeGroupSelector', () => {
  beforeEach(() => {
    setMyHomeGroupMock.mockReset();
    setMyHomeGroupMock.mockResolvedValue({ homeGroup: 'ffxy' });
    loginStatus.mockReturnValue({
      myGroups: [
        { id: 'allUsers', name: 'Alle' },
        { id: 'ffnd', name: 'FF Neusiedl' },
        { id: 'ffxy', name: 'FF Anderswo' },
      ],
      homeGroup: 'ffnd',
    });
  });

  it('bietet nur Mandantengruppen und „Keine" an', async () => {
    renderSelector();
    await userEvent.click(screen.getByRole('combobox'));
    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Keine', 'FF Neusiedl', 'FF Anderswo']);
  });

  it('zeigt die aktuelle Heimatgruppe', () => {
    renderSelector();
    expect(screen.getByRole('combobox')).toHaveTextContent('FF Neusiedl');
  });

  it('speichert die gewählte Gruppe', async () => {
    renderSelector();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'FF Anderswo' }));
    expect(setMyHomeGroupMock).toHaveBeenCalledWith('ffxy');
    await waitFor(() =>
      expect(screen.getByText('Heimatgruppe gespeichert')).toBeInTheDocument(),
    );
  });

  it('entfernt die Heimatgruppe mit „Keine"', async () => {
    setMyHomeGroupMock.mockResolvedValue({ homeGroup: undefined });
    renderSelector();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Keine' }));
    expect(setMyHomeGroupMock).toHaveBeenCalledWith(null);
  });

  it('meldet einen Fehler der Server Action', async () => {
    setMyHomeGroupMock.mockResolvedValue({ error: 'notMember' });
    renderSelector();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'FF Anderswo' }));
    await waitFor(() =>
      expect(
        screen.getByText('Heimatgruppe konnte nicht gespeichert werden'),
      ).toBeInTheDocument(),
    );
  });
});
