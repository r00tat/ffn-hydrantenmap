import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';
import { firecallItems } from './infos/firecallitems';
import { FirecallItemInfo } from './infos/types';

export interface FirecallItemCardOptions {
  item: FirecallItem;
  firecallId?: string;
  close?: () => void;
}

export default function FirecallItemCard({
  item,
  firecallId,
  close,
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
          <Typography variant="h5" component="div" flex={1}>
            {itemInfo.title(item)}{' '}
            {close && (
              <IconButton
                onClick={close}
                sx={{ right: 4, marginLeft: 'auto', float: 'right' }}
              >
                <CloseIcon color="warning" />
              </IconButton>
            )}
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
        <FirecallItemDialog onClose={updateFn} item={item.original || item} />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`${itemInfo.name} ${itemInfo.title(item)} löschen`}
          text={`Element ${itemInfo.name} ${itemInfo.title(
            item
          )} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}
