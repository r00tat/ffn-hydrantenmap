/**
 * Ablauf des Drive-Abgleichs eines Risikoobjekts. Drive, Storage, Firestore
 * und pdfjs kommen als `deps` herein (`driveSyncDeps.ts`), damit der Ablauf
 * ohne sie testbar ist. Hintergrund: docs/objektplaene.md.
 */
import { describeObjektDokument } from '../../common/objektplan/describeDokument';
import {
  driveImportFormat,
  parseDriveLink,
  planDriveSync,
  type DriveFileInfo,
  type DriveLink,
} from '../../common/objektplan/driveSync';
import {
  objektDokumentStoragePath,
  wantsOcr,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
import { withOcrIndex } from '../../common/objektplan/ocrIndex';
import type { PdfPlanIndex } from '../../common/objektplan/pdfIndex';

export interface DriveSyncDeps {
  listFiles(link: DriveLink): Promise<DriveFileInfo[]>;
  download(fileId: string): Promise<Uint8Array>;
  /** Google-Dokument als PDF exportieren. */
  exportPdf(fileId: string): Promise<Uint8Array>;
  index(data: Uint8Array): Promise<PdfPlanIndex>;
  saveFile(path: string, data: Uint8Array, contentType: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  loadDokumente(objektId: string): Promise<ObjektDokument[]>;
  writeDokument(objektId: string, dokument: ObjektDokument): Promise<void>;
  deleteDokument(objektId: string, dokumentId: string): Promise<void>;
  /**
   * Texterkennung der abgelegten Datei für Scans ohne Textebene. Fehlt sie,
   * bleibt der Scan unindiziert.
   */
  ocr?(storagePath: string): Promise<PdfPlanIndex>;
}

export type DriveSyncResult =
  | { status: 'keinDriveLink' }
  | { status: 'nichtLesbar' }
  | { status: 'ok'; imported: number; removed: number; skipped: number; failed: number };

/** Als Ersteller vermerkt — der Abgleich läuft für jeden, der den Plan öffnet. */
const DRIVE_CREATOR = 'drive';

async function deleteFileQuietly(deps: DriveSyncDeps, path: string) {
  try {
    await deps.deleteFile(path);
  } catch (err) {
    console.warn('Datei konnte nicht gelöscht werden', path, err);
  }
}

export async function runDriveSync(
  objektId: string,
  link: string | undefined,
  deps: DriveSyncDeps,
  now: string = new Date().toISOString(),
): Promise<DriveSyncResult> {
  const driveLink = parseDriveLink(link);
  if (!driveLink) return { status: 'keinDriveLink' };

  let files: DriveFileInfo[];
  try {
    files = await deps.listFiles(driveLink);
  } catch (err) {
    // Ohne Liste wird nichts gelöscht: ein fehlendes Recht darf die
    // vorhandenen Pläne nicht verschwinden lassen.
    console.error('Drive-Ordner nicht lesbar', objektId, err);
    return { status: 'nichtLesbar' };
  }

  const plan = planDriveSync(files, await deps.loadDokumente(objektId));
  let imported = 0;
  let failed = 0;

  // Nacheinander: der Dienst hat 1 GiB, ein Plan kann 55 MB haben.
  for (const { file, dokumentId, replaces } of plan.importFiles) {
    try {
      const format = driveImportFormat(file);
      const data = format.exportPdf
        ? await deps.exportPdf(file.id)
        : await deps.download(file.id);
      const storagePath = objektDokumentStoragePath(objektId, dokumentId, format.name);
      let dokument = await describeObjektDokument(
        {
          id: dokumentId,
          name: format.name,
          contentType: format.contentType,
          storagePath,
          size: format.exportPdf ? data.byteLength : (file.size ?? data.byteLength),
          createdAt: now,
          createdBy: DRIVE_CREATOR,
          quelle: 'drive',
          driveFileId: file.id,
          ...(format.exportPdf
            ? file.version
              ? { driveVersion: file.version }
              : {}
            : file.md5Checksum
              ? { driveMd5: file.md5Checksum }
              : {}),
        },
        data,
        deps.index,
      );
      // Erst die Datei, dann das Dokument: ein Dokument ohne Datei zeigte
      // einen Plan an, der nicht lädt.
      await deps.saveFile(storagePath, data, format.contentType);
      // Vision liest die Datei aus dem Bucket, deshalb erst nach dem Ablegen.
      // Scheitert die Erkennung, bleibt der Scan ohne Text — der Plan selbst
      // ist wichtiger als seine Durchsuchbarkeit. Auch ein PDF mit Textebene,
      // aber ohne Melder geht durch die Erkennung (siehe `wantsOcr`).
      if (wantsOcr(dokument) && deps.ocr) {
        try {
          dokument = withOcrIndex(dokument, await deps.ocr(storagePath));
        } catch (err) {
          console.error('Texterkennung fehlgeschlagen', objektId, file.name, err);
        }
      }
      await deps.writeDokument(objektId, dokument);
      if (replaces && replaces.storagePath !== storagePath) {
        await deleteFileQuietly(deps, replaces.storagePath);
      }
      imported += 1;
    } catch (err) {
      console.error('Drive-Datei nicht übernommen', objektId, file.id, file.name, err);
      failed += 1;
    }
  }

  for (const dokument of plan.remove) {
    await deps.deleteDokument(objektId, dokument.id);
    await deleteFileQuietly(deps, dokument.storagePath);
  }

  return {
    status: 'ok',
    imported,
    removed: plan.remove.length,
    skipped: plan.skipped.length,
    failed,
  };
}
