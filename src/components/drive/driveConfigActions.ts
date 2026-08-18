'use server';
import 'server-only';

import { actionAdminRequired } from '../../app/auth';
import { DRIVE_CONFIG_COLLECTION_ID, DriveConfig } from '../../common/drive';
import { driveClient } from '../../server/drive/driveClient';
import { firestore } from '../../server/firebase/admin';

export async function getDriveConfig(
  groupId: string,
): Promise<DriveConfig | null> {
  await actionAdminRequired();
  const doc = await firestore
    .collection(DRIVE_CONFIG_COLLECTION_ID)
    .doc(groupId)
    .get();
  return doc.exists ? (doc.data() as DriveConfig) : null;
}

export async function saveDriveConfig(
  groupId: string,
  baseFolderId: string,
): Promise<void> {
  const session = await actionAdminRequired();
  const trimmed = baseFolderId.trim();
  if (!trimmed) {
    throw new Error('baseFolderId is required');
  }
  await firestore
    .collection(DRIVE_CONFIG_COLLECTION_ID)
    .doc(groupId)
    .set({
      groupId,
      baseFolderId: trimmed,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email ?? '',
    } satisfies DriveConfig);
}

export async function deleteDriveConfig(groupId: string): Promise<void> {
  await actionAdminRequired();
  await firestore.collection(DRIVE_CONFIG_COLLECTION_ID).doc(groupId).delete();
}

export interface DriveFolderCheck {
  success: boolean;
  folderName?: string;
  driveName?: string;
  error?: string;
}

/**
 * Holt die Metadaten des Basisordners. Ohne diese Probe fällt eine falsch
 * kopierte ID erst beim ersten Upload auf — und dann dem Nutzer, nicht dem
 * Admin.
 */
export async function checkDriveFolder(
  baseFolderId: string,
): Promise<DriveFolderCheck> {
  await actionAdminRequired();
  try {
    const drive = driveClient();
    const folder = await drive.files.get({
      fileId: baseFolderId.trim(),
      fields: 'id,name,mimeType,driveId',
      supportsAllDrives: true,
    });
    if (folder.data.mimeType !== 'application/vnd.google-apps.folder') {
      return { success: false, error: 'notAFolder' };
    }
    let driveName: string | undefined;
    if (folder.data.driveId) {
      const shared = await drive.drives.get({ driveId: folder.data.driveId });
      driveName = shared.data.name ?? undefined;
    }
    return {
      success: true,
      folderName: folder.data.name ?? undefined,
      driveName,
    };
  } catch (err) {
    console.error('drive folder check failed', err);
    return { success: false, error: (err as Error).message };
  }
}
