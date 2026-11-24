/**
 * Ein abgelegtes Dokument neu einlesen: Datei aus Storage, Index neu, bei
 * Bedarf Texterkennung. Für Pläne, die mit einem älteren Stand indiziert
 * wurden (Melderkennung, OCR-Regel). Hintergrund: docs/objektplaene.md.
 */
import { describeObjektDokument } from '../../common/objektplan/describeDokument';
import { wantsOcr, type ObjektDokument } from '../../common/objektplan/objektDokument';
import { withOcrIndex } from '../../common/objektplan/ocrIndex';
import type { PdfPlanIndex } from '../../common/objektplan/pdfIndex';

export interface ReindexDeps {
  readFile(storagePath: string): Promise<Uint8Array>;
  index(data: Uint8Array): Promise<PdfPlanIndex>;
  ocr?(storagePath: string): Promise<PdfPlanIndex>;
}

export async function reindexDokument(
  dokument: ObjektDokument,
  deps: ReindexDeps,
): Promise<ObjektDokument> {
  // Alles, was der Index liefert, fällt weg — auch der OCR-Vermerk, sonst
  // verhinderte er den neuen Versuch.
  const {
    sha256: _sha256,
    indexStatus: _indexStatus,
    seiten: _seiten,
    seitenText: _seitenText,
    melder: _melder,
    textGekuerzt: _textGekuerzt,
    ocr: _ocr,
    ...base
  } = dokument;
  const data = await deps.readFile(dokument.storagePath);
  let next = await describeObjektDokument(base, data, deps.index);
  if (wantsOcr(next) && deps.ocr) {
    try {
      next = withOcrIndex(next, await deps.ocr(dokument.storagePath));
    } catch (err) {
      console.error('Texterkennung fehlgeschlagen', dokument.storagePath, err);
    }
  }
  return next;
}
