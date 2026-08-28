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
  collection,
  doc,
  getDocs,
  query,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { addDoc, commitInBatches } from '../../lib/firestoreClient';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId } from '../useFirecall';

/**
 * Die Striche einer Zeichnung liegen nicht im Item-Dokument, sondern in der
 * Untersammlung `stroke` darunter. Wer sie beim Snapshot vergisst, sichert
 * eine leere Zeichnung — und genau das ist lange passiert.
 */
async function strokeOperations(
  firecallId: string,
  historyId: string,
  items: FirecallItem[]
) {
  const drawings = items.filter((item) => item.type === 'drawing' && item.id);

  const perDrawing = await Promise.all(
    drawings.map(async (drawing) => {
      const strokes = await getDocs(
        query(
          collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_ITEMS_COLLECTION_ID,
            drawing.id!,
            'stroke'
          )
        )
      );

      return strokes.docs.map((strokeDoc) => ({
        ref: doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_HISTORY_COLLECTION_ID,
          historyId,
          FIRECALL_ITEMS_COLLECTION_ID,
          drawing.id!,
          'stroke',
          strokeDoc.id
        ) as DocumentReference,
        data: strokeDoc.data() as DocumentData,
      }));
    })
  );

  return perDrawing.flat();
}

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

        const perCollection = await Promise.all(
          [FIRECALL_ITEMS_COLLECTION_ID, FIRECALL_LAYERS_COLLECTION_ID].map(
            async (collectionName) => {
              console.info(`querying for items in ${collectionName} `);
              const itemCollection = collection(
                firestore,
                FIRECALL_COLLECTION_ID,
                firecallId,
                collectionName
              );
              const querySnapshot = await getDocs(query(itemCollection));
              const items: FirecallItem[] = querySnapshot.docs.map(
                (d) => ({ ...d.data(), id: d.id }) as FirecallItem
              );

              console.info(
                `found ${items.length} items in ${collectionName} for history`
              );

              const operations = items.map((item) => ({
                ref: doc(
                  firestore,
                  FIRECALL_COLLECTION_ID,
                  firecallId,
                  FIRECALL_HISTORY_COLLECTION_ID,
                  newHistoryDoc.id,
                  collectionName,
                  item.id!
                ) as DocumentReference,
                data: item as unknown as DocumentData,
              }));

              if (collectionName !== FIRECALL_ITEMS_COLLECTION_ID) {
                return operations;
              }

              return [
                ...operations,
                ...(await strokeOperations(
                  firecallId,
                  newHistoryDoc.id,
                  items
                )),
              ];
            }
          )
        );

        // Ein Batch fasst 500 Schreibvorgänge. Mit den Strichen einer
        // Zeichnung wird die Grenze schnell erreicht, deshalb wird
        // aufgeteilt statt in einem einzigen Batch zu schreiben.
        await commitInBatches(firestore, perCollection.flat());
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
