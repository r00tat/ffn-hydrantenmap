'use server';

import { google } from 'googleapis';
import moment from 'moment';
import { parseTimestamp } from '../../common/time-format';
import { Firecall } from '../firebase/firestore';

/**
 * duplicate Firecall sheet on creation of a new firecall
 */

const SCOPES = ['https://www.googleapis.com/auth/drive'];

export async function copyFirecallSheet(firecall: Firecall): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
  });

  const tmstp = moment(parseTimestamp(firecall.alarmierung));

  const drive = google.drive({ version: 'v3', auth });

  const parentFolder = process.env.EINSATZMAPPE_SHEET_FOLDER || '';

  const existingFolder = (
    await drive.files.list({
      supportsAllDrives: true,
      q: `mimeType = 'application/vnd.google-apps.folder' AND parents = '${parentFolder}' AND name = '${tmstp.format(
        'YYYY'
      )}'`,
    })
  ).data;

  let parentId: string;
  if (existingFolder.files && existingFolder.files[0].id) {
    parentId = existingFolder.files[0].id;
  } else {
    // folder for this year does not exist, create it
    const newFolder = (
      await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: tmstp.format('YYYY'),
          parents: [parentFolder],
          mimeType: 'application/vnd.google-apps.folder',
        },
      })
    ).data;

    parentId = newFolder.id || 'this should exist now';
  }

  const newFile = (
    await drive.files.copy({
      fileId: process.env.EINSATZMAPPE_SHEET_ID,
      supportsAllDrives: true,
      requestBody: {
        parents: [parentId],
        name: `${tmstp.locale('de').format('YYYY-MM-DD')} ${firecall.name}`,
      },
    })
  ).data;

  return newFile.id || 'this should be a valid id for a new file';
}
