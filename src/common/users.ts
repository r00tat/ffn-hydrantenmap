import { UserRecord } from 'firebase-admin/lib/auth/user-record';

export interface UserRecordExtended extends UserRecord {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
}

export const userTextFields: { [key: string]: string } = {
  description: 'Zusatzinfo',
};
