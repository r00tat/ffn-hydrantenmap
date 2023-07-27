import { HazmatMaterial } from '../common/hazmat';
import { getSpreadsheetData } from './spreadsheet';

const spreadsheetId = '1DRbtC19T32Knpj4qtU-cxmwY1fnFKnUPuyFpWEWXpMg';

// in memory cache
const hazmatRecords: any[][] = [];

export async function fetchHazmatDb() {
  if (hazmatRecords.length === 0) {
    const data = await getSpreadsheetData(spreadsheetId, 'A2:E');
    hazmatRecords.push(
      ...data.map(([num, ...row]) => [`${num}`.padStart(4, '0'), ...row])
    );
  }
  return hazmatRecords;
}

export async function queryHazmatDb(unNumber?: string, name?: string) {
  let unName = name?.toLowerCase();
  const data = await fetchHazmatDb();
  return data
    .filter(
      (row) =>
        (unNumber === undefined || row[0].indexOf(unNumber) === 0) &&
        (unName === undefined || `${row[1]}`.toLowerCase().indexOf(unName) >= 0)
    )
    .map(
      ([unNumber, name2, resistanceTemperature, resistanceTime, damage]) =>
        ({
          unNumber,
          name: name2,
          resistanceTemperature,
          resistanceTime,
          damage,
        } as HazmatMaterial)
    );
}
