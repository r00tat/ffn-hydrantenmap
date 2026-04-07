import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { geohashForLocation } from 'geofire-common';
import {
  GEOHASH_PRECISION,
  GeohashCluster,
  WgsObject,
} from '../../../../common/gis-objects';
import { firestore } from '../../../../server/firebase/admin';
import { writeBatches } from '../../../../server/firebase/import';

type GeohashMap = Record<string, GeohashCluster>;

function createProgressStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const send = (data: Record<string, unknown>) => {
    if (controller) {
      controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
    }
  };

  const close = () => {
    if (controller) {
      controller.close();
    }
  };

  return { stream, send, close };
}

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

export async function POST() {
  // Check admin auth
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { stream, send, close } = createProgressStream();

  // Process in background
  (async () => {
    try {
      const clusterCollectionName = `clusters${GEOHASH_PRECISION}`;

      // Step 0: Fetch existing clusters
      send({ step: 0, status: 'in_progress', message: 'Fetching existing clusters...' });
      const geohashes: GeohashMap = (
        await firestore.collection(clusterCollectionName).get()
      ).docs
        .map((doc) => doc.data() as unknown as GeohashCluster)
        .reduce((p, c) => {
          p[c.geohash] = c;
          return p;
        }, {} as GeohashMap);
      send({ step: 0, status: 'completed', count: Object.keys(geohashes).length });

      // Step 1: Fetch all collections
      send({ step: 1, status: 'in_progress', message: 'Fetching collections...' });
      const collections = ['risikoobjekt', 'gefahrobjekt', 'loeschteich', 'saugstelle', 'hydrant'];

      for (const collectionName of collections) {
        const subCollection = collectionName === 'hydrant' ? 'hydranten' : collectionName;

        removeDuplicates(geohashes, subCollection);

        const objects: WgsObject[] = (
          await firestore.collection(collectionName).get()
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
          if (!geohashes[hash][subCollection]) {
            geohashes[hash][subCollection] = [];
          }
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
      send({ step: 1, status: 'completed' });

      // Step 2: Merge data (already done in step 1, just signal progress)
      send({ step: 2, status: 'in_progress', message: 'Merging data...' });
      send({ step: 2, status: 'completed', count: Object.keys(geohashes).length });

      // Step 3: Write to Firestore
      send({ step: 3, status: 'in_progress', message: 'Writing to Firestore...' });
      await writeBatches(clusterCollectionName, geohashes, { merge: true });
      send({ step: 3, status: 'completed', count: Object.keys(geohashes).length });
    } catch (err) {
      send({ step: 0, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
