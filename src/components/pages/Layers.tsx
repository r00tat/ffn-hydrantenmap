import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { orderBy } from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';
import {
  FirecallItem,
  filterActiveItems,
  filterDisplayableItems,
} from '../firebase/firestore';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { SimpleMap } from '../../common/types';

export default function LayersPage() {
  const { isAuthorized } = useFirebaseLogin();
  const [addDialog, setAddDialog] = useState(false);
  // const columns = useGridColumns();
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();

  const items = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    // queryConstraints,
    pathSegments: [firecallId, 'item'],
    filterFn: filterDisplayableItems,
  });

  const layerItems: SimpleMap<FirecallItem[]> = useMemo(() => {
    const elements: SimpleMap<FirecallItem[]> = {};

    Object.assign(
      elements,
      Object.fromEntries(
        Object.keys(layers).map((key) => [
          key,
          items.filter((i) => i.layer === key),
        ])
      )
    );

    elements['default'] = items.filter(
      (i) => i.layer === '' || i.layer === undefined
    );

    return elements;
  }, [items, layers]);

  const addItem = useFirecallItemAdd();

  const dialogClose = useCallback(
    async (item?: FirecallItem) => {
      if (item) {
        await addItem(item);
      }
      setAddDialog(false);
    },
    [addItem]
  );

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <>
      <Box sx={{ p: 2, m: 2 }}>
        <Typography variant="h3" gutterBottom>
          Ebenen
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} md={4} lg={3}>
            layers
            <Grid container spacing={2}>
              {Object.values(layers).map((item) => (
                <FirecallItemCard
                  item={item}
                  key={item.id}
                  subItems={layerItems[item.id]}
                  xs={12}
                  md={12}
                  lg={12}
                />
              ))}
            </Grid>
          </Grid>
          <Grid item xs={6} md={8} lg={9}>
            FirecallItems
            <Grid container spacing={2}>
              {layerItems['default'].map((item) => (
                <FirecallItemCard item={item} key={item.id} />
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Box>
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        onClick={() => setAddDialog(true)}
      >
        <AddIcon />
      </Fab>
      {addDialog && (
        <FirecallItemDialog
          type="layer"
          onClose={dialogClose}
          allowTypeChange={false}
        />
      )}
    </>
  );
}
