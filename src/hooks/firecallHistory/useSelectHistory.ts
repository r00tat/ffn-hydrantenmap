import { useCallback, useMemo, useState } from 'react';
import { FIRECALL_HISTORY_COLLECTION_ID } from '../../components/firebase/firestore';

export default function useSelectHistory() {
  const [historyId, setHistoryId] = useState<string | undefined>(undefined);

  const selectHistory = useCallback(
    (id?: string) => {
      console.info(`loading history: ${id}`);
      setHistoryId(id);
    },
    [setHistoryId]
  );

  const historyPathSegments = useMemo(
    () => (historyId ? [FIRECALL_HISTORY_COLLECTION_ID, historyId] : []),
    [historyId]
  );

  return { selectHistory, historyPathSegments, historyId };
}
