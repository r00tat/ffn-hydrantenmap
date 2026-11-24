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
import type { DriveSyncDeps } from './driveSyncRunner';
import { ocrStoragePdf } from './ocrDokument';
import { indexPdfOnServer } from './pdfjsNode';

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
 * @param storageGroups Freigabe des Objekts als Metadatum der Dateien
 *   (`storageGroupsMetadata`) — die Storage-Regel prüft sie.
 */
export function driveSyncDeps(storageGroups: string): DriveSyncDeps {
  return {
    listFiles,
    download,
    exportPdf,
    index: indexPdfOnServer,
    ocr: (storagePath, pageCount) =>
      ocrStoragePdf(storagePath, storagePath.replace(/[^A-Za-z0-9_-]/g, '_'), pageCount),
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
    async loadDokumente({ art, id }) {
      const snap = await firestore.collection(objektDokumentCollectionPath(art, id)).get();
      return snap.docs.map((d) => ({ ...(d.data() as ObjektDokument), id: d.id }));
    },
    async writeDokument({ art, id }, dokument) {
      await firestore
        .collection(objektDokumentCollectionPath(art, id))
        .doc(dokument.id)
        .set(dokument);
    },
    async deleteDokument({ art, id }, dokumentId) {
      await firestore.collection(objektDokumentCollectionPath(art, id)).doc(dokumentId).delete();
    },
  };
}
