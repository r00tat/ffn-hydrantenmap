// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const createLink = vi.fn();

vi.mock('../../app/actions/auth', () => ({
  createCustomFirebaseTokenForFirecall: (
    ...args: [string, { name: string; canWrite: boolean }]
  ) => createLink(...args),
}));

const { default: FirecallShareDialog } = await import('./FirecallShareDialog');

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  createLink.mockReset();
  createLink.mockResolvedValue({ token: 'jwt-token' });
  writeText.mockClear();
});

/**
 * `userEvent.setup()` installs its own `navigator.clipboard` stub, so ours has
 * to be defined afterwards. jsdom exposes the property getter-only, hence
 * defineProperty instead of assignment.
 */
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return user;
}

function render(onClose = vi.fn()) {
  return renderWithIntl(
    <FirecallShareDialog firecallId="fc1" onClose={onClose} />,
  );
}

describe('FirecallShareDialog', () => {
  it('requires a guest name before creating a link', async () => {
    const user = setupUser();
    render();

    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    expect(await screen.findByText('Bitte einen Namen eingeben.')).toBeVisible();
    expect(createLink).not.toHaveBeenCalled();
  });

  it('defaults to read-only access', async () => {
    const user = setupUser();
    render();

    expect(
      screen.getByRole('radio', { name: /Nur Lesezugriff/ }),
    ).toBeChecked();

    await user.type(screen.getByLabelText(/Name des Gasts/), 'Nachbarwehr');
    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    await waitFor(() =>
      expect(createLink).toHaveBeenCalledWith('fc1', {
        name: 'Nachbarwehr',
        canWrite: false,
      }),
    );
  });

  it('passes write access when selected', async () => {
    const user = setupUser();
    render();

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ELD Support');
    await user.click(screen.getByRole('radio', { name: /Lesen und Schreiben/ }));
    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    await waitFor(() =>
      expect(createLink).toHaveBeenCalledWith('fc1', {
        name: 'ELD Support',
        canWrite: true,
      }),
    );
  });

  it('shows the created link and copies it to the clipboard', async () => {
    const user = setupUser();
    render();

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');
    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    const link = await screen.findByRole('link', { name: /token=jwt-token/ });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/einsatz/fc1?token=jwt-token'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/einsatz/fc1?token=jwt-token'),
    );
    expect(screen.getByText('Link in Zwischenablage kopiert')).toBeVisible();
  });

  it('reports a failure from the server action and keeps the form', async () => {
    createLink.mockResolvedValue({ error: 'Internal Server Error' });
    const user = setupUser();
    render();

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');
    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    expect(
      await screen.findByText(
        'Link konnte nicht erstellt werden: Internal Server Error',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/Name des Gasts/)).toHaveValue('ORF');
  });
});
