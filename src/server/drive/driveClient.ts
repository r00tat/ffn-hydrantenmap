import 'server-only';

import { drive, drive_v3 } from '@googleapis/drive';
import { createDriveAuth } from '../auth/driveAuth';

export function driveClient(): drive_v3.Drive {
  return drive({ version: 'v3', auth: createDriveAuth() });
}

export type { drive_v3 };
