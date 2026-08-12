// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasskeyInfo } from '../../common/passkey';
import { renderWithIntl } from '../../test-utils/intlRender';

const {
  listPasskeysMock,
  deletePasskeyMock,
  renamePasskeyMock,
  startPasskeyRegistrationMock,
  finishPasskeyRegistrationMock,
  startRegistrationMock,
  browserSupportsWebAuthnMock,
} = vi.hoisted(() => ({
  listPasskeysMock: vi.fn(),
  deletePasskeyMock: vi.fn(async () => undefined),
  renamePasskeyMock: vi.fn(async () => undefined),
  startPasskeyRegistrationMock: vi.fn(),
  finishPasskeyRegistrationMock: vi.fn(),
  startRegistrationMock: vi.fn(),
  browserSupportsWebAuthnMock: vi.fn(() => true),
}));

vi.mock('../../app/actions/passkey', () => ({
  listPasskeys: listPasskeysMock,
  deletePasskey: deletePasskeyMock,
  renamePasskey: renamePasskeyMock,
  startPasskeyRegistration: startPasskeyRegistrationMock,
  finishPasskeyRegistration: finishPasskeyRegistrationMock,
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: startRegistrationMock,
  browserSupportsWebAuthn: browserSupportsWebAuthnMock,
}));

const PasskeyManager = (await import('./PasskeyManager')).default;

const LOCAL: PasskeyInfo = {
  id: 'cred-local',
  counter: 0,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
  rpId: 'localhost',
  origin: 'http://localhost:3000',
  aaguid: 'aaguid-1',
  label: 'MacBook',
  userAgent: 'test-agent',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastUsedAt: '2026-08-10T08:30:00.000Z',
};

const FOREIGN: PasskeyInfo = {
  ...LOCAL,
  id: 'cred-prod',
  label: 'iPhone',
  rpId: 'einsatz.ffnd.at',
  origin: 'https://einsatz.ffnd.at',
  lastUsedAt: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  browserSupportsWebAuthnMock.mockReturnValue(true);
  listPasskeysMock.mockResolvedValue([LOCAL, FOREIGN]);
  startPasskeyRegistrationMock.mockResolvedValue({
    options: { challenge: 'c' },
    challengeToken: 'challenge-token',
  });
  startRegistrationMock.mockResolvedValue({ id: 'cred-new' });
  finishPasskeyRegistrationMock.mockResolvedValue({ passkey: LOCAL });
});

describe('PasskeyManager', () => {
  it('lists the passkeys with their label and domain', async () => {
    renderWithIntl(<PasskeyManager />);

    expect(await screen.findByText('MacBook')).toBeInTheDocument();
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText(/localhost/)).toBeInTheDocument();
  });

  it('marks a passkey of a different domain as unusable here', async () => {
    renderWithIntl(<PasskeyManager />);

    expect(
      await screen.findByText('Gilt nur auf einsatz.ffnd.at'),
    ).toBeInTheDocument();
  });

  it('shows the never-used hint for a passkey without lastUsedAt', async () => {
    listPasskeysMock.mockResolvedValue([FOREIGN]);
    renderWithIntl(<PasskeyManager />);

    // Anlage- und Nutzungsdatum stehen in einem zusammengesetzten Sekundärtext.
    expect(await screen.findByText(/Noch nicht verwendet/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no passkeys', async () => {
    listPasskeysMock.mockResolvedValue([]);
    renderWithIntl(<PasskeyManager />);

    expect(
      await screen.findByText('Noch keine Passkeys angelegt.'),
    ).toBeInTheDocument();
  });

  it('deletes a passkey after confirmation and reloads the list', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasskeyManager />);
    await screen.findByText('MacBook');

    // Rollenbasiert und auf die Liste eingegrenzt: MUI Tooltip legt einen
    // <span> mit demselben aria-label um den Button, und der Bestätigungsdialog
    // bringt später einen zweiten Button „Löschen“ mit.
    const list = screen.getByRole('list');
    await user.click(within(list).getAllByRole('button', { name: 'Löschen' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));

    await waitFor(() =>
      expect(deletePasskeyMock).toHaveBeenCalledWith('cred-local'),
    );
    expect(listPasskeysMock).toHaveBeenCalledTimes(2);
  });

  it('runs the registration ceremony and reloads the list', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasskeyManager />);
    await screen.findByText('MacBook');

    await user.click(screen.getByRole('button', { name: 'Passkey hinzufügen' }));

    await waitFor(() =>
      expect(finishPasskeyRegistrationMock).toHaveBeenCalledWith(
        'challenge-token',
        { id: 'cred-new' },
        expect.any(String),
      ),
    );
    expect(startRegistrationMock).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'c' },
    });
    expect(listPasskeysMock).toHaveBeenCalledTimes(2);
  });

  it('stays silent when the user cancels the system dialog', async () => {
    const user = userEvent.setup();
    startRegistrationMock.mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }),
    );
    renderWithIntl(<PasskeyManager />);
    await screen.findByText('MacBook');

    await user.click(screen.getByRole('button', { name: 'Passkey hinzufügen' }));

    await waitFor(() => expect(startRegistrationMock).toHaveBeenCalled());
    expect(
      screen.queryByText('Passkey konnte nicht angelegt werden.'),
    ).not.toBeInTheDocument();
  });

  it('reports a failed registration', async () => {
    const user = userEvent.setup();
    startRegistrationMock.mockRejectedValue(new Error('boom'));
    renderWithIntl(<PasskeyManager />);
    await screen.findByText('MacBook');

    await user.click(screen.getByRole('button', { name: 'Passkey hinzufügen' }));

    expect(
      await screen.findByText('Passkey konnte nicht angelegt werden.'),
    ).toBeInTheDocument();
  });

  it('renames a passkey', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasskeyManager />);
    await screen.findByText('MacBook');

    const list = screen.getByRole('list');
    await user.click(
      within(list).getAllByRole('button', { name: 'Umbenennen' })[0],
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Arbeitslaptop');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(renamePasskeyMock).toHaveBeenCalledWith(
        'cred-local',
        'Arbeitslaptop',
      ),
    );
  });

  it('renders the unsupported hint instead of the add button', async () => {
    browserSupportsWebAuthnMock.mockReturnValue(false);
    renderWithIntl(<PasskeyManager />);

    expect(
      await screen.findByText('Dieses Gerät unterstützt keine Passkeys.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Passkey hinzufügen' }),
    ).not.toBeInTheDocument();
  });
});
