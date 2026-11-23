/**
 * Abgleich der Unterlagen eines Risikoobjekts mit seinem Drive-Link: welche
 * Dateien neu oder geändert sind und welche Dokumente wegfallen. Reine
 * Planung ohne Drive und Firestore; ausgeführt wird sie in
 * `server/objektplan/driveSync.ts`. Hintergrund: docs/objektplaene.md.
 */
import {
  isAllowedObjektDokumentType,
  OBJEKT_DOKUMENT_MAX_MB,
  type ObjektDokument,
} from './objektDokument';

export interface DriveLink {
  /** `unknown` bei `open?id=` — dort klärt erst der Abruf, was dahinter liegt. */
  kind: 'folder' | 'file' | 'unknown';
  id: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string;
  size?: number;
  /** Fortlaufende Version der Datei; bei Google-Dokumenten der Änderungsmerker. */
  version?: string;
}

export interface DriveImport {
  file: DriveFileInfo;
  dokumentId: string;
  /** Vorhandenes Dokument derselben Datei, dessen Storage-Datei zu ersetzen ist. */
  replaces?: ObjektDokument;
}

export interface DriveSyncPlan {
  importFiles: DriveImport[];
  remove: ObjektDokument[];
  skipped: DriveFileInfo[];
}

const DRIVE_ID = '[A-Za-z0-9_-]{20,}';

/** Ordner-, Datei- oder `open?id=`-Link auf drive.google.com, sonst `null`. */
export function parseDriveLink(link: string | undefined): DriveLink | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.hostname !== 'drive.google.com') return null;
  const folder = url.pathname.match(new RegExp(`/folders/(${DRIVE_ID})`));
  if (folder) return { kind: 'folder', id: folder[1] };
  const file = url.pathname.match(new RegExp(`/file/d/(${DRIVE_ID})`));
  if (file) return { kind: 'file', id: file[1] };
  const id = url.searchParams.get('id');
  if (id && new RegExp(`^${DRIVE_ID}$`).test(id)) return { kind: 'unknown', id };
  return null;
}

/** Unterordner mit überholten Ständen werden nicht übernommen. */
export function isSkippedDriveFolder(name: string): boolean {
  return /^(archiv|alt|alte|old|veraltet)\b/i.test(name.trim());
}

/** Feste ID: zwei gleichzeitige Abgleiche schreiben dasselbe Dokument. */
export function driveDokumentId(driveFileId: string): string {
  return `drive-${driveFileId}`;
}

/**
 * Google-Dokumente ohne eigene Datei, die Drive als PDF exportiert. Ein
 * Laufkarten-Doc oder eine Präsentation mit Fotos ist eine Unterlage wie ein
 * PDF. Formulare, Sites und Verknüpfungen nicht.
 */
const GOOGLE_PDF_EXPORT_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

export interface DriveImportFormat {
  /** über `files/{id}/export` holen statt herunterladen */
  exportPdf: boolean;
  name: string;
  contentType: string;
}

/** Wie eine Drive-Datei abgelegt wird: Google-Dokumente als PDF mit Endung. */
export function driveImportFormat(file: DriveFileInfo): DriveImportFormat {
  if (!GOOGLE_PDF_EXPORT_TYPES.has(file.mimeType)) {
    return { exportPdf: false, name: file.name, contentType: file.mimeType };
  }
  return {
    exportPdf: true,
    name: /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`,
    contentType: 'application/pdf',
  };
}

function isImportable(file: DriveFileInfo): boolean {
  // Die Größe eines Google-Dokuments steht erst nach dem Export fest; den
  // begrenzt Drive selbst (10 MB).
  if (GOOGLE_PDF_EXPORT_TYPES.has(file.mimeType)) return true;
  return (
    isAllowedObjektDokumentType(file.mimeType) &&
    (file.size ?? 0) <= OBJEKT_DOKUMENT_MAX_MB * 1024 * 1024
  );
}

/** Geändert seit dem letzten Abgleich: md5 bei Dateien, Version bei Google-Dokumenten. */
function hasChanged(file: DriveFileInfo, existing: ObjektDokument): boolean {
  if (GOOGLE_PDF_EXPORT_TYPES.has(file.mimeType)) {
    return existing.driveVersion !== file.version;
  }
  return existing.driveMd5 !== file.md5Checksum;
}

export function planDriveSync(
  files: DriveFileInfo[],
  dokumente: ObjektDokument[],
): DriveSyncPlan {
  const byDriveId = new Map(
    dokumente
      .filter((d) => d.quelle === 'drive' && d.driveFileId)
      .map((d) => [d.driveFileId as string, d]),
  );
  const importFiles: DriveImport[] = [];
  const skipped: DriveFileInfo[] = [];
  const keep = new Set<string>();

  for (const file of files) {
    if (!isImportable(file)) {
      skipped.push(file);
      continue;
    }
    keep.add(file.id);
    const existing = byDriveId.get(file.id);
    if (!existing) {
      importFiles.push({ file, dokumentId: driveDokumentId(file.id) });
    } else if (hasChanged(file, existing)) {
      importFiles.push({ file, dokumentId: existing.id, replaces: existing });
    }
  }

  const remove = [...byDriveId.entries()]
    .filter(([driveId]) => !keep.has(driveId))
    .map(([, d]) => d);

  return { importFiles, remove, skipped };
}
