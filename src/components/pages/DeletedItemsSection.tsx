'use client';

import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { where } from 'firebase/firestore';
import { useMemo } from 'react';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../firebase/firestore';

const byDeletionDesc = (a: FirecallItem, b: FirecallItem) =>
  (b.updatedAt || b.datum || '').localeCompare(a.updatedAt || a.datum || '');

/**
 * Gelöschte Ebenen und Elemente des Einsatzes zum Wiederherstellen. Gelöscht
 * wird weich (`deleted: true`), die Dokumente sind also noch da. Nur
 * eingeblendet, solange die Ansicht offen ist — die Abfrage läuft sonst nicht.
 */
export default function DeletedItemsSection() {
  const firecallId = useFirecallId();
  const queryConstraints = useMemo(() => [where('deleted', '==', true)], []);

  const deletedLayers = useFirebaseCollection<FirecallLayer>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_LAYERS_COLLECTION_ID],
    queryConstraints,
  });
  const deletedItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_ITEMS_COLLECTION_ID],
    queryConstraints,
  });

  const sorted = useMemo(
    () => [
      ...[...deletedLayers].sort(byDeletionDesc),
      ...[...deletedItems].sort(byDeletionDesc),
    ],
    [deletedLayers, deletedItems]
  );

  return (
    <>
      <Typography variant="h5" sx={{ mt: 3 }}>
        Gelöschte Elemente
      </Typography>
      {sorted.length === 0 ? (
        <Typography color="text.secondary">
          Keine gelöschten Elemente.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {sorted.map((item) => (
            <FirecallItemCard
              item={item}
              key={`${item.type}-${item.id}`}
              compact
              size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
            />
          ))}
        </Grid>
      )}
    </>
  );
}
