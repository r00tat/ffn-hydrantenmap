import 'server-only';

import { driveAccessToken } from '../auth/driveAuth';
import { driveClient, type drive_v3 } from '../drive/driveClient';
import { firestore } from '../firebase/admin';
import { getDefaultStorageBucket } from '../firebase/storageBucket';
import {
  isSkippedDriveFolder,
  type DriveFileInfo,
  type DriveLink,
} from '../../common/objektplan/driveSync';
import {
  objektDokumentCollectionPath,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
import { indexPdf, type PdfjsLike } from '../../common/objektplan/pdfIndex';
import type { DriveSyncDeps } from './driveSyncRunner';
import { ocrStoragePdf } from './ocrDokument';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,mimeType,md5Checksum,size,version,trashed';
/** Unterordner wie „Laufkarten" ja, beliebig tiefe Ablagen nein. */
const MAX_DEPTH = 2;

function toInfo(f: drive_v3.Schema$File): DriveFileInfo {
  return {
    id: f.id ?? '',
    name: f.name ?? f.id ?? '',
    mimeType: f.mimeType ?? '',
    ...(f.md5Checksum ? { md5Checksum: f.md5Checksum } : {}),
    ...(f.size ? { size: Number(f.size) } : {}),
    ...(f.version ? { version: String(f.version) } : {}),
  };
}

async function listFolder(
  drive: drive_v3.Drive,
  folderId: string,
  depth: number,
): Promise<DriveFileInfo[]> {
  const result: DriveFileInfo[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id) continue;
      if (f.mimeType === FOLDER_MIME) {
        if (depth < MAX_DEPTH && !isSkippedDriveFolder(f.name ?? '')) {
          result.push(...(await listFolder(drive, f.id, depth + 1)));
        }
      } else {
        result.push(toInfo(f));
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return result;
}

async function listFiles(link: DriveLink): Promise<DriveFileInfo[]> {
  const drive = driveClient();
  if (link.kind === 'folder') return listFolder(drive, link.id, 0);
  const res = await drive.files.get({
    fileId: link.id,
    fields: FILE_FIELDS,
    supportsAllDrives: true,
  });
  if (res.data.trashed) return [];
  if (res.data.mimeType === FOLDER_MIME) return listFolder(drive, link.id, 0);
  return [toInfo(res.data)];
}

async function download(fileId: string): Promise<Uint8Array> {
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive-Download ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Google-Dokument als PDF; Drive begrenzt den Export auf 10 MB. */
async function exportPdf(fileId: string): Promise<Uint8Array> {
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive-Export ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Der Legacy-Build läuft unter Node und nimmt dort einen Fake-Worker im
 * selben Thread. Den holt pdfjs sonst per dynamischem Import über
 * `workerSrc` (`./pdf.worker.mjs`) — den verfolgt das Tracing des
 * Standalone-Builds nicht, im Container fehlte die Datei. Vorab geladen
 * und unter `globalThis.pdfjsWorker` abgelegt, nimmt pdfjs ihn von dort.
 */
async function loadPdfjsForNode(): Promise<PdfjsLike> {
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike;
}

/**
 * @param storageGroups Freigabe des Objekts als Metadatum der Dateien
 *   (`storageGroupsMetadata`) — die Storage-Regel prüft sie.
 */
export function driveSyncDeps(storageGroups: string): DriveSyncDeps {
  return {
    listFiles,
    download,
    exportPdf,
    index: (data) => indexPdf(data, loadPdfjsForNode),
    ocr: (storagePath) => ocrStoragePdf(storagePath, storagePath.replace(/[^A-Za-z0-9_-]/g, '_')),
    async saveFile(path, data, contentType) {
      const bucket = await getDefaultStorageBucket();
      await bucket.file(path).save(Buffer.from(data), {
        contentType,
        resumable: false,
        metadata: { metadata: { groups: storageGroups } },
      });
    },
    async deleteFile(path) {
      const bucket = await getDefaultStorageBucket();
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
    async loadDokumente(objektId) {
      const snap = await firestore.collection(objektDokumentCollectionPath(objektId)).get();
      return snap.docs.map((d) => ({ ...(d.data() as ObjektDokument), id: d.id }));
    },
    async writeDokument(objektId, dokument) {
      await firestore
        .collection(objektDokumentCollectionPath(objektId))
        .doc(dokument.id)
        .set(dokument);
    },
    async deleteDokument(objektId, dokumentId) {
      await firestore.collection(objektDokumentCollectionPath(objektId)).doc(dokumentId).delete();
    },
  };
}
