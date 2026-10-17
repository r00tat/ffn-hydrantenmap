'use client';

import { doc, writeBatch } from 'firebase/firestore';
import { useCallback } from 'react';
import { logAuditChange } from '../../../hooks/useAuditLog';
import { useFirecallId } from '../../../hooks/useFirecall';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useMapEditor from '../../../hooks/useMapEditor';
import { commitBatchLocal } from '../../../lib/firestoreClient';
import { firestore } from '../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../firebase/firestore';
import { ensureConnectionDerived } from '../../FirecallItems/elements/connection/ensureConnectionDerived';
import { isStreetRoutingItem } from '../../FirecallItems/elements/connection/streetRouting';
import { useMapSelectionStore } from './MapSelectionContext';
import {
  LatLngDelta,
  positionSignature,
  SelectionPreview,
  translateItem,
} from './multiSelect';

/**
 * Wie lange die Vorschau nach dem Speichern stehen bleibt. Sie fällt ohnehin
 * weg, sobald das Abo die neue Lage liefert (siehe `SelectionPreview`); das
 * hier räumt nur auf, falls ein Element gar nicht ankommt.
 */
const PREVIEW_CLEANUP_MS = 5000;

/**
 * Verschiebt alle ausgewählten Elemente um dieselbe Strecke.
 *
 * Erst ein Verlaufsstand, dann ein einziger Batch und je Element ein
 * Audit-Eintrag. Der Batch wird lokal abgesetzt (`commitBatchLocal`), die
 * Karte wartet nicht auf den Server.
 */
export default function useMoveSelection() {
  const store = useMapSelectionStore();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const { saveHistory } = useMapEditor();

  /** Vorschau während des Zuges, ohne zu schreiben. */
  const previewMove = useCallback(
    (delta: LatLngDelta, sourceId: string) => {
      if (!store) return;
      const current = store.getState().preview;
      const origins =
        current && current.sourceId === sourceId
          ? current.origins
          : Object.fromEntries(
              store
                .movableItems()
                .map((item) => [item.id as string, positionSignature(item)])
            );
      store.setPreview({ delta, sourceId, origins });
    },
    [store]
  );

  const cancelPreview = useCallback(() => store?.setPreview(undefined), [store]);

  const moveSelection = useCallback(
    async (delta: LatLngDelta, sourceId: string) => {
      if (!store) return;
      const moves = store
        .movableItems()
        .map((item) => ({ item, translation: translateItem(item, delta) }))
        .filter(
          (m): m is typeof m & { translation: NonNullable<typeof m.translation> } =>
            m.translation !== undefined
        );
      if (moves.length === 0) {
        store.setPreview(undefined);
        return;
      }

      // Die Vorschau hält die Elemente am Ziel, während der Verlaufsstand
      // geschrieben wird — er muss die Lage **vor** dem Verschieben sichern.
      const preview: SelectionPreview = {
        delta,
        sourceId,
        origins: Object.fromEntries(
          moves.map(({ item }) => [item.id as string, positionSignature(item)])
        ),
      };
      store.setPreview(preview);

      await saveHistory(`Status vor Verschieben von ${moves.length} Elementen`);

      const batch = writeBatch(firestore);
      const now = new Date().toISOString();
      for (const { item, translation } of moves) {
        batch.set(
          doc(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_ITEMS_COLLECTION_ID,
            item.id as string
          ),
          {
            ...translation.newValue,
            updatedAt: now,
            ...(email ? { updatedBy: email } : {}),
          },
          { merge: true }
        );
      }
      commitBatchLocal(batch, `${moves.length} Elemente verschieben`);

      for (const { item, translation } of moves) {
        if (email) {
          logAuditChange(firecallId, email, {
            action: 'update',
            elementType: item.type,
            elementId: item.id as string,
            elementName: item.name || '',
            previousValue: translation.previousValue,
            newValue: translation.newValue,
          });
        }
        // Straßenverlauf und Höhenprofil passen nach dem Verschieben nicht
        // mehr. Nicht abwarten: beides fragt Dienste im Netz ab.
        if (isStreetRoutingItem(item.type)) {
          void ensureConnectionDerived(firecallId, {
            ...item,
            ...translation.newValue,
          } as MultiPointItem);
        }
      }

      setTimeout(() => {
        if (store.getState().preview === preview) store.setPreview(undefined);
      }, PREVIEW_CLEANUP_MS);
    },
    [store, firecallId, email, saveHistory]
  );

  return { previewMove, moveSelection, cancelPreview };
}
