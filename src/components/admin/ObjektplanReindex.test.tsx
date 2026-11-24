// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const reindexMock = vi.fn();
const driveListMock = vi.fn();
const syncMock = vi.fn();
vi.mock('../Objektplan/risikoobjektActions', () => ({
  listRisikoObjekteWithDriveLink: () => driveListMock(),
  listObjektDokumenteForReindex: () => listMock(),
  reindexObjektDokumentAction: (...args: unknown[]) => reindexMock(...args),
  syncRisikoObjekteFromDrive: (ids: string[]) => syncMock(ids),
}));

import ObjektplanReindex from './ObjektplanReindex';

const candidates = [
  { objektId: 'o1', objektName: 'Hotel', dokumentId: 'd1', name: 'BSP.pdf', indexStatus: 'ok', melder: 0, ocr: true },
  { objektId: 'o2', objektName: 'Markt', dokumentId: 'd2', name: 'Plan.pdf', indexStatus: 'ohneText', melder: 0, ocr: false },
  { objektId: 'o3', objektName: 'Schule', dokumentId: 'd3', name: 'EG.pdf', indexStatus: 'ok', melder: 12, ocr: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue(candidates);
});

describe('ObjektplanReindex', () => {
  it('liest nacheinander alle Pläne ohne Melder neu ein und fasst zusammen', async () => {
    reindexMock
      .mockResolvedValueOnce({ ok: true, id: 'd1', indexStatus: 'ok', melder: 61, ocr: true })
      .mockResolvedValueOnce({ ok: false, error: 'reindexFailed' });
    render(<ObjektplanReindex />);
    fireEvent.click(screen.getByRole('button', { name: 'Find plan documents' }));
    expect(await screen.findByText('3 PDFs, 2 without detectors.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Re-read 2 without detectors' }));
    expect(await screen.findByText('Done: 1 re-read, 1 failed.')).toBeInTheDocument();
    expect(reindexMock.mock.calls).toEqual([
      ['o1', 'd1'],
      ['o2', 'd2'],
    ]);
    expect(screen.getByText('Hotel – BSP.pdf: 61 detectors (OCR)')).toBeInTheDocument();
    expect(screen.getByText('Markt – Plan.pdf: failed (reindexFailed)')).toBeInTheDocument();
  });

  it('liest auf Wunsch alle Pläne neu ein', async () => {
    reindexMock.mockResolvedValue({ ok: true, id: 'x', indexStatus: 'ok', melder: 1, ocr: false });
    render(<ObjektplanReindex />);
    fireEvent.click(screen.getByRole('button', { name: 'Find plan documents' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Re-read all 3' }));
    await waitFor(() => expect(reindexMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Done: 3 re-read, 0 failed.')).toBeInTheDocument();
  });

  it('gleicht die Objekte mit Drive-Link in Dreierblöcken ab und lädt danach die Liste', async () => {
    driveListMock.mockResolvedValue([
      { id: 'o1', name: 'Hotel' },
      { id: 'o2', name: 'Markt' },
      { id: 'o3', name: 'Schule' },
      { id: 'o4', name: 'Lager' },
    ]);
    syncMock
      .mockResolvedValueOnce([
        { id: 'o1', result: { status: 'ok', imported: 3, removed: 1, skipped: 2, failed: 0 } },
        { id: 'o2', result: { status: 'nichtLesbar' } },
        { id: 'o3', error: 'Drive kaputt' },
      ])
      .mockResolvedValueOnce([
        { id: 'o4', result: { status: 'ok', imported: 1, removed: 0, skipped: 0, failed: 1 } },
      ]);
    render(<ObjektplanReindex />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync all from Drive' }));
    expect(await screen.findByText('Drive sync done: 4 imported, 1 removed, 3 failed.')).toBeInTheDocument();
    expect(syncMock.mock.calls).toEqual([[['o1', 'o2', 'o3']], [['o4']]]);
    expect(screen.getByText('Hotel: 3 imported, 1 removed, 2 unchanged, 0 failed')).toBeInTheDocument();
    expect(screen.getByText('Markt: Drive folder not readable')).toBeInTheDocument();
    expect(screen.getByText('Schule: failed (Drive kaputt)')).toBeInTheDocument();
    expect(screen.getByText('Lager: 1 imported, 0 removed, 0 unchanged, 1 failed')).toBeInTheDocument();
    // Danach steht die Liste zum Neu-Einlesen bereit.
    expect(await screen.findByText('3 PDFs, 2 without detectors.')).toBeInTheDocument();
  });

  it('zählt einen abgebrochenen Block als fehlgeschlagen', async () => {
    driveListMock.mockResolvedValue([
      { id: 'o1', name: 'Hotel' },
      { id: 'o2', name: 'Markt' },
    ]);
    syncMock.mockRejectedValueOnce(new Error('timeout'));
    render(<ObjektplanReindex />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync all from Drive' }));
    expect(await screen.findByText('Drive sync done: 0 imported, 0 removed, 2 failed.')).toBeInTheDocument();
    expect(screen.getByText('Hotel: failed (timeout)')).toBeInTheDocument();
    expect(screen.getByText('Markt: failed (timeout)')).toBeInTheDocument();
  });
});

