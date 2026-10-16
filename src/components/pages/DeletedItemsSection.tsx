'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
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
 * wird weich (`deleted: true`), die Dokumente sind also noch da. Ein eigener,
 * zugeklappter Abschnitt unter den Ebenen; die Zahl im Kopf zeigt, ob es
 * überhaupt etwas zurückzuholen gibt.
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
    () => [...[...deletedLayers].sort(byDeletionDesc), ...[...deletedItems].sort(byDeletionDesc)],
    [deletedLayers, deletedItems],
  );

  return (
    <Accordion sx={{ mt: 3 }} disableGutters>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="deleted-items-content"
        id="deleted-items-header"
      >
        <Typography variant="h5">Gelöschte Elemente ({sorted.length})</Typography>
      </AccordionSummary>
      <AccordionDetails id="deleted-items-content">
        {sorted.length === 0 ? (
          <Typography color="text.secondary">Keine gelöschten Elemente.</Typography>
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
      </AccordionDetails>
    </Accordion>
  );
}
