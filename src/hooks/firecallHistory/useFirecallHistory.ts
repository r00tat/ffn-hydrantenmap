import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_HISTORY_COLLECTION_ID,
  FirecallHistory,
} from '../../components/firebase/firestore';
import useFirebaseCollection from '../useFirebaseCollection';
import { useFirecallId } from '../useFirecall';

export default function useFirecallHistory() {
  const firecallId = useFirecallId();
  const history = useFirebaseCollection<FirecallHistory>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_HISTORY_COLLECTION_ID],
  });

  return history;
}
