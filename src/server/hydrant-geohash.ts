import * as fs from 'fs';
import { geohashForLocation } from 'geofire-common';
import {
  GeohashCluster,
  GEOHASH_PRECISION,
  HydrantenRecord,
} from '../common/gis-objects';
import { gk34ToWgs84 } from '../common/wgs-convert';
import { readCsvFile } from './csv';
import { writeBatches } from './firebase/import';
import { writeCsvFile } from './utils';

const convertRecord = <T = HydrantenRecord>(
  record: T,
  projection = 'EPSG:31256'
): T => {
  // convert numbers
  const data: any = {};
  Object.entries(record)
    .filter(([key, value]) => key)
    .forEach(([key, value]: [string, any]) => {
      const n = Number.parseFloat(value);
      data[key] = Number.isNaN(n) ? value : n;
    });

  // convert wgs coordinates
  const wgs = gk34ToWgs84(data.c_x, data.c_y, projection);
  return {
    ...data,
    lat: wgs.y,
    lng: wgs.x,
    geohash: geohashForLocation([wgs.y, wgs.x]),
  };
};

const convertEntries = (records: HydrantenRecord[]) => {
  return records.map((r) => convertRecord(r));
};

const firestoreImport = async (collectionName: string, inputCsv: string) => {
  const recordsRaw = readCsvFile<HydrantenRecord>(inputCsv);
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
    if (!geohashes[hash].hydranten) {
      geohashes[hash].hydranten = [];
    }
    geohashes[hash].hydranten?.push(record);
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
      await firestoreImport(process.argv[2], process.argv[3]);
    } catch (err: any) {
      console.error(`Import failed ${err.message}\n${err.stack}`);
    }
  })();
}

export default firestoreImport;
