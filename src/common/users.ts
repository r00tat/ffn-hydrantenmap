import { UserRecord } from 'firebase-admin/auth';

export interface FirebaseUserInfo {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
  groups?: string[];
  isAdmin?: boolean;
  firecall?: string;
}

export interface UserRecordExtended extends UserRecord, FirebaseUserInfo {
  // combine FirebaseUserInfo and UserRecord
}

export const userTextFields: { [key: string]: string } = {
  description: 'Zusatzinfo',
};
