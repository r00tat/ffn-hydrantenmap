import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';

export const writeCsvFile = (filename: string, data: any[]) => {
  fs.writeFileSync(
    `output/${filename}.csv`,
    stringify(data, {
      header: true,
    })
  );
};
