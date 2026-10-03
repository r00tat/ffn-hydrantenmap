// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({
  status: 'online' as string,
  position: [{ lat: 0, lng: 0 }, false, undefined, vi.fn(), false] as unknown[],
  download: vi.fn(),
  count: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../../hooks/useConnectivity', () => ({
  default: () => ({ status: mocks.status }),
}));
vi.mock('../providers/PositionProvider', () => ({
  usePositionContext: () => mocks.position,
}));
vi.mock('../../lib/offlineTileDownload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/offlineTileDownload')>()),
  downloadOfflineTiles: (...args: unknown[]) => mocks.download(...args),
  countOfflineTiles: () => mocks.count(),
  clearOfflineTiles: () => mocks.clear(),
}));

import { OfflineTilesQuotaError } from '../../lib/offlineTileDownload';
import OfflineMapPreparation from './OfflineMapPreparation';

const CENTER = { lat: 47.948, lng: 16.842 };

beforeEach(() => {
  mocks.status = 'online';
  mocks.position = [{ lat: 0, lng: 0 }, false, undefined, vi.fn(), false];
  mocks.download.mockReset();
  mocks.count.mockReset().mockResolvedValue(0);
  mocks.clear.mockReset().mockResolvedValue(undefined);
});

describe('OfflineMapPreparation', () => {
  it('zeigt Kachelzahl und geschätzte Größe für das Gebiet', async () => {
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    expect(await screen.findByText(/Kacheln, rund \d+ MB/)).toBeInTheDocument();
  });

  it('lädt die Kacheln mit Fortschritt und meldet das Ergebnis', async () => {
    mocks.download.mockImplementation(
      async (urls: string[], options: { onProgress: (p: unknown) => void }) => {
        options.onProgress({
          total: urls.length,
          done: 1,
          loaded: 1,
          failed: 0,
          skipped: 0,
          bytes: 1000,
          aborted: false,
        });
        return {
          total: urls.length,
          done: urls.length,
          loaded: urls.length,
          failed: 0,
          skipped: 0,
          bytes: 2_500_000,
          aborted: false,
        };
      },
    );
    mocks.count.mockResolvedValue(42);
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    );
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    const urls = mocks.download.mock.calls[0][0] as string[];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith('https://mapsneu.wien.gv.at/basemap/'))).toBe(true);
    expect(await screen.findByText(/2,5 MB/)).toBeInTheDocument();
    expect(await screen.findByText(/42 Kacheln auf diesem Gerät/)).toBeInTheDocument();
  });

  it('bricht auf Wunsch ab', async () => {
    let signal: AbortSignal | undefined;
    mocks.download.mockImplementation(
      (_urls: string[], options: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal = options.signal;
          options.signal.addEventListener('abort', () =>
            resolve({
              total: 10,
              done: 3,
              loaded: 3,
              failed: 0,
              skipped: 0,
              bytes: 10,
              aborted: true,
            }),
          );
        }),
    );
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    );
    const cancel = await screen.findByRole('button', { name: 'Abbrechen' });
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText(/abgebrochen/)).toBeInTheDocument();
  });

  it('meldet ein erschöpftes Kontingent', async () => {
    mocks.download.mockRejectedValue(new OfflineTilesQuotaError());
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    );
    expect(await screen.findByText(/Speicherplatz/)).toBeInTheDocument();
  });

  it('ist offline deaktiviert', () => {
    mocks.status = 'offline';
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    expect(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    ).toBeDisabled();
  });

  it('nimmt ohne Einsatzort den Standort des Geräts', async () => {
    mocks.position = [CENTER, true, undefined, vi.fn(), false];
    renderWithIntl(<OfflineMapPreparation />);
    expect(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    ).toBeEnabled();
    expect(screen.getByText(/Standort dieses Geräts/)).toBeInTheDocument();
  });

  it('ohne Ort fragt es nach dem Standort', () => {
    const enable = vi.fn();
    mocks.position = [{ lat: 0, lng: 0 }, false, undefined, enable, false];
    renderWithIntl(<OfflineMapPreparation />);
    expect(
      screen.getByRole('button', { name: 'Für offline vorbereiten' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Standort verwenden' }));
    expect(enable).toHaveBeenCalled();
  });

  it('löscht den Vorrat', async () => {
    mocks.count.mockResolvedValue(10);
    renderWithIntl(<OfflineMapPreparation center={CENTER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalled());
  });
});
