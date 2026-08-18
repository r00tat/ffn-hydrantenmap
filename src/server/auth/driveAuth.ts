import 'server-only';

import { GoogleAuth, JWT } from 'googleapis-common';

/**
 * Voller Drive-Scope, nicht `drive.file`: mit `drive.file` sieht die App nur
 * selbst erzeugte Dateien und fände den vorhandenen Basisordner nicht.
 */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Google-Auth für Drive.
 *
 * Bewusst **nicht** `createWorkspaceAuth`: das setzt `subject` und impersoniert
 * `EINSATZMAPPE_IMPERSONATION_ACCOUNT`, sobald die Variable gesetzt ist. Hier
 * soll der Service Account selbst schreiben — die Dateien gehören dann dem
 * Shared Drive und es braucht keine Domain-Wide Delegation, sondern nur eine
 * Mitgliedschaft im Shared Drive.
 */
export function createDriveAuth(): GoogleAuth | JWT {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    return new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      keyId: serviceAccount.private_key_id,
      projectId: serviceAccount.project_id,
      clientId: serviceAccount.client_id,
      scopes: DRIVE_SCOPES,
    });
  }
  return new GoogleAuth({ scopes: DRIVE_SCOPES });
}

/** Access-Token für Aufrufe, die nicht über den Drive-Client laufen (Upload-Session, Thumbnail). */
export async function driveAccessToken(): Promise<string> {
  const auth = createDriveAuth();
  // Bei `GoogleAuth` hängt das Token am Client, bei `JWT` an der Auth selbst.
  const client = auth instanceof JWT ? auth : await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('no access token for drive');
  return token;
}
