import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid, { RegularBreakpoints } from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { firestore } from '../firebase/firebase';
import { FirecallItem } from '../firebase/firestore';
import FirecallItemUpdateDialog from './FirecallItemUpdateDialog';
import { getItemInstance } from './elements';

export interface FirecallItemCardOptions extends RegularBreakpoints {
  item: FirecallItem;
  close?: () => void;
  subItems?: FirecallItem[];
  allowTypeChange?: boolean;
  children?: ReactNode;
  draggable?: boolean;
}

export default function FirecallItemCard({
  item: itemData,
  close,
  subItems,
  allowTypeChange,
  children,
  draggable = false,
  ...breakpoints
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate();
  const firecallId = useFirecallId();

  const item = useMemo(() => getItemInstance(itemData), [itemData]);
  const deleteFn = useCallback(
    async (result: boolean) => {
      setIsConfirmOpen(false);
      if (result) {
        updateItem({ ...item.filteredData(), deleted: true });
        if (item.type === 'layer') {
          // delete all elements in this layer
          const docs = await getDocs(
            query(
              collection(firestore, 'call', firecallId, 'item'),
              where('layer', '==', item.id)
            )
          );

          Promise.allSettled(
            docs.docs.map((doc) =>
              updateItem({
                ...doc.data(),
                id: doc.id,
                deleted: true,
              } as FirecallItem)
            )
          );
        }
      }
    },
    [updateItem, item, firecallId]
  );

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: '' + item.id,
    disabled: !draggable,
  });
  const style = {
    // Outputs `translate3d(x, y, 0)`
    transform: CSS.Translate.toString(transform),
  };

  return (
    <Grid item xs={12} md={6} lg={4} {...breakpoints}>
      <Card ref={setNodeRef} style={style} {...listeners} {...attributes}>
        <CardContent>
          <Typography variant="h5" component="div" flex={1}>
            {item.title()} {item.deleted && <b>gelöscht</b>}
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
                  lg={6}
                  xl={4}
                  draggable
                />
              ))}
          </Grid>
          {children}
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
          allowTypeChange={allowTypeChange}
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
