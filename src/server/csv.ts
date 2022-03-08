import { parse } from 'csv-parse/sync';
import * as fs from 'fs';

export const readCsvFile = <T>(inputCsv: string) => {
  if (!fs.existsSync(inputCsv)) {
    console.error(`file ${inputCsv} does not exist`);
    process.exit(2);
  }

  console.info(`reading csv ${inputCsv}`);

  const csvData = fs.readFileSync(inputCsv, { encoding: 'utf8' });

  const records: T[] = parse(csvData, {
    columns: (header: string[]) =>
      header.map((column: string) =>
        column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      ),
    skip_empty_lines: true,
  });

  console.info(`parsed ${records.length} records`);

  return records;
};
