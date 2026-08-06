// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { downloadQrMock, printQrMock } = vi.hoisted(() => ({
  downloadQrMock: vi.fn(),
  printQrMock: vi.fn(),
}));

// Canvas und Bild-Dekodierung fehlen in jsdom; die Exporte selbst sind in
// shareLinkQr.test.ts abgedeckt. `PrintWindowBlockedError` bleibt echt, weil
// die Komponente den Fehlertyp auswertet.
vi.mock('./shareLinkQr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shareLinkQr')>()),
  downloadShareLinkQr: downloadQrMock,
  printShareLinkQr: printQrMock,
}));

import ShareLinkQrBlock from './ShareLinkQrBlock';
import { PrintWindowBlockedError } from './shareLinkQr';

const url = 'https://einsatz.example/fahrtenbuch/teilen/tok123';

describe('ShareLinkQrBlock', () => {
  beforeEach(() => {
    downloadQrMock.mockReset();
    downloadQrMock.mockResolvedValue(undefined);
    printQrMock.mockReset();
  });

  it('zeigt einen QR-Code zum Link', () => {
    renderWithIntl(<ShareLinkQrBlock url={url} groupId="ffnd" />);

    // Gezielt über den <title> des Codes — ein `querySelector('svg')` fände
    // auch die Icons der Buttons und bliebe grün, wenn der Code verschwände.
    expect(screen.getByTitle('Fahrtenbuch-Link').closest('svg')).toBeTruthy();
  });

  it('lädt das SVG aus dem DOM herunter, samt Fahrzeugname für den Dateinamen', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ShareLinkQrBlock url={url} groupId="ffnd" vehicleName="TLF 2000" />,
    );

    await user.click(screen.getByRole('button', { name: 'PNG herunterladen' }));

    await waitFor(() => expect(downloadQrMock).toHaveBeenCalledTimes(1));
    const [svg, groupId, vehicleName] = downloadQrMock.mock.calls[0];
    // Exportiert wird der Code aus dem DOM — nicht ein zweiter, neu erzeugter,
    // der auf einen anderen Link zeigen könnte.
    expect((svg as SVGSVGElement).tagName).toBe('svg');
    expect(groupId).toBe('ffnd');
    expect(vehicleName).toBe('TLF 2000');
  });

  it('druckt mit Gruppe, Fahrzeug und Link im Klartext', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ShareLinkQrBlock
        url={url}
        groupId="ffnd"
        groupName="FF Neusiedl"
        vehicleName="MTF"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Drucken' }));

    await waitFor(() => expect(printQrMock).toHaveBeenCalledTimes(1));
    expect(printQrMock.mock.calls[0][1]).toMatchObject({
      heading: 'Fahrtenbuch-Link',
      groupName: 'FF Neusiedl',
      vehicleName: 'MTF',
      url,
      locale: 'de',
    });
  });

  it('rät bei blockiertem Pop-up zum Freigeben', async () => {
    printQrMock.mockImplementation(() => {
      throw new PrintWindowBlockedError();
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkQrBlock url={url} groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Drucken' }));

    expect(
      await screen.findByText(
        'Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.',
      ),
    ).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Download', async () => {
    downloadQrMock.mockRejectedValueOnce(new Error('no canvas'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithIntl(<ShareLinkQrBlock url={url} groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'PNG herunterladen' }));

    expect(
      await screen.findByText('Der QR-Code konnte nicht exportiert werden.'),
    ).toBeInTheDocument();
  });
});
