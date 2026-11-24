// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const reindexMock = vi.fn();
const driveListMock = vi.fn();
const syncMock = vi.fn();
vi.mock('../Objektplan/objektplanActions', () => ({
  syncObjektDokumenteFromDrive: (id: string) => syncMock(id),
}));
vi.mock('../Objektplan/risikoobjektActions', () => ({
  listRisikoObjekteWithDriveLink: () => driveListMock(),
  listObjektDokumenteForReindex: () => listMock(),
  reindexObjektDokumentAction: (...args: unknown[]) => reindexMock(...args),
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

  it('gleicht alle Objekte mit Drive-Link nacheinander ab und lädt danach die Liste', async () => {
    driveListMock.mockResolvedValue([
      { id: 'o1', name: 'Hotel' },
      { id: 'o2', name: 'Markt' },
    ]);
    syncMock
      .mockResolvedValueOnce({ status: 'ok', imported: 3, removed: 1, skipped: 2, failed: 0 })
      .mockResolvedValueOnce({ status: 'nichtLesbar' });
    render(<ObjektplanReindex />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync all from Drive' }));
    expect(await screen.findByText('Drive sync done: 3 imported, 1 removed, 1 failed.')).toBeInTheDocument();
    expect(syncMock.mock.calls).toEqual([['o1'], ['o2']]);
    expect(screen.getByText('Hotel: 3 imported, 1 removed, 2 unchanged, 0 failed')).toBeInTheDocument();
    expect(screen.getByText('Markt: Drive folder not readable')).toBeInTheDocument();
    // Danach steht die Liste zum Neu-Einlesen bereit.
    expect(await screen.findByText('3 PDFs, 2 without detectors.')).toBeInTheDocument();
  });
});

