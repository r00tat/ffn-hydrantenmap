import { geohashForLocation } from 'geofire-common';
import {
  GeohashCluster,
  GEOHASH_PRECISION,
  GisObject,
  WgsObject,
} from '../common/gis-objects';
import firebaseAdmin from './firebase/admin';
import * as fs from 'fs';
import { writeBatches } from './firebase/import';

interface GeohashMap {
  [hash: string]: GeohashCluster;
}

async function clusterImport(clusterCollectionName: string) {
  const db = firebaseAdmin.firestore();

  console.info(`fetching existing clusters`);
  const geohashes: GeohashMap = (
    await db.collection(clusterCollectionName).get()
  ).docs
    .map((doc) => doc.data() as unknown as GeohashCluster)
    .reduce((p, c) => {
      p[c.geohash] = c;
      return p;
    }, {} as GeohashMap);
  console.info(
    `found ${Object.keys(geohashes).length} geohashes: ${Object.keys(
      geohashes
    )}`
  );

  // const collectionName = 'risikoobjekt';
  for (const collectionName of [
    'risikoobjekt',
    'gefahrobjekt',
    'loeschteich',
    'saugstelle',
  ]) {
    console.info(`searching for ${collectionName} records`);
    const objects: WgsObject[] = (
      await db.collection(collectionName).get()
    ).docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as unknown as WgsObject)
    );

    objects.forEach((record) => {
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
      if (!geohashes[hash][collectionName]) {
        geohashes[hash][collectionName] = [];
      }
      geohashes[hash][collectionName]?.push(record);
    });
  }

  console.info(`geohashes updated.`);

  fs.writeFileSync(
    'output/geohashes.jsonl',
    Object.entries(geohashes)
      .map(([hash, h]) =>
        JSON.stringify({ [`geohash_${GEOHASH_PRECISION}`]: hash, ...h })
      )
      .join('\n')
  );

  console.info(`calculated ${Object.keys(geohashes).length} geohashes`);

  await writeBatches(clusterCollectionName, geohashes);

  console.info(`finished update.`);
}

process.on('uncaughtException', (err) => {
  console.log(`Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

if (require.main === module) {
  console.info(`main firestore import`);
  if (process.argv.length < 3) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} collection`);
    process.exit(1);
  }

  (async () => {
    try {
      await clusterImport(process.argv[2]);
    } catch (err: any) {
      console.error(`Import failed ${err.message}\n${err.stack}`);
    }
  })();
}

export default clusterImport;
