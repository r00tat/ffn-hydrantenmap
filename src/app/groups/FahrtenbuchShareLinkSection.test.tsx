// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const { getMock, createMock, revokeMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  createMock: vi.fn(),
  revokeMock: vi.fn(),
}));

vi.mock('./shareLinkActions', () => ({
  getFahrtenbuchShareLink: getMock,
  createFahrtenbuchShareLink: createMock,
  revokeFahrtenbuchShareLink: revokeMock,
}));

import FahrtenbuchShareLinkSection from './FahrtenbuchShareLinkSection';

const info = {
  url: 'https://einsatz.example/fahrtenbuch/teilen/tok123',
  createdAt: '2026-08-04T10:00:00.000Z',
  createdByName: 'Paul',
};

const info2 = { ...info, url: 'https://einsatz.example/fahrtenbuch/teilen/neu' };

describe('FahrtenbuchShareLinkSection', () => {
  beforeEach(() => {
    getMock.mockReset();
    createMock.mockReset();
    revokeMock.mockReset();
  });

  it('bietet das Erstellen an, wenn noch kein Link existiert', async () => {
    getMock.mockResolvedValue(null);
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    expect(
      await screen.findByRole('button', { name: 'Link erstellen' }),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(info.url)).not.toBeInTheDocument();
  });

  it('zeigt Link und QR-Code, wenn ein Link existiert', async () => {
    getMock.mockResolvedValue(info);
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    expect(await screen.findByDisplayValue(info.url)).toBeInTheDocument();
    // Gezielt über den <title> des QR-Codes. `container.querySelector('svg')`
    // fände das Kopier-Icon im endAdornment und bliebe auch dann grün, wenn der
    // QR-Code ersatzlos verschwände.
    const qrTitle = screen.getByTitle('Fahrtenbuch-Link');
    expect(qrTitle.closest('svg')).toBeTruthy();
  });

  it('erstellt einen Link auf Klick', async () => {
    getMock.mockResolvedValue(null);
    createMock.mockResolvedValue(info);
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'Link erstellen' }),
    );

    await waitFor(() => expect(createMock).toHaveBeenCalledWith('ffnd'));
    expect(await screen.findByDisplayValue(info.url)).toBeInTheDocument();
  });

  it('zeigt einen Fehler an, wenn die Aktion fehlschlägt', async () => {
    getMock.mockResolvedValue(null);
    createMock.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'Link erstellen' }),
    );

    expect(
      await screen.findByText('Die Aktion ist fehlgeschlagen.'),
    ).toBeInTheDocument();
    // busy wieder false — der Button ist erneut bedienbar.
    expect(screen.getByRole('button', { name: 'Link erstellen' })).toBeEnabled();
  });

  it('erzeugt erst nach Bestätigung neu', async () => {
    getMock.mockResolvedValue(info);
    createMock.mockResolvedValue(info2);
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'Neu erzeugen' }),
    );
    expect(createMock).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'ja' }));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('ffnd'));
    expect(await screen.findByDisplayValue(info2.url)).toBeInTheDocument();
  });

  it('widerruft erst nach Bestätigung', async () => {
    getMock.mockResolvedValue(info);
    revokeMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(revokeMock).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'ja' }));
    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith('ffnd'));
    expect(
      await screen.findByRole('button', { name: 'Link erstellen' }),
    ).toBeInTheDocument();
  });

  it('tut nichts, wenn der Widerruf abgebrochen wird', async () => {
    getMock.mockResolvedValue(info);
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    await user.click(await screen.findByRole('button', { name: 'nein' }));

    expect(revokeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(info.url)).toBeInTheDocument();
  });

  it('bietet bei einem Ladefehler kein Erstellen an', async () => {
    getMock.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    expect(
      await screen.findByText('Der Link konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    // Entscheidend: „Link erstellen“ würde den in Wahrheit vorhandenen Link
    // widerrufen und ausgedruckte QR-Codes vernichten.
    expect(
      screen.queryByRole('button', { name: 'Link erstellen' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Erneut versuchen' }),
    ).toBeInTheDocument();
  });

  it('rendert nichts für eine Nicht-Mandanten-Gruppe', () => {
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="allUsers" />);
    expect(screen.queryByText('Fahrtenbuch-Link')).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });
});
