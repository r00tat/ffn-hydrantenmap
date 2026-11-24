import { describe, expect, it, vi } from 'vitest';
import type { ObjektDokument } from '../../common/objektplan/objektDokument';
import type { PdfPlanIndex } from '../../common/objektplan/pdfIndex';
import { reindexDokument } from './reindexRunner';

const box: [number, number, number, number] = [0.1, 0.1, 0.2, 0.2];

const alt: ObjektDokument = {
  id: 'd1',
  name: 'Plan.pdf',
  contentType: 'application/pdf',
  storagePath: 'risikoobjekt/o/d1-Plan.pdf',
  size: 4,
  sha256: 'alt',
  indexStatus: 'ok',
  seiten: 1,
  seitenText: ['LEGENDE'],
  melder: [],
  ocr: true,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'drive',
  quelle: 'drive',
  driveFileId: 'f1',
  driveMd5: 'md5',
};

function deps(index: PdfPlanIndex, ocrIndex?: PdfPlanIndex) {
  return {
    readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    index: vi.fn(async () => index),
    ocr: vi.fn(async () => {
      if (!ocrIndex) throw new Error('Vision');
      return ocrIndex;
    }),
  };
}

describe('reindexDokument', () => {
  it('liest die Datei neu ein und behält Herkunft und Ersteller', async () => {
    const d = deps({
      seiten: 1,
      seitenText: ['Melder 3/05'],
      melder: [{ kennung: '3/05', gruppe: 3, melder: 5, seite: 1, box }],
      textGekuerzt: false,
    });
    const result = await reindexDokument(alt, d);
    expect(d.readFile).toHaveBeenCalledWith('risikoobjekt/o/d1-Plan.pdf');
    expect(d.ocr).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'd1',
      quelle: 'drive',
      driveFileId: 'f1',
      driveMd5: 'md5',
      createdBy: 'drive',
      indexStatus: 'ok',
      seitenText: ['Melder 3/05'],
    });
    expect(result.melder).toHaveLength(1);
    expect(result.sha256).not.toBe('alt');
    // Der alte OCR-Vermerk gilt nicht mehr — die Erkennung darf erneut laufen.
    expect(result.ocr).toBeUndefined();
  });

  it('erkennt den Text erneut, wenn die Textebene keinen Melder hat', async () => {
    const d = deps(
      { seiten: 1, seitenText: ['LEGENDE'], melder: [], textGekuerzt: false },
      {
        seiten: 1,
        seitenText: ['1003/04'],
        melder: [{ kennung: '1003/04', gruppe: 1003, melder: 4, seite: 1, box }],
        textGekuerzt: false,
      },
    );
    const result = await reindexDokument(alt, d);
    expect(d.ocr).toHaveBeenCalledWith('risikoobjekt/o/d1-Plan.pdf', 1);
    expect(result).toMatchObject({ ocr: true, seitenText: ['LEGENDE\n1003/04'] });
    expect(result.melder).toHaveLength(1);
  });

  it('behält den neuen Index, wenn die Texterkennung scheitert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = deps({ seiten: 1, seitenText: [''], melder: [], textGekuerzt: false });
    const result = await reindexDokument(alt, d);
    expect(result).toMatchObject({ indexStatus: 'ohneText' });
    expect(result.ocr).toBeUndefined();
  });

  it('lässt alte Index-Felder nicht stehen', async () => {
    const d = deps({ seiten: 2, seitenText: ['a', 'b'], melder: [], textGekuerzt: false });
    const result = await reindexDokument({ ...alt, textGekuerzt: true }, { ...d, ocr: undefined });
    expect(result.textGekuerzt).toBeUndefined();
    expect(result.seiten).toBe(2);
  });
});
