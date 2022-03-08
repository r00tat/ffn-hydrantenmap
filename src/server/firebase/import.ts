import firebaseAdmin from './admin';

export async function writeBatches(
  collectionName: string,
  records: { [key: string]: any }
) {
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
}
