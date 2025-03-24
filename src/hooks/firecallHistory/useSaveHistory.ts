import { useCallback, useState } from 'react';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_HISTORY_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallHistory,
  FirecallItem,
} from '../../components/firebase/firestore';
import { firestore } from '../../components/firebase/firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  writeBatch,
} from 'firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId } from '../useFirecall';

/**
 * saves the current state of all items in the firecall to the history collection
 * @param description string optional description for the history entry
 */
export const useSaveHistory = () => {
  const firecallId = useFirecallId();
  const [saveInProgress, setSaveInProgress] = useState(false);
  const saveHistory = useCallback(
    async (description?: string) => {
      console.info('saving history');
      setSaveInProgress(true);
      try {
        const batch = writeBatch(firestore);
        const historyCollection = collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_HISTORY_COLLECTION_ID
        );

        const newHistoryDoc = await addDoc(historyCollection, {
          description:
            description || `Einsatz Status um ${formatTimestamp(new Date())}`,
          createdAt: new Date().toISOString(),
        } as FirecallHistory);
        console.info(`new history doc: ${newHistoryDoc.id}`);

        await Promise.all(
          [FIRECALL_ITEMS_COLLECTION_ID, FIRECALL_LAYERS_COLLECTION_ID].map(
            async (collectionName) => {
              console.info(`querying for items in ${collectionName} `);
              const itemCollection = collection(
                firestore,
                FIRECALL_COLLECTION_ID,
                firecallId,
                collectionName
              );
              const q = query(itemCollection);
              const querySnapshot = await getDocs(q);
              const items: FirecallItem[] = [];
              querySnapshot.forEach((doc) => {
                items.push({ ...doc.data(), id: doc.id } as FirecallItem);
              });

              console.info(
                `found ${items.length} items in ${collectionName} for history`
              );

              items.forEach((item) => {
                const itemRef = doc(
                  firestore,
                  FIRECALL_COLLECTION_ID,
                  firecallId,
                  FIRECALL_HISTORY_COLLECTION_ID,
                  newHistoryDoc.id,
                  collectionName,
                  item.id!
                );
                batch.set(itemRef, item);
              });
            }
          )
        );
        await batch.commit();
        console.info(`history ${newHistoryDoc.id} commited.`);
      } catch (err) {
        console.error(`failed to save history: ${err}`, err);
      }
      console.info(`history save complete`);
      setSaveInProgress(false);
    },
    [firecallId]
  );

  return { saveHistory, saveInProgress };
};
