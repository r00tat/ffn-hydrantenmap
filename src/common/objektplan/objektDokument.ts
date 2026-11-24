/**
 * Unterlagen zu einem Risikoobjekt (Brandschutzpläne, Laufkarten, Fotos).
 * Je Datei ein Dokument unter `risikoobjekt/{objektId}/dokument/{id}`, die
 * Datei selbst in Storage. Hintergrund: docs/objektplaene.md.
 */
import type { MelderEntry } from './melderIndex';

/**
 * Höchstgröße einer Datei. Steht ebenso in `storage.rules`; ein Test
 * vergleicht beide. Der größte vorhandene Plan hat 55 MB.
 */
export const OBJEKT_DOKUMENT_MAX_MB = 100;

/**
 * - `ok`: Text gelesen (Melder können trotzdem fehlen)
 * - `ohneText`: PDF ohne Textebene (Scan oder in Kurven gewandelt)
 * - `bild`: Bilddatei, nicht indiziert
 * - `fehler`: Lesen gescheitert, Datei trotzdem abgelegt
 */
export type ObjektDokumentIndexStatus = 'ok' | 'ohneText' | 'bild' | 'fehler';

export interface ObjektDokument {
  id: string;
  name: string;
  contentType: string;
  storagePath: string;
  size: number;
  /** Hex-SHA-256 der Datei — Version für den Offline-Zwischenspeicher. */
  sha256: string;
  indexStatus: ObjektDokumentIndexStatus;
  seiten?: number;
  seitenText?: string[];
  textGekuerzt?: boolean;
  /** Text und Melder stammen aus der Texterkennung (Scan), nicht aus der Textebene. */
  ocr?: boolean;
  melder?: MelderEntry[];
  createdAt: string;
  createdBy: string;
  /**
   * Gruppe, in der der Hochladende `risikoobjekte.manage` hat — die
   * Firestore-Regel prüft daran das Anlegen. Fehlt bei Admin und Drive.
   */
  gruppe?: string;
  /** `drive`: vom Abgleich mit dem Drive-Link angelegt, fehlt bei Uploads. */
  quelle?: 'drive';
  driveFileId?: string;
  /** md5 der Drive-Datei beim Abgleich — ändert er sich, wird neu geholt. */
  driveMd5?: string;
  /**
   * Version eines Google-Dokuments beim Abgleich. Docs, Tabellen und
   * Präsentationen haben keine md5; sie werden als PDF exportiert und bei
   * einer neuen Version neu geholt.
   */
  driveVersion?: string;
}

export type ObjektDokumentKind = 'pdf' | 'bild';

/**
 * Lohnt die Texterkennung? Für einen Scan ohne Textebene ohnehin, aber auch
 * für ein PDF mit Textebene ohne einen einzigen Melder: CAD-Exporte zeichnen
 * die Melderkennungen oft als Linien (SHX-Schriften), die Textebene hat dann
 * nur Legende und Raumnamen. Einmal je Dokument, `ocr` merkt sich den Versuch.
 */
export function wantsOcr(dokument: ObjektDokument): boolean {
  if (dokument.ocr || objektDokumentKind(dokument.contentType) !== 'pdf') return false;
  if (dokument.indexStatus === 'ohneText') return true;
  return dokument.indexStatus === 'ok' && (dokument.melder?.length ?? 0) === 0;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function isAllowedObjektDokumentType(contentType: string): boolean {
  return contentType === 'application/pdf' || ALLOWED_IMAGE_TYPES.includes(contentType);
}

export function objektDokumentKind(contentType: string): ObjektDokumentKind {
  return contentType === 'application/pdf' ? 'pdf' : 'bild';
}

export function objektDokumentStoragePath(
  objektId: string,
  dokumentId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `risikoobjekt/${objektId}/${dokumentId}-${safeName}`;
}

export function objektDokumentCollectionPath(objektId: string): string {
  return `risikoobjekt/${objektId}/dokument`;
}
