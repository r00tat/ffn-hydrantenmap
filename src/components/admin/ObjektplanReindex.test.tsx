// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const reindexMock = vi.fn();
vi.mock('../Objektplan/risikoobjektActions', () => ({
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
});
