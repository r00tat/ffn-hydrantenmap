import { collection, query, QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { firestore } from '../components/firebase';

export interface FirebaseCollectionOptions {
  collectionName: string;
  queryConstraints?: QueryConstraint[];
  pathSegments?: string[];
}

export default function useFirebaseCollection<T>(
  options: FirebaseCollectionOptions
) {
  const { collectionName, queryConstraints = [], pathSegments = [] } = options;

  const [records, setRecords] = useState<Array<T>>([]);
  const [value, loading, error] = useCollection(
    query(
      collection(firestore, collectionName, ...pathSegments),
      ...queryConstraints
    )
  );

  useEffect(() => {
    if (value) {
      // console.info(`got firstore collection records`);
      setRecords(
        value?.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as unknown as T)
        )
      );
    } else if (error) {
      setRecords([]);
    }
  }, [error, value]);
  return records;
}
