/**
 * Ein Dokument aus Datei und Index beschreiben — gemeinsam für den Upload im
 * Browser und den Drive-Abgleich auf dem Server, damit beide denselben
 * Status vergeben.
 */
import {
  objektDokumentKind,
  type ObjektDokument,
} from './objektDokument';
import type { PdfPlanIndex } from './pdfIndex';

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type DokumentBase = Omit<ObjektDokument, 'sha256' | 'indexStatus'>;

export async function describeObjektDokument(
  base: DokumentBase,
  data: Uint8Array,
  index: (data: Uint8Array) => Promise<PdfPlanIndex>,
): Promise<ObjektDokument> {
  const kind = objektDokumentKind(base.contentType);
  const dokument: ObjektDokument = {
    ...base,
    sha256: await sha256Hex(data),
    indexStatus: kind === 'bild' ? 'bild' : 'fehler',
  };
  if (kind !== 'pdf') return dokument;
  try {
    const result = await index(data);
    const hasText = result.seitenText.some((t) => t.trim().length > 0);
    return {
      ...dokument,
      indexStatus: hasText ? 'ok' : 'ohneText',
      seiten: result.seiten,
      seitenText: result.seitenText,
      melder: result.melder,
      ...(result.textGekuerzt ? { textGekuerzt: true } : {}),
    };
  } catch (err) {
    // Ein unlesbares PDF wird trotzdem abgelegt — anzeigen kann es der
    // Browser vielleicht dennoch, und die Unterlage ist wichtiger als der Index.
    console.error('Plan konnte nicht indiziert werden', base.name, err);
    return dokument;
  }
}
