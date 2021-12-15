import { useEffect, useState } from 'react';
import { parse } from 'csv-parse/sync';
import { Hydrant } from '../pages/api/hydranten';

export default function useHydranten() {
  const [hydranten, setHydranten] = useState<Hydrant[]>([]);
  useEffect(() => {
    (async () => {
      const hydrantenCsv = await (await fetch('/hydranten.csv')).text();
      const records = parse(hydrantenCsv, {
        columns: true,
        skip_empty_lines: true,
      });
      setHydranten(records);
    })();
  }, []);
  return hydranten;
}
