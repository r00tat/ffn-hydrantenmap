import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { geohashForLocation } from 'geofire-common';
import firebaseAdmin from './firebase/admin';
import {
  HydrantenRecord,
  GeohashCluster,
  GEOHASH_PRECISION,
} from './gis-objects';
import { writeCsvFile } from './utils';
import { gk34ToWgs84 } from './wgs-convert';

const readCsvFile = (inputCsv: string) => {
  if (!fs.existsSync(inputCsv)) {
    console.error(`file ${inputCsv} does not exist`);
    process.exit(2);
  }

  console.info(`reading csv ${inputCsv}`);

  const csvData = fs.readFileSync(inputCsv, { encoding: 'utf8' });

  const records: HydrantenRecord[] = parse(csvData, {
    columns: (header: string[]) =>
      header.map((column: string) =>
        column.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      ),
    skip_empty_lines: true,
  });

  console.info(`parsed ${records.length} records`);

  return records;
};

const convertRecord = (record: HydrantenRecord): HydrantenRecord => {
  // convert numbers
  const data: any = {};
  Object.entries(record)
    .filter(([key, value]) => key)
    .forEach(([key, value]: [string, any]) => {
      const n = Number.parseFloat(value);
      data[key] = Number.isNaN(n) ? value : n;
    });

  // convert wgs coordinates
  const wgs = gk34ToWgs84(data.c_x, data.c_y, 'EPSG:31256');
  return {
    ...data,
    lat: wgs.y,
    lng: wgs.x,
    geohash: geohashForLocation([wgs.y, wgs.x]),
  };
};

const convertEntries = (records: HydrantenRecord[]) => {
  return records.map(convertRecord);
};

const writeBatches = async (
  collectionName: string,
  records: { [key: string]: any }
) => {
  console.info(`writing ${Object.keys(records).length} to ${collectionName}`);
  const firestore = firebaseAdmin.firestore();
  const batches = [];
  let batch = firestore.batch();

  const collection = firestore.collection(collectionName);
  Object.entries(records).forEach(([hash, record], index) => {
    batch.set(collection.doc(hash), record);
    if (index % 400 == 0) {
      batches.push(batch);
      batch = firestore.batch();
    }
  });

  if (Object.keys(records).length % 400 !== 0) {
    batches.push(batch);
  }

  console.info(`${batches.length} batches to commit for ${collectionName}`);
  for (const b of batches) {
    console.info(`commiting batch.`);
    await b.commit();
  }
  console.info(`all batches for ${collectionName} written.`);
};

const firestoreImport = async (collectionName: string, inputCsv: string) => {
  const recordsRaw = readCsvFile(inputCsv);
  const records = convertEntries(recordsRaw);
  console.info(`converted ${records.length} records`);

  writeCsvFile(`hydranten_parsed`, records);

  // await writeBatches(
  //   'hydranten2',
  //   records.reduce((prev, cur) => {
  //     prev[cur.name] = cur;
  //     return prev;
  //   }, {} as { [key: string]: HydrantenRecord })
  // );

  const geohashes: { [hash: string]: GeohashCluster } = {};
  records.forEach((record) => {
    const hash = geohashForLocation(
      [record.lat || 0, record.lng || 0],
      GEOHASH_PRECISION
    );
    if (!geohashes[hash]) {
      geohashes[hash] = {
        hydranten: [],
        geohash: hash,
      };
    }
    geohashes[hash].hydranten.push(record);
  });

  writeCsvFile(
    'geohashes',
    Object.entries(geohashes).map(([hash, record]) => ({
      [`geohash_${GEOHASH_PRECISION}`]: hash,
      ...record,
    }))
  );

  fs.writeFileSync(
    'output/geohashes.jsonl',
    Object.entries(geohashes)
      .map(([hash, h]) =>
        JSON.stringify({ [`geohash_${GEOHASH_PRECISION}`]: hash, ...h })
      )
      .join('\n')
  );

  console.info(`calculated ${Object.keys(geohashes).length} geohashes`);

  await writeBatches(collectionName, geohashes);

  console.info(
    `${Object.keys(geohashes).length} geohashes imported to ${collectionName}`
  );
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
