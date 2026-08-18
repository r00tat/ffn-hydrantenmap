import 'server-only';

import type { drive_v3 } from '@googleapis/drive';
import {
  escapeDriveQueryValue,
  firecallFolderNaming,
} from '../../common/driveFolderName';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Gemeinsame Parameter für jeden Aufruf: ohne `supportsAllDrives` und
 * `includeItemsFromAllDrives` sieht die API nur „Meine Ablage" und findet in
 * einem Shared Drive gar nichts.
 */
const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
};

/**
 * Ordner mit exaktem Namen unterhalb von `parentId`.
 *
 * Gibt es mehrere — etwa weil zwei gleichzeitige Uploads denselben Ordner
 * angelegt haben — gewinnt der älteste. Das ist die Auflösung des Wettlaufs:
 * ein Lock gibt es bewusst nicht, alle Aufrufer konvergieren beim nächsten Mal
 * auf denselben Ordner.
 */
export async function findFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<drive_v3.Schema$File | undefined> {
  const q = [
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
  ].join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id,name,parents,createdTime,webViewLink)',
    orderBy: 'createdTime',
    pageSize: 10,
    corpora: 'allDrives',
    ...SHARED_DRIVE_PARAMS,
  });
  return res.data.files?.[0];
}

export async function ensureFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await findFolder(drive, parentId, name);
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!created.data.id) {
    throw new Error(`could not create drive folder ${name}`);
  }
  return created.data.id;
}

export interface ResolvedFirecallFolder {
  folderId: string;
  folderName: string;
  folderUrl: string;
  /** Der Ordner wurde in diesem Aufruf angelegt. */
  created: boolean;
}

function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Ordner des Einsatzes im Shared Drive, angelegt oder nachgeführt.
 *
 * `knownFolderId` ist das, was am Einsatz gespeichert ist. Ist es gesetzt, wird
 * der Ordner nachgeführt statt neu gesucht — sonst verlöre eine manuelle
 * Umbenennung in Drive alle bisherigen Fotos aus der Anzeige.
 */
export async function resolveFirecallFolder(
  drive: drive_v3.Drive,
  baseFolderId: string,
  firecall: { name?: string; date?: string; created?: string },
  knownFolderId: string | undefined,
  now: Date = new Date(),
): Promise<ResolvedFirecallFolder> {
  const { year, folderName } = firecallFolderNaming(firecall, now);

  if (knownFolderId) {
    const existing = await getFolder(drive, knownFolderId);
    if (existing?.id) {
      const yearFolderId = await ensureFolder(drive, baseFolderId, year);
      const currentParent = existing.parents?.[0];
      const nameChanged = existing.name !== folderName;
      const parentChanged = currentParent !== yearFolderId;

      if (nameChanged || parentChanged) {
        await drive.files.update({
          fileId: existing.id,
          requestBody: nameChanged ? { name: folderName } : {},
          ...(parentChanged
            ? { addParents: yearFolderId, removeParents: currentParent }
            : {}),
          fields: 'id',
          supportsAllDrives: true,
        });
      }
      return {
        folderId: existing.id,
        folderName,
        folderUrl: folderUrl(existing.id),
        created: false,
      };
    }
    // 404 oder Papierkorb: der gespeicherte Ordner ist weg, unten neu anlegen.
  }

  const yearFolderId = await ensureFolder(drive, baseFolderId, year);
  const existing = await findFolder(drive, yearFolderId, folderName);
  if (existing?.id) {
    return {
      folderId: existing.id,
      folderName,
      folderUrl: folderUrl(existing.id),
      created: false,
    };
  }
  const folderId = await ensureFolder(drive, yearFolderId, folderName);
  return { folderId, folderName, folderUrl: folderUrl(folderId), created: true };
}

/** `files.get`, aber ein gelöschter Ordner ist kein Fehler, sondern `undefined`. */
export async function getFolder(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<drive_v3.Schema$File | undefined> {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,parents,trashed,webViewLink,driveId',
      supportsAllDrives: true,
    });
    return res.data.trashed ? undefined : res.data;
  } catch (err) {
    if ((err as { code?: number }).code === 404) return undefined;
    throw err;
  }
}
