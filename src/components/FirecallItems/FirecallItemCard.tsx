import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemDialog from './FirecallItemDialog';
import { firecallItems } from './infos/firecallitems';
import { FirecallItemInfo } from './infos/types';
import { getItemClass } from './elements';
import FirecallItemUpdateDialog from './FirecallItemUpdateDialog';

export interface FirecallItemCardOptions {
  item: FirecallItem;
  firecallId?: string;
  close?: () => void;
}

export default function FirecallItemCard({
  item: itemData,
  firecallId,
  close,
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate(firecallId);

  const item = useMemo(() => getItemClass(itemData), [itemData]);

  return (
    <Grid item xs={12} md={6} lg={4}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div" flex={1}>
            {item.titleFn()}{' '}
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
            {item.info()}
          </Typography>
          <Typography variant="body2">{item.body()}</Typography>
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
        <FirecallItemUpdateDialog
          item={item.original || item}
          callback={() => {
            setDisplayUpdateDialog(false);
          }}
        />
      )}
    </Grid>
  );
}
