import { collection, query, QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { firestore } from '../components/firebase/firebase';

export interface FirebaseCollectionOptions<T> {
  collectionName: string;
  queryConstraints?: QueryConstraint[];
  pathSegments?: string[];
  filterFn?: (element: T) => boolean;
}

export default function useFirebaseCollection<T>(
  options: FirebaseCollectionOptions<T>
) {
  const {
    collectionName,
    queryConstraints = [],
    pathSegments = [],
    filterFn,
  } = options;

  const [records, setRecords] = useState<Array<T>>([]);
  const [value, loading, error] = useCollection(
    query(
      collection(firestore, collectionName, ...pathSegments),
      ...queryConstraints
    )
  );

  // useEffect(() => {
  //   console.info(
  //     `firestore query: ${[collectionName, ...pathSegments].join('/')}`
  //   );
  // }, [collectionName, pathSegments]);

  useEffect(() => {
    if (value) {
      const records = value?.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as unknown as T)
      );
      // console.info(
      //   `got firstore collection records ${value.docs.length} filtered: ${records.length}`
      // );
      setRecords(filterFn ? records.filter(filterFn) : records);
    } else if (error) {
      setRecords([]);
    }
  }, [error, filterFn, value]);
  return records;
}
