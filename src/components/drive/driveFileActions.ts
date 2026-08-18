'use server';
import 'server-only';

import { actionUserAuthorizedForFirecall } from '../../app/auth';
import {
  DRIVE_CONFIG_COLLECTION_ID,
  DRIVE_UPLOAD_MAX_FILES,
  DRIVE_UPLOAD_MAX_SIZE,
  DriveConfig,
  DriveFile,
  FirecallDriveState,
} from '../../common/drive';
import { firecallFolderNaming } from '../../common/driveFolderName';
import { requestOrigin } from '../../server/auth/baseUrl';
import { driveAccessToken } from '../../server/auth/driveAuth';
import { driveClient } from '../../server/drive/driveClient';
import { resolveFirecallFolder } from '../../server/drive/firecallFolder';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';

const RESUMABLE_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';

async function baseFolderIdForGroup(group: string): Promise<string | undefined> {
  const doc = await firestore
    .collection(DRIVE_CONFIG_COLLECTION_ID)
    .doc(group)
    .get();
  return doc.exists ? (doc.data() as DriveConfig).baseFolderId : undefined;
}

export interface DriveUploadRequest {
  name: string;
  mimeType: string;
  size: number;
}

export interface DriveUploadSession {
  name: string;
  uploadUrl: string;
}

/**
 * Legt den Einsatz-Ordner an (falls nötig) und eröffnet je Datei eine resumable
 * Upload-Session. Die Bytes lädt der Browser danach direkt zu Google — über
 * Cloud Run läuft nur diese Handvoll JSON.
 */
export async function createDriveUploadSessions(
  firecallId: string,
  files: DriveUploadRequest[],
): Promise<DriveUploadSession[]> {
  const firecall = await actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
  });

  if (files.length === 0) return [];
  if (files.length > DRIVE_UPLOAD_MAX_FILES) {
    throw new Error(`too many files (max ${DRIVE_UPLOAD_MAX_FILES})`);
  }
  for (const file of files) {
    if (!file.name || typeof file.size !== 'number' || file.size < 0) {
      throw new Error('invalid file entry');
    }
    if (file.size > DRIVE_UPLOAD_MAX_SIZE) {
      throw new Error(`file ${file.name} exceeds the size limit`);
    }
  }

  const baseFolderId = await baseFolderIdForGroup(firecall.group!);
  if (!baseFolderId) {
    throw new Error('no drive configured for this group');
  }

  const drive = driveClient();
  const folder = await resolveFirecallFolder(
    drive,
    baseFolderId,
    firecall,
    firecall.driveFolderId,
    new Date(),
  );

  if (folder.folderId !== firecall.driveFolderId) {
    await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .set({ driveFolderId: folder.folderId }, { merge: true });
  }

  const token = await driveAccessToken();
  // Der Origin-Header beim Eröffnen ist das, woran die Session ihre
  // CORS-Erlaubnis knüpft — ohne ihn kann der Browser die Bytes nicht liefern.
  const origin = await requestOrigin();

  return Promise.all(
    files.map(async (file) => {
      const res = await fetch(RESUMABLE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': file.mimeType || 'application/octet-stream',
          'X-Upload-Content-Length': String(file.size),
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          parents: [folder.folderId],
        }),
      });
      const uploadUrl = res.headers.get('location');
      if (!res.ok || !uploadUrl) {
        throw new Error(
          `could not start upload for ${file.name}: ${res.status}`,
        );
      }
      return { name: file.name, uploadUrl };
    }),
  );
}

/**
 * Zustand des Drive-Abschnitts. Leserecht am Einsatz genügt — die Fotos gehören
 * zum Einsatz und nicht zur Verwaltung.
 */
export async function getFirecallDriveState(
  firecallId: string,
): Promise<FirecallDriveState> {
  const firecall = await actionUserAuthorizedForFirecall(firecallId);
  const { folderName } = firecallFolderNaming(firecall, new Date());

  const baseFolderId = firecall.group
    ? await baseFolderIdForGroup(firecall.group)
    : undefined;
  if (!baseFolderId) {
    return { configured: false, folderName, files: [] };
  }
  if (!firecall.driveFolderId) {
    // Noch nie hochgeladen: kein Ordner, nichts anzufragen.
    return { configured: true, folderName, files: [] };
  }

  const drive = driveClient();
  const res = await drive.files.list({
    q: `'${firecall.driveFolderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,webViewLink,createdTime)',
    orderBy: 'createdTime',
    pageSize: 100,
    corpora: 'allDrives',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files: DriveFile[] = (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? '',
    mimeType: f.mimeType ?? '',
    webViewLink: f.webViewLink ?? undefined,
    createdTime: f.createdTime ?? undefined,
  }));

  return {
    configured: true,
    folderName,
    folderId: firecall.driveFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${firecall.driveFolderId}`,
    files,
  };
}
