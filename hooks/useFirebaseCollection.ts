import { collection, query, QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { firestore } from '../components/firebase';

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
    } else if (error) {
      setRecords([]);
    }
  }, [error, value]);
  return records;
}
