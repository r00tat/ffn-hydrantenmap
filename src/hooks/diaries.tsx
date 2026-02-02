import { useEffect, useState } from 'react';
import { useFirecallId } from './useFirecall';
import { Diary } from '../components/firebase/firestore';
import { listSheetTagebuchEntriesAction } from '../components/actions/tagebuch/tagebuchAction';

export function useSpreadsheetDiaries() {
  const firecallId = useFirecallId();
  const [diaries, setDiaries] = useState<Diary[]>([]);

  useEffect(() => {
    if (firecallId === 'unknown') {
      setDiaries([]);
      return;
    }
    (async () => {
      const sheetEntries = await listSheetTagebuchEntriesAction(firecallId);
      setDiaries(sheetEntries);
    })();
  }, [firecallId]);

  return diaries;
}
