import * as fs from 'fs';
import { geohashForLocation } from 'geofire-common';
import {
  GEOHASH_PRECISION,
  GeohashCluster,
  WgsObject,
} from '../common/gis-objects';
import { firestore } from './firebase/admin';
import { writeBatches } from './firebase/import';

type GeohashMap = Record<string, GeohashCluster>;

const removeDuplicates = (geohashes: GeohashMap, collectionName: string) => {
  for (const geohash of Object.values(geohashes)) {
    const collectionData = geohash[collectionName] as WgsObject[];
    if (collectionData) {
      const ids = collectionData.map((element) => element.id);
      geohash[collectionName] = collectionData.filter(
        (element, i) => ids.indexOf(element.id) === i
      );
    }
  }
};

async function clusterImport() {
  const clusterCollectionName = `clusters${GEOHASH_PRECISION}`;

  console.info(`fetching existing clusters`);
  const geohashes: GeohashMap = (
    await firestore.collection(clusterCollectionName).get()
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
    'hydrant',
  ]) {
    const subCollection =
      collectionName === 'hydrant' ? 'hydranten' : collectionName;
    console.info(`removing duplicates of ${collectionName}`);
    removeDuplicates(geohashes, collectionName);
    console.info(`searching for ${collectionName} records`);
    const objects: WgsObject[] = (
      await firestore.collection(collectionName).get()
    ).docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as unknown as WgsObject)
    );
    console.info(`found ${objects.length} ${collectionName} items`);

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
      if (!geohashes[hash][subCollection]) {
        geohashes[hash][subCollection] = [];
      }
      // console.info(
      //   `record ${subCollection} ${record.id} ${record.name} ${hash}`
      // );
      const existingRecord = (
        geohashes[hash][subCollection] as WgsObject[]
      ).find((value) => value.id === record.id);
      if (existingRecord) {
        Object.assign(existingRecord, record);
      } else {
        geohashes[hash][subCollection]?.push(record);
      }
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
  // console.info(`records: ${JSON.stringify(geohashes['u2ebzt'])}`);

  await writeBatches(clusterCollectionName, geohashes);

  console.info(`finished update.`);
}

process.on('uncaughtException', (err) => {
  console.log(`Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

if (require.main === module) {
  console.info(`main firestore import`);
  // if (process.argv.length < 3) {
  //   console.error(`Usage: ${process.argv[0]} ${process.argv[1]} collection`);
  //   process.exit(1);
  // }

  (async () => {
    try {
      await clusterImport();
    } catch (err: any) {
      console.error(`Import failed ${err.message}\n${err.stack}`);
    }
  })();
}

export default clusterImport;
