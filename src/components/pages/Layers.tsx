'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import Grid, { GridBaseProps } from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { SimpleMap } from '../../common/types';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import useMapEditor from '../../hooks/useMapEditor';
import FirecallItemCard, {
  FirecallItemCardOptions,
} from '../FirecallItems/FirecallItemCard';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { getItemInstance } from '../FirecallItems/elements';
import KmlImport from '../firebase/KmlImport';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterDisplayableItems,
} from '../firebase/firestore';

export function DroppableFirecallCard({
  item,
  ...options
}: FirecallItemCardOptions) {
  const { isOver, setNodeRef } = useDroppable({
    id: '' + item.id,
  });
  return (
    <FirecallItemCard
      item={item}
      allowTypeChange={false}
      size={{ xs: 12, md: 12, lg: 12 }}
      cardRef={setNodeRef}
      cardSx={isOver ? {
        outline: '2px solid green',
        outlineOffset: 2,
        backgroundColor: 'rgba(76, 175, 80, 0.04)',
      } : undefined}
      {...options}
    />
  );
}

function DroppableUnassigned({ items, ...breakpoints }: { items: FirecallItem[] } & GridBaseProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'default',
  });
  return (
    <Grid
      ref={setNodeRef}
      {...breakpoints}
      sx={isOver ? {
        outline: '2px solid green',
        outlineOffset: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(76, 175, 80, 0.04)',
      } : undefined}
    >
      <Typography variant="h5">Elemente nicht zugeordnet</Typography>
      <Grid container spacing={2}>
        {items.map((item) => (
          <FirecallItemCard
            item={item}
            key={item.id}
            draggable
            compact
          />
        ))}
      </Grid>
    </Grid>
  );
}

export default function LayersPage() {
  const { isAuthorized } = useFirebaseLogin();
  const [addDialog, setAddDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<FirecallItem | null>(null);
  // const columns = useGridColumns();
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();
  const { historyPathSegments, historyModeActive } = useMapEditor();

  const items = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    // queryConstraints,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterDisplayableItems,
  });

  const updateFirecallItem = useFirecallItemUpdate();

  const layerItems: SimpleMap<FirecallItem[]> = useMemo(() => {
    const elements: SimpleMap<FirecallItem[]> = {};

    Object.assign(
      elements,
      Object.fromEntries(
        Object.keys(layers).map((key) => [
          key,
          items
            .filter((i) => i.layer === key)
            .sort((a, b) => a.datum?.localeCompare(b.datum || '') || 0),
        ])
      )
    );

    elements['default'] = items
      .filter(
        (i) => i.type !== 'layer' && (i.layer === '' || i.layer === undefined)
      )
      .sort((a, b) => a.datum?.localeCompare(b.datum || '') || 0);

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

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const item = items.find((i) => i.id === event.active.id);
      setActiveItem(item || null);
    },
    [items]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);
      const layerId = event.over?.id;
      const activeId = event.active.id;
      console.info(`FirecallItem drag end ${activeId} on to ${layerId}`);
      const item = items.find((i) => i.id === activeId);
      if (layerId && activeId && item) {
        updateFirecallItem({
          ...item,
          layer: layerId === 'default' ? undefined : '' + layerId,
        });
      }
    },
    [items, updateFirecallItem]
  );

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(
    mouseSensor,
    touchSensor,
    keyboardSensor
  );

  if (typeof window === 'undefined') {
    return '<div>Loading</div>';
  }

  if (!isAuthorized) {
    return <></>;
  }

  const hasUnassignedItems = layerItems['default'].length > 0;

  return (
    <>
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} sensors={sensors}>
        <Box sx={{ p: 2, m: 2 }}>
          <Typography variant="h3" gutterBottom>
            Ebenen {!historyModeActive && <KmlImport />}
          </Typography>
          <Grid container spacing={2}>
            <Grid
              size={hasUnassignedItems ? { xs: 12, md: 7, xl: 8 } : { xs: 12, xl: 10 }}
            >
              <Typography variant="h5">
                Erstellte Ebenen
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(layers).map(([layerId, item]) => (
                  <DroppableFirecallCard
                    item={item}
                    key={layerId}
                    subItems={layerItems[layerId]}
                    subItemsDraggable
                    compact
                    subItemsCompact
                  />
                ))}
              </Grid>
            </Grid>
            <DroppableUnassigned
              size={hasUnassignedItems ? { xs: 12, md: 5, xl: 4 } : { xs: 12, xl: 2 }}
              items={layerItems['default']}
            />
          </Grid>
        </Box>
        {!historyModeActive && (
          <Fab
            color="primary"
            aria-label="add"
            sx={{ position: 'fixed', bottom: 16, right: 16 }}
            onClick={() => setAddDialog(true)}
          >
            <AddIcon />
          </Fab>
        )}
        {addDialog && (
          <FirecallItemDialog
            type="layer"
            onClose={dialogClose}
            allowTypeChange={false}
          />
        )}
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <Card sx={{ opacity: 0.9, maxWidth: 300 }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body1" noWrap>
                  {getItemInstance(activeItem).title()}
                </Typography>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
