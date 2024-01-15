import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid, { RegularBreakpoints } from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemUpdateDialog from './FirecallItemUpdateDialog';
import { getItemInstance } from './elements';

export interface FirecallItemCardOptions extends RegularBreakpoints {
  item: FirecallItem;
  close?: () => void;
  subItems?: FirecallItem[];
}

export default function FirecallItemCard({
  item: itemData,
  close,
  subItems,
  ...breakpoints
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate();

  const item = useMemo(() => getItemInstance(itemData), [itemData]);
  const deleteFn = useCallback(
    (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateItem({ ...item.filteredData(), deleted: true });
      }
    },
    [updateItem, item]
  );

  return (
    <Grid item xs={12} md={6} lg={4} {...breakpoints}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="div" flex={1}>
            {item.titleFn()} {item.deleted && <b>gelöscht</b>}
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

          <Grid container spacing={2}>
            {subItems &&
              subItems.map((si) => (
                <FirecallItemCard
                  item={si}
                  key={si.id}
                  xs={12}
                  md={12}
                  lg={12}
                />
              ))}
          </Grid>
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
      {isConfirmOpen && (
        <ConfirmDialog
          title={`${item.title()} löschen`}
          text={`${item.markerName()} ${item.name} wirklich löschen?`}
          onConfirm={deleteFn}
        />
      )}
    </Grid>
  );
}
