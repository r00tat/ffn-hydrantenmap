import {
  collection,
  getDocs,
  query,
  QueryConstraint,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../components/firebase/app';
import { useCollection } from 'react-firebase-hooks/firestore';

export interface QueryFilter {
  field: string;
  operator: '';
  value: any;
}

export default function useFirebaseCollection<T>(
  collectionName: string,
  queryConstraints: QueryConstraint[] = []
) {
  const [records, setRecords] = useState<Array<T>>([]);
  const [value, loading, error] = useCollection(
    query(collection(firestore, collectionName), ...queryConstraints)
  );

  useEffect(() => {
    if (value) {
      // console.info(`got firstore collection records`);
      setRecords(value?.docs.map((doc) => doc.data() as T));
    }
  }, [value]);
  return records;
}
