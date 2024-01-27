import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { SimpleMap } from '../../common/types';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import FirecallItemCard, {
  FirecallItemCardOptions,
} from '../FirecallItems/FirecallItemCard';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { FirecallItem, filterDisplayableItems } from '../firebase/firestore';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import KmlImport from '../firebase/KmlImport';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';

interface DropBoxProps {
  id: string;
  children?: ReactNode;
}

function DropBox({ id, children }: DropBoxProps) {
  const { isOver, setNodeRef, active } = useDroppable({
    id,
  });
  const style: CSSProperties = {
    color: isOver ? 'green' : undefined,
    height: active ? '100px' : '0px',
    borderWidth: active ? 4 : 0,
    borderColor: isOver ? 'green' : 'grey',
    borderStyle: 'dashed',
    margin: active ? 16 : 0,
  };
  return (
    <Box ref={setNodeRef} style={style}>
      {active && (children || 'Zu dieser Ebene hinzufügen')}
    </Box>
  );
}

export function DroppableFirecallCard({
  item,
  ...options
}: FirecallItemCardOptions) {
  return (
    <FirecallItemCard
      item={item}
      allowTypeChange={false}
      xs={12}
      md={12}
      lg={12}
      {...options}
    >
      <DropBox id={'' + item.id} />
    </FirecallItemCard>
  );
}

export default function LayersPage() {
  const { isAuthorized } = useFirebaseLogin();
  const [addDialog, setAddDialog] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  // const columns = useGridColumns();
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();

  const items = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    // queryConstraints,
    pathSegments: [firecallId, 'item'],
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
      .filter((i) => i.layer === '' || i.layer === undefined)
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
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

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 1,
    },
  });
  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      distance: 1,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(
    mouseSensor,
    touchSensor,
    keyboardSensor,
    pointerSensor
  );

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <>
      <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
        <Box sx={{ p: 2, m: 2 }}>
          <Typography variant="h3" gutterBottom>
            Ebenen <KmlImport />
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} md={6} lg={6} xl={8}>
              <Typography variant="h5">
                Erstellte Ebenen
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={dragEnabled}
                        onChange={() => setDragEnabled((old) => !old)}
                      />
                    }
                    label={'Elemente verschieben'}
                  />
                </FormGroup>
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(layers).map(([layerId, item]) => (
                  <DroppableFirecallCard
                    item={item}
                    key={layerId}
                    subItems={layerItems[layerId]}
                    subItemsDraggable={dragEnabled}
                  />
                ))}
              </Grid>
            </Grid>
            <Grid item xs={6} md={6} lg={6} xl={4}>
              <Typography variant="h5">Elemente nicht zugeordnet</Typography>
              <DropBox id="default">keiner Ebene zuoordnen</DropBox>
              <Grid container spacing={2}>
                {layerItems['default'].map((item) => (
                  <FirecallItemCard
                    item={item}
                    key={item.id}
                    draggable={dragEnabled}
                  />
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Box>
        <Fab
          color="primary"
          aria-label="add"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
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
      </DndContext>
    </>
  );
}
