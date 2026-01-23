import { firestore } from './admin';

export async function writeBatches(
  collectionName: string,
  records: { [key: string]: any },
  options?: { merge?: boolean }
) {
  const merge = options?.merge ?? false;
  console.info(
    `writing ${Object.keys(records).length} to ${collectionName}${merge ? ' (merge mode)' : ''}`
  );
  const batches = [];
  let batch = firestore.batch();

  const collection = firestore.collection(collectionName);
  Object.entries(records).forEach(([hash, record], index) => {
    if (merge) {
      batch.set(collection.doc(hash), record, { merge: true });
    } else {
      batch.set(collection.doc(hash), record);
    }
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
}
