import { useEffect, useState } from 'react';
import { parse } from 'csv-parse/sync';
import { Hydrant } from '../pages/api/hydranten';
import { firebaseApp, firestore } from '../components/firebase/app';
import { collection, getDocs } from 'firebase/firestore';

export default function useHydranten() {
  const [hydranten, setHydranten] = useState<Hydrant[]>([]);
  useEffect(() => {
    (async () => {
      // const hydrantenCsv = await (await fetch('/hydranten.csv')).text();
      // const records = parse(hydrantenCsv, {
      //   columns: true,
      //   skip_empty_lines: true,
      // });
      // setHydranten(records);
      const querySnapshot = await getDocs(collection(firestore, 'hydrant'));
      setHydranten(querySnapshot.docs.map((doc) => doc.data() as Hydrant));
    })();
  }, []);
  return hydranten;
}
