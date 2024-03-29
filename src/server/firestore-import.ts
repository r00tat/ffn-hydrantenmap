import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { GisWgsObject, WgsObject } from '../common/gis-objects';
import { writeBatches } from './firebase/import';

interface GisWgsImportObject extends GisWgsObject {
  ortschaft: string;
}

const convertValuesToNumber = (record: WgsObject) => {
  const data: any = {};
  Object.entries(record).forEach(([key, value]: [string, any]) => {
    const n = Number.parseFloat(value);
    data[key] = Number.isNaN(n) ? value : n;
  });
  return data;
};

const firestoreImport = async (collectionName: string, inputCsv: string) => {
  if (!fs.existsSync(inputCsv)) {
    console.error(`file ${inputCsv} does not exist`);
    process.exit(2);
  }

  console.info(
    `starting import process for ${collectionName} from ${inputCsv}`
  );

  const csvData = fs.readFileSync(inputCsv, { encoding: 'utf8' });

  const records: GisWgsImportObject[] = parse(csvData, {
    columns: (header: string[]) =>
      header.map((column: string) =>
        column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      ),
    skip_empty_lines: true,
  });

  console.info(`parsed ${records.length} records`);

  const recordMap = records.map(convertValuesToNumber).reduce((p, c) => {
    p[
      c.name.startsWith(c.ortschaft.toLowerCase())
        ? c.name.toLowerCase()
        : `${c.ortschaft}${c.name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
    ] = c;
    return p;
  }, {});

  await writeBatches(collectionName, recordMap);

  console.info(`${records.length} imported to ${collectionName}`);
};

process.on('uncaughtException', (err) => {
  console.log(`Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

if (require.main === module) {
  console.info(`main firestore import`);
  if (process.argv.length < 4) {
    console.error(
      `Usage: ${process.argv[0]} ${process.argv[1]} collection file`
    );
    process.exit(1);
  }

  (async () => {
    try {
      firestoreImport(process.argv[2], process.argv[3]);
    } catch (err: any) {
      console.error(`Import failed ${err.message}\n${err.stack}`);
    }
  })();
}

export default firestoreImport;
