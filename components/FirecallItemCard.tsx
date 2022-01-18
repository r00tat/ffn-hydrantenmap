import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { FirecallItem } from '../components/firestore';
import useFirecallItemUpdate from '../hooks/useFirecallItemUpdate';
import ConfirmDialog from './ConfirmDialog';
import FirecallItemDialog from './FirecallItemDialog';
import { FirecallItemInfo, firecallItems } from './firecallitems';

export interface FirecallItemCardOptions {
  item: FirecallItem;
  firecallId?: string;
}

export default function FirecallItemCard({
  item,
  firecallId,
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate(firecallId);

  const itemInfo: FirecallItemInfo =
    firecallItems[item.type] || firecallItems.fallback;

  const updateFn = useCallback(
    (fcItem?: FirecallItem) => {
      setDisplayUpdateDialog(false);
      if (fcItem) {
        updateItem(fcItem);
      }
    },
    [updateItem]
  );
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateItem({ ...item, deleted: true });
      }
    },
    [updateItem, item]
  );

  return (
    <Grid item xs={12} md={6} lg={4}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div">
            {itemInfo.title(item)}
          </Typography>
          <Typography sx={{ mb: 1.5 }} color="text.secondary">
            {itemInfo.info(item)}
          </Typography>
          <Typography variant="body2">{itemInfo.body(item)}</Typography>
        </CardContent>
        {item.editable !== false && (
          <CardActions>
            <Button size="small" onClick={() => setDisplayUpdateDialog(true)}>
              Bearbeiten
            </Button>
            <Button
              size="small"
              onClick={() => setIsConfirmOpen(true)}
              color="error"
            >
              Löschen
            </Button>
          </CardActions>
        )}
      </Card>
      {displayUpdateDialog && (
        <FirecallItemDialog onClose={updateFn} item={item} />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`${itemInfo.name} ${itemInfo.title(item)} löschen`}
          text={`Fahrzeug ${itemInfo.name} ${itemInfo.title(
            item
          )} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}
