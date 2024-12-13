import { google } from 'googleapis';
import { GoogleAuth, JWT } from 'googleapis-common';

/**
 * create an Google Auth object to be used for googleapis
 * @param scopes Oauth2 scopes to use for the google or JWT auth
 * @returns <GoogleAuth|JWT> authentication object
 */
export function createWorkspaceAuth(scopes: string[]) {
  let auth: GoogleAuth | JWT;

  if (
    process.env.GOOGLE_SERVICE_ACCOUNT &&
    process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT
  ) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      keyId: serviceAccount.private_key_id,
      projectId: serviceAccount.project_id,
      clientId: serviceAccount.client_id,
      scopes,
      subject: process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT,
    });
  } else {
    auth = new google.auth.GoogleAuth({
      scopes,
    });
  }

  return auth;
}
