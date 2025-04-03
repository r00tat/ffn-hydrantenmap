'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import Grid, { GridBaseProps } from '@mui/material/Grid';
import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import copyAndSaveFirecallItems from '../../hooks/copyLayer';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { firestore } from '../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../firebase/firestore';
import FirecallItemUpdateDialog from './FirecallItemUpdateDialog';
import { getItemInstance } from './elements';
import { useMapEditorCanEdit } from '../../hooks/useMapEditor';

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

const ExpandMore = styled((props: ExpandMoreProps) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme, expand }) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}));

export interface FirecallItemCardOptions extends GridBaseProps {
  item: FirecallItem;
  close?: () => void;
  subItems?: FirecallItem[];
  allowTypeChange?: boolean;
  children?: ReactNode;
  draggable?: boolean;
  subItemsDraggable?: boolean;
}

export default function FirecallItemCard({
  item: itemData,
  close,
  subItems,
  allowTypeChange,
  children,
  draggable = false,
  subItemsDraggable = false,
  ...breakpoints
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate();
  const firecallId = useFirecallId();
  const [expanded, setExpanded] = useState(false);
  const canEdit = useMapEditorCanEdit();

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
              collection(
                firestore,
                FIRECALL_COLLECTION_ID,
                firecallId,
                FIRECALL_ITEMS_COLLECTION_ID
              ),
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
    <Grid size={{ xs: 12, md: 6, lg: 4 }} {...breakpoints}>
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

          {children}
        </CardContent>
        {item.editable !== false && canEdit && (
          <CardActions>
            <Button
              size="small"
              startIcon={<EditIcon />}
              onClick={() => setDisplayUpdateDialog(true)}
            >
              Bearbeiten
            </Button>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => copyAndSaveFirecallItems(firecallId, item)}
            >
              Kopieren
            </Button>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => setIsConfirmOpen(true)}
              color="error"
            >
              Löschen
            </Button>
            {subItems && subItems.length > 0 && (
              <ExpandMore
                expand={expanded}
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                aria-label="show more"
              >
                <ExpandMoreIcon />
              </ExpandMore>
            )}
          </CardActions>
        )}
        <Collapse in={expanded} timeout={1000} unmountOnExit>
          <CardContent>
            <Grid container spacing={2}>
              {subItems &&
                subItems.map((si) => (
                  <FirecallItemCard
                    item={si}
                    key={si.id}
                    size={{ xs: 12, md: 12, lg: 6, xl: 4 }}
                    draggable={subItemsDraggable}
                  />
                ))}
            </Grid>
          </CardContent>
        </Collapse>
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
