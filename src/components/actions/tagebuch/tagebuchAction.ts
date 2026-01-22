'use server';
import 'server-only';

import moment from 'moment';
import { actionUserAuthorizedForFirecall } from '../../../app/auth';
import { getSpreadsheetData } from '../../../server/spreadsheet';
import { Diary } from '../../firebase/firestore';

export async function listSheetTagebuchEntriesAction(
  firecallId: string
): Promise<Diary[]> {
  const firecall = await actionUserAuthorizedForFirecall(firecallId);

  const sheetId = firecall.sheetId || process.env.EINSATZMAPPE_SHEET_ID;

  if (!sheetId) {
    return [];
  }

  const sheetData = await getSpreadsheetData(sheetId, 'Einsatztagebuch!A3:G', {
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const day = moment(firecall.alarmierung || firecall.date).format(
    'YYYY-MM-DD'
  );

  const diaries = sheetData
    .filter(([time, von, an, art, name, complete, erledigt]) => time && name)
    .map(
      ([time, von, an, art, name, complete, erledigt]) =>
        ({
          id: `${day}T${time}`,
          datum: `${day}T${time}`,
          von,
          an,
          art,
          name,
          erledigt,
          editable: false,
        } as Diary)
    );

  return diaries;
}
