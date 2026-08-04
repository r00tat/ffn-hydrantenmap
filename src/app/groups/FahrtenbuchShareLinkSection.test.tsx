// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const { getMock, createMock, revokeMock, downloadQrMock, printQrMock } =
  vi.hoisted(() => ({
    getMock: vi.fn(),
    createMock: vi.fn(),
    revokeMock: vi.fn(),
    downloadQrMock: vi.fn(),
    printQrMock: vi.fn(),
  }));

vi.mock('./shareLinkActions', () => ({
  getFahrtenbuchShareLink: getMock,
  createFahrtenbuchShareLink: createMock,
  revokeFahrtenbuchShareLink: revokeMock,
}));

// Canvas und Bild-Dekodierung fehlen in jsdom; die Exporte selbst sind in
// shareLinkQr.test.ts abgedeckt. Hier zählt nur, dass die Buttons sie mit den
// richtigen Daten aufrufen — `PrintWindowBlockedError` bleibt echt, weil die
// Komponente den Fehlertyp auswertet.
vi.mock('./shareLinkQr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shareLinkQr')>()),
  downloadShareLinkQr: downloadQrMock,
  printShareLinkQr: printQrMock,
}));

import FahrtenbuchShareLinkSection from './FahrtenbuchShareLinkSection';
import { PrintWindowBlockedError } from './shareLinkQr';

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
    downloadQrMock.mockReset();
    downloadQrMock.mockResolvedValue(undefined);
    printQrMock.mockReset();
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

  it('lädt den QR-Code als Bild herunter', async () => {
    getMock.mockResolvedValue(info);
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'PNG herunterladen' }),
    );

    await waitFor(() => expect(downloadQrMock).toHaveBeenCalledTimes(1));
    const [svg, groupId] = downloadQrMock.mock.calls[0];
    // Exportiert wird das SVG aus dem DOM — nicht ein zweiter, neu erzeugter
    // Code, der auf einen anderen Link zeigen könnte.
    expect((svg as SVGSVGElement).tagName).toBe('svg');
    expect((svg as SVGSVGElement).querySelector('title')?.textContent).toBe(
      'Fahrtenbuch-Link',
    );
    expect(groupId).toBe('ffnd');
  });

  it('druckt den QR-Code mit Gruppenname und Link im Klartext', async () => {
    getMock.mockResolvedValue(info);
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchShareLinkSection groupId="ffnd" groupName="FF Neusiedl" />,
    );

    await user.click(await screen.findByRole('button', { name: 'Drucken' }));

    await waitFor(() => expect(printQrMock).toHaveBeenCalledTimes(1));
    const [svg, labels] = printQrMock.mock.calls[0];
    expect((svg as SVGSVGElement).tagName).toBe('svg');
    expect(labels).toMatchObject({
      heading: 'Fahrtenbuch-Link',
      groupName: 'FF Neusiedl',
      url: info.url,
      locale: 'de',
    });
  });

  it('rät bei blockiertem Pop-up zum Freigeben statt nur „fehlgeschlagen“ zu melden', async () => {
    getMock.mockResolvedValue(info);
    printQrMock.mockImplementation(() => {
      throw new PrintWindowBlockedError();
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(await screen.findByRole('button', { name: 'Drucken' }));

    expect(
      await screen.findByText(
        'Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.',
      ),
    ).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Download', async () => {
    getMock.mockResolvedValue(info);
    downloadQrMock.mockRejectedValueOnce(new Error('no canvas'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'PNG herunterladen' }),
    );

    expect(
      await screen.findByText('Der QR-Code konnte nicht exportiert werden.'),
    ).toBeInTheDocument();
  });

  it('bietet Export erst an, wenn ein Link existiert', async () => {
    getMock.mockResolvedValue(null);
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="ffnd" />);

    await screen.findByRole('button', { name: 'Link erstellen' });
    expect(screen.queryByRole('button', { name: 'Drucken' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'PNG herunterladen' }),
    ).toBeNull();
  });

  it('rendert nichts für eine Nicht-Mandanten-Gruppe', () => {
    renderWithIntl(<FahrtenbuchShareLinkSection groupId="allUsers" />);
    expect(screen.queryByText('Fahrtenbuch-Link')).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });
});
