import { mapWithConcurrency } from '../../common/mapWithConcurrency';
import type {
  DriveUploadRequest,
  DriveUploadSession,
} from './driveFileActions';
import { uploadToDriveSession } from './uploadToDriveSession';

/**
 * Dateien je Aufruf von `createDriveUploadSessions`. Klein genug, dass der
 * Server die Sessions zügig eröffnet, und deutlich unter seiner Grenze
 * (`DRIVE_UPLOAD_MAX_FILES`) — so geht auch eine Auswahl von 50 Fotos.
 */
export const UPLOAD_BATCH_SIZE = 10;

/**
 * Gleichzeitige Uploads. Mit allen Dateien auf einmal teilten sich Dutzende
 * große Fotos die Mobilverbindung, und Drive drosselte das Anlegen der
 * Dateien am Ende jedes Uploads.
 */
export const UPLOAD_CONCURRENCY = 3;

export interface UploadDeps {
  createSessions: (
    firecallId: string,
    files: DriveUploadRequest[],
  ) => Promise<DriveUploadSession[]>;
  upload?: typeof uploadToDriveSession;
  /** Fortschritt in Prozent je Datei, nach ihrer Position in `files`. */
  onProgress?: (index: number, percent: number) => void;
}

export interface UploadResult {
  uploaded: number;
  failed: number;
}

/**
 * Lädt die Dateien paketweise ins Drive des Einsatzes. Ein Paket, dessen
 * Sessions nicht eröffnet werden können, zählt als fehlgeschlagen; die
 * übrigen Pakete laufen weiter.
 */
export async function uploadFilesToDrive(
  firecallId: string,
  files: File[],
  { createSessions, upload = uploadToDriveSession, onProgress }: UploadDeps,
): Promise<UploadResult> {
  const result: UploadResult = { uploaded: 0, failed: 0 };

  for (let offset = 0; offset < files.length; offset += UPLOAD_BATCH_SIZE) {
    const batch = files.slice(offset, offset + UPLOAD_BATCH_SIZE);
    let sessions: DriveUploadSession[];
    try {
      sessions = await createSessions(
        firecallId,
        batch.map((f) => ({
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          size: f.size,
        })),
      );
    } catch (err) {
      console.error('could not start drive upload', err);
      result.failed += batch.length;
      continue;
    }

    await mapWithConcurrency(sessions, UPLOAD_CONCURRENCY, async (session, i) => {
      const index = offset + i;
      try {
        await upload(session.uploadUrl, batch[i], (loaded, total) =>
          onProgress?.(index, total > 0 ? (loaded / total) * 100 : 0),
        );
        result.uploaded += 1;
      } catch (err) {
        console.error(`drive upload of ${session.name} failed`, err);
        result.failed += 1;
      }
    });
  }

  return result;
}
