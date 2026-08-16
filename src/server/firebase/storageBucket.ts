import 'server-only';

import { getAdminStorage } from './admin';
import { getGcpProjectId } from './project';

/**
 * Der Standard-Bucket des Projekts.
 *
 * `initializeApp()` läuft ohne `storageBucket`, deshalb wirft
 * `getStorage().bucket()` ohne Namen „Bucket name not specified". Der Name
 * wird aus der Projekt-ID abgeleitet — derselbe Bucket, auf den sich auch die
 * Freigabe der `storage.rules` in `terraform/modules/project-base` bezieht.
 */
export async function getDefaultStorageBucket() {
  const projectId = await getGcpProjectId();
  return getAdminStorage().bucket(`${projectId}.appspot.com`);
}
