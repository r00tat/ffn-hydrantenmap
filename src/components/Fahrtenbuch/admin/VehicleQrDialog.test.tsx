// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { getMock, downloadQrMock, printQrMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  downloadQrMock: vi.fn(),
  printQrMock: vi.fn(),
}));

vi.mock('../shareLinkActions', () => ({
  getFahrtenbuchShareLink: getMock,
}));

vi.mock('./shareLinkQr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shareLinkQr')>()),
  downloadShareLinkQr: downloadQrMock,
  printShareLinkQr: printQrMock,
}));

import VehicleQrDialog from './VehicleQrDialog';

const info = {
  url: 'https://einsatz.example/fahrtenbuch/teilen/tok123',
  createdAt: '2026-08-04T10:00:00.000Z',
  createdByName: 'Paul',
};

const vehicle = { id: 'v2', name: 'MTF' };

describe('VehicleQrDialog', () => {
  beforeEach(() => {
    getMock.mockReset();
    downloadQrMock.mockReset();
    downloadQrMock.mockResolvedValue(undefined);
    printQrMock.mockReset();
  });

  it('zeigt den Code mit dem Fahrzeug im Link', async () => {
    getMock.mockResolvedValue(info);
    renderWithIntl(
      <VehicleQrDialog
        groupId="ffnd"
        groupName="FF Neusiedl"
        vehicle={vehicle}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText('Fahrtenbuch-QR-Code: MTF')).toBeInTheDocument();
    // Der Link im Klartext: die Rückfallebene, wenn das Scannen scheitert, und
    // gleichzeitig die Kontrolle, dass der Parameter dranhängt.
    expect(
      await screen.findByText(`${info.url}?fahrzeug=v2`),
    ).toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('ffnd'));
  });

  it('nimmt Fahrzeug und Link in den Ausdruck auf', async () => {
    getMock.mockResolvedValue(info);
    const user = userEvent.setup();
    renderWithIntl(
      <VehicleQrDialog
        groupId="ffnd"
        groupName="FF Neusiedl"
        vehicle={vehicle}
        onClose={() => {}}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Drucken' }));

    await waitFor(() => expect(printQrMock).toHaveBeenCalledTimes(1));
    expect(printQrMock.mock.calls[0][1]).toMatchObject({
      groupName: 'FF Neusiedl',
      vehicleName: 'MTF',
      url: `${info.url}?fahrzeug=v2`,
    });
  });

  it('erklärt, wo der Link erzeugt wird, wenn es noch keinen gibt', async () => {
    getMock.mockResolvedValue(null);
    renderWithIntl(
      <VehicleQrDialog groupId="ffnd" vehicle={vehicle} onClose={() => {}} />,
    );

    expect(
      await screen.findByText(
        'Für diese Gruppe ist noch kein Fahrtenbuch-Link erzeugt. Er wird im Reiter „Fahrtenbuch-Link“ erstellt und gilt für alle Fahrzeuge.',
      ),
    ).toBeInTheDocument();
    // Kein Code ohne Link — ein QR-Code auf eine leere URL wäre schlimmer als
    // keiner, weil er sich ausdrucken und ankleben ließe.
    expect(screen.queryByRole('button', { name: 'Drucken' })).toBeNull();
  });

  it('unterscheidet einen Ladefehler von „kein Link"', async () => {
    getMock.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithIntl(
      <VehicleQrDialog groupId="ffnd" vehicle={vehicle} onClose={() => {}} />,
    );

    expect(
      await screen.findByText('Der Link konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('schließt sich auf Klick', async () => {
    getMock.mockResolvedValue(info);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <VehicleQrDialog groupId="ffnd" vehicle={vehicle} onClose={onClose} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalled();
  });
});
