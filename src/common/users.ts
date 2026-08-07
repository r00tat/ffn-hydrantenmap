import { UserRecord } from 'firebase-admin/auth';

export interface FirebaseUserInfo {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
  groups?: string[];
  isAdmin?: boolean;
  /** Einsatz-Gast: der einzige Einsatz, auf den dieser Benutzer Zugriff hat. */
  firecall?: string;
  /**
   * Darf der Einsatz-Gast den Einsatz bearbeiten? Nur relevant, wenn `firecall`
   * gesetzt ist. Fehlt das Feld, gilt Schreibzugriff (siehe `guestCanWrite`).
   */
  firecallWrite?: boolean;
}

export interface UserRecordExtended extends UserRecord, FirebaseUserInfo {
  // combine FirebaseUserInfo and UserRecord
}

export const userTextFields: { [key: string]: string } = {
  displayName: 'Name',
  description: 'Zusatzinfo',
};
