'use client';
import { useDraggable } from '@dnd-kit/core';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Grid, { GridBaseProps } from '@mui/material/Grid';
import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { SxProps, Theme, styled } from '@mui/material/styles';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ReactNode, Ref, useCallback, useMemo, useState } from 'react';
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
  compact?: boolean;
  subItemsCompact?: boolean;
  cardRef?: Ref<HTMLDivElement>;
  cardSx?: SxProps<Theme>;
}

export default function FirecallItemCard({
  item: itemData,
  close,
  subItems,
  allowTypeChange,
  children,
  draggable = false,
  subItemsDraggable = false,
  compact = false,
  subItemsCompact = false,
  cardRef,
  cardSx,
  ...breakpoints
}: FirecallItemCardOptions) {
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const updateItem = useFirecallItemUpdate();
  const firecallId = useFirecallId();
  const [expanded, setExpanded] = useState(false);
  const canEdit = useMapEditorCanEdit();

  const item = useMemo(() => getItemInstance(itemData), [itemData]);
  const iconUrl = useMemo(() => {
    if (!compact) return undefined;
    try {
      return item.icon()?.options?.iconUrl;
    } catch {
      return undefined;
    }
  }, [item, compact]);
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

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: '' + item.id,
    disabled: !draggable,
  });

  const mergedRef = useCallback((node: HTMLDivElement | null) => {
    setDragRef(node);
    if (cardRef) {
      if (typeof cardRef === 'function') {
        cardRef(node);
      } else {
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    }
  }, [setDragRef, cardRef]);

  const mergedSx = useMemo(() => {
    const base: Record<string, unknown> = compact ? { cursor: 'pointer' } : {};
    if (isDragging) {
      base.opacity = 0.4;
    }
    return cardSx ? { ...base, ...cardSx as object } : (Object.keys(base).length > 0 ? base : undefined);
  }, [compact, cardSx, isDragging]);

  return (
    <Grid size={{ xs: 12, md: 6, lg: 4 }} {...breakpoints}>
      <Card
        ref={mergedRef}
        {...listeners}
        {...attributes}
        sx={mergedSx}
        onClick={compact ? (
          subItems && subItems.length > 0
            ? () => setExpanded((prev) => !prev)
            : canEdit ? () => setDisplayUpdateDialog(true) : undefined
        ) : undefined}
      >
        <CardContent sx={compact ? { py: 1, '&:last-child': { pb: 1 } } : undefined}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {compact && iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <Typography
              variant={compact ? 'body1' : 'h5'}
              component="div"
              sx={compact ? {
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              } : { flex: 1 }}
            >
              {item.title()} {item.deleted && <b>gelöscht</b>}
            </Typography>
            {compact && !iconUrl && (
              <Chip
                label={item.markerName()}
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
              />
            )}
            {compact && subItems && subItems.length > 0 && canEdit && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setDisplayUpdateDialog(true);
                }}
                aria-label="edit"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
            {close && (
              <IconButton
                onClick={close}
                sx={{ right: 4, marginLeft: 'auto' }}
              >
                <CloseIcon color="warning" />
              </IconButton>
            )}
          </Box>
          {!compact && (
            <>
              <Typography sx={{ mb: 1.5 }} color="text.secondary">
                {item.info()}
              </Typography>
              <Typography variant="body2">{item.body()}</Typography>
            </>
          )}

          {children}
        </CardContent>
        {item.editable !== false && canEdit && !compact && (
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
                    size={subItemsCompact ? { xs: 12, sm: 6, md: 4, lg: 3, xl: 2 } : { xs: 12, md: 12, lg: 6, xl: 4 }}
                    draggable={subItemsDraggable}
                    compact={subItemsCompact}
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
