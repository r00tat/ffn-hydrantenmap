// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirecallShareLink } from '../../common/firecallShareLink';
import { renderWithIntl } from '../../test-utils/intlRender';

const listLinks = vi.fn();
const createLink = vi.fn();
const updateLink = vi.fn();
const issueUrl = vi.fn();

vi.mock('../../app/actions/firecallShareLinks', () => ({
  listFirecallShareLinks: (...args: unknown[]) => listLinks(...args),
  createFirecallShareLink: (...args: unknown[]) => createLink(...args),
  updateFirecallShareLink: (...args: unknown[]) => updateLink(...args),
  issueFirecallShareLinkUrl: (...args: unknown[]) => issueUrl(...args),
}));

const { default: FirecallShareDialog } = await import('./FirecallShareDialog');

const writeText = vi.fn().mockResolvedValue(undefined);

function link(overrides: Partial<FirecallShareLink> = {}): FirecallShareLink {
  return {
    uid: 'g1',
    name: 'ORF',
    canWrite: false,
    disabled: false,
    expiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: Date.now() - 60 * 60 * 1000,
    createdByName: 'Paul',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listLinks.mockResolvedValue([]);
  createLink.mockResolvedValue({
    uid: 'g1',
    link: 'https://karte.example.at/einsatz/fc1?token=jwt',
  });
  updateLink.mockResolvedValue(undefined);
  issueUrl.mockResolvedValue({
    link: 'https://karte.example.at/einsatz/fc1?token=fresh',
  });
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
    <FirecallShareDialog firecallId="fc1" onClose={onClose} />
  );
}

describe('FirecallShareDialog', () => {
  it('lists existing links with their status', async () => {
    listLinks.mockResolvedValue([
      link(),
      link({ uid: 'g2', name: 'Alt-Gast', canWrite: true, expiresAt: undefined }),
    ]);
    render();

    expect(await screen.findByText('ORF')).toBeVisible();
    expect(screen.getByText('Alt-Gast')).toBeVisible();
    expect(screen.getByText('aktiv')).toBeVisible();
    expect(screen.getByText('abgelaufen')).toBeVisible();
  });

  it('does not present an empty list when loading failed', async () => {
    listLinks.mockRejectedValue(new Error('boom'));
    render();

    expect(
      await screen.findByText(
        'Die bestehenden Links konnten nicht geladen werden.'
      )
    ).toBeVisible();
    expect(
      screen.queryByText('Für diesen Einsatz wurde noch kein Link erstellt.')
    ).toBeNull();
  });

  it('shows the empty state when there are no links', async () => {
    render();

    expect(
      await screen.findByText('Für diesen Einsatz wurde noch kein Link erstellt.')
    ).toBeVisible();
  });

  it('requires a guest name before creating a link', async () => {
    const user = setupUser();
    render();

    await user.click(
      await screen.findByRole('button', { name: 'Neuen Link erstellen' })
    );
    expect(screen.getByRole('button', { name: 'Link erstellen' })).toBeDisabled();
    expect(createLink).not.toHaveBeenCalled();
  });

  it('creates a link with the default validity of one week', async () => {
    const user = setupUser();
    render();

    await user.click(
      await screen.findByRole('button', { name: 'Neuen Link erstellen' })
    );
    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');
    await user.click(screen.getByRole('button', { name: 'Link erstellen' }));

    await waitFor(() => expect(createLink).toHaveBeenCalled());
    const [firecallId, options] = createLink.mock.lastCall as [
      string,
      { name: string; canWrite: boolean; expiresAt: number },
    ];
    expect(firecallId).toBe('fc1');
    expect(options.name).toBe('ORF');
    expect(options.canWrite).toBe(false);
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(options.expiresAt - Date.now()).toBeGreaterThan(week - 10_000);
    expect(options.expiresAt - Date.now()).toBeLessThanOrEqual(week);

    expect(
      await screen.findByText('https://karte.example.at/einsatz/fc1?token=jwt')
    ).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(
      'https://karte.example.at/einsatz/fc1?token=jwt'
    );
  });

  it('deactivates a link after confirmation', async () => {
    const user = setupUser();
    listLinks.mockResolvedValue([link()]);
    render();

    await user.click(
      await screen.findByRole('button', { name: 'Deaktivieren' })
    );
    expect(await screen.findByText('Zugang deaktivieren?')).toBeVisible();
    const buttons = screen.getAllByRole('button', { name: 'Deaktivieren' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(updateLink).toHaveBeenCalledWith('fc1', 'g1', { active: false })
    );
  });

  it('reactivates a disabled link without asking', async () => {
    const user = setupUser();
    listLinks.mockResolvedValue([link({ disabled: true })]);
    render();

    await user.click(await screen.findByRole('button', { name: 'Aktivieren' }));

    await waitFor(() =>
      expect(updateLink).toHaveBeenCalledWith('fc1', 'g1', { active: true })
    );
  });

  it('issues a fresh link when copying an existing one', async () => {
    const user = setupUser();
    listLinks.mockResolvedValue([link()]);
    render();

    await user.click(await screen.findByRole('button', { name: 'Link kopieren' }));

    await waitFor(() => expect(issueUrl).toHaveBeenCalledWith('fc1', 'g1'));
    expect(
      await screen.findByText('https://karte.example.at/einsatz/fc1?token=fresh')
    ).toBeVisible();
  });

  it('renames a guest through the edit form', async () => {
    const user = setupUser();
    listLinks.mockResolvedValue([link()]);
    render();

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    const nameField = screen.getByLabelText(/Name des Gasts/);
    await user.clear(nameField);
    await user.type(nameField, 'Presse');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(updateLink).toHaveBeenCalled());
    const [, uid, options] = updateLink.mock.lastCall as [
      string,
      string,
      { name: string },
    ];
    expect(uid).toBe('g1');
    expect(options.name).toBe('Presse');
  });

  it('reports a failed update instead of pretending it worked', async () => {
    const user = setupUser();
    listLinks.mockResolvedValue([link({ disabled: true })]);
    updateLink.mockRejectedValue(new Error('expired'));
    render();

    await user.click(await screen.findByRole('button', { name: 'Aktivieren' }));

    expect(
      await screen.findByText(/Änderung fehlgeschlagen: expired/)
    ).toBeVisible();
  });
});
