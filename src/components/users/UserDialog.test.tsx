// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import deMessages from '../../../messages/de.json';
import type { UserRecordExtended } from '../../common/users';

vi.mock('../../app/users/action', () => ({
  sendPasswordResetEmailAction: vi.fn(),
  setUserPasswordAction: vi.fn(),
}));

import UserRecordExtendedDialog from './UserDialog';

const GROUPS = { allUsers: 'Alle', ffnd: 'FF Neusiedl', ffxy: 'FF Anderswo', ffzz: 'FF Dritte' };

function renderDialog(user: Partial<UserRecordExtended>, onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="de" messages={deMessages}>
      <UserRecordExtendedDialog
        user={{ uid: 'u1', email: 'muster@example.org', ...user } as UserRecordExtended}
        groups={GROUPS}
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
  return onClose;
}

function homeGroupSelect() {
  return screen.getByRole('combobox', { name: 'Heimatgruppe' });
}

describe('UserRecordExtendedDialog — Heimatgruppe', () => {
  it('bietet nur Gruppen an, in denen der Benutzer Mitglied ist', async () => {
    renderDialog({ groupRoles: { ffnd: [], ffxy: [] }, homeGroup: 'ffxy' });
    expect(homeGroupSelect()).toHaveTextContent('FF Anderswo');
    await userEvent.click(homeGroupSelect());
    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Keine', 'FF Neusiedl', 'FF Anderswo']);
  });

  it('schickt die gewählte Heimatgruppe mit', async () => {
    const onClose = renderDialog({ groupRoles: { ffnd: [], ffxy: [] } });
    await userEvent.click(homeGroupSelect());
    await userEvent.click(screen.getByRole('option', { name: 'FF Neusiedl' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ homeGroup: 'ffnd' }),
      expect.arrayContaining(['ffnd', 'ffxy']),
    );
  });

  it('schickt „keine", wenn die Heimatgruppe nicht mehr unter den Gruppen ist', async () => {
    const onClose = renderDialog({ groupRoles: { ffnd: [] }, homeGroup: 'ffzz' });
    await userEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ homeGroup: '' }),
      ['ffnd'],
    );
  });
});
