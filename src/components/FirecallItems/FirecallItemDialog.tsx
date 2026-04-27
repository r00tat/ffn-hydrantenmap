import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StorageReference } from 'firebase/storage';
import { arrayUnion, doc, where } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreClient';
import copyAndSaveFirecallItems from '../../hooks/copyLayer';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import { useHistoryPathSegments } from '../../hooks/useMapEditor';
import useZOrderActions from '../../hooks/useZOrderActions';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { firestore } from '../firebase/firebase';
import FileUploader from '../inputs/FileUploader';
import FileDisplay from '../inputs/FileDisplay';
import { useSnackbar } from '../providers/SnackbarProvider';
import {
  DataSchemaField,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  HeatmapConfig,
  NON_CREATE_ITEMS,
  filterDisplayableItems,
} from '../firebase/firestore';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import DataSchemaEditor from './DataSchemaEditor';
import FirecallItemFields from './FirecallItemFields';
import HeatmapSettings from './HeatmapSettings';
import { computeAllFields } from '../../common/computeFieldValue';
import ItemDataFields, { ItemDataFieldsHandle } from './ItemDataFields';
import VehicleCrewSection from './VehicleCrewSection';
import VehicleQuickAddChips from './VehicleQuickAddChips';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  onCloseMultiple?: (items: FirecallItem[]) => void;
  item?: FirecallItem;
  allowTypeChange?: boolean;
  type?: string;
  autoFocusField?: string;
}

export default function FirecallItemDialog({
  onClose,
  onCloseMultiple,
  item: itemDefault,
  allowTypeChange = true,
  type: itemType,
  autoFocusField,
}: FirecallItemDialogOptions) {
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();
  const showSnackbar = useSnackbar();
  const [open, setOpen] = useState(true);
  const [uploadedRefs, setUploadedRefs] = useState<StorageReference[]>([]);
  const dataFieldsRef = useRef<ItemDataFieldsHandle>(null);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [quickAddSelected, setQuickAddSelected] = useState<string[]>([]);
  const historyPathSegments = useHistoryPathSegments();

  // Load siblings for z-order operations (only when editing existing items)
  const layerFilter = item.layer || '';
  const queryConstraints = useMemo(
    () => (layerFilter ? [where('layer', '==', layerFilter)] : []),
    [layerFilter],
  );
  const filterFn = useMemo(
    () =>
      layerFilter
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            (e.layer === undefined || e.layer === '') &&
            filterDisplayableItems(e),
    [layerFilter],
  );
  const siblings = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn,
  });

  const {
    handleBringToFront,
    handleSendToBack,
    handleBringForward,
    handleSendBackward,
  } = useZOrderActions(item.data(), siblings, (newZIndex) => {
    setFirecallItem((prev) => prev.copy().set('zIndex', newZIndex));
  });

  const setItemField = useCallback((field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  }, []);

  const onHeatmapChange = useCallback(
    (config: HeatmapConfig | undefined) =>
      setItemField('heatmapConfig', config),
    [setItemField],
  );

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value }),
    );
  };

  const isUpload = item.type === 'upload';
  const isExistingItem = !!item.id;
  const isNewVehicle = item.type === 'vehicle' && !isExistingItem;
  const canSave = true;

  const existingVehicleNames = useMemo(
    () =>
      siblings
        .filter(
          (s) => s.type === 'vehicle' && (s as any).fw === 'Neusiedl am See',
        )
        .map((s) => s.name),
    [siblings],
  );

  const handleQuickAddToggle = useCallback((vehicleName: string) => {
    setQuickAddSelected((prev) =>
      prev.includes(vehicleName)
        ? prev.filter((n) => n !== vehicleName)
        : [...prev, vehicleName],
    );
  }, []);

  const handleQuickAddSubmit = useCallback(() => {
    if (quickAddSelected.length === 0 || !onCloseMultiple) return;
    const items: FirecallItem[] = quickAddSelected.map(
      (name) =>
        ({
          type: 'vehicle',
          name,
          fw: 'Neusiedl am See',
          datum: new Date().toISOString(),
          layer: item.layer || '',
        }) as FirecallItem,
    );
    setOpen(false);
    onCloseMultiple(items);
  }, [quickAddSelected, onCloseMultiple, item.layer]);

  const handleFileUploadComplete = useCallback(
    async (refs: StorageReference[]) => {
      try {
        const uris = refs.map((r) => r.toString());
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
          { attachments: arrayUnion(...uris) },
          { merge: true },
        );
        setUploadedRefs((prev) => [...prev, ...refs]);
        showSnackbar(
          `${refs.length} Datei${refs.length > 1 ? 'en' : ''} hochgeladen`,
          'success',
        );
        setCountdown(5);
      } catch (err) {
        console.error('Failed to save attachments', err);
        showSnackbar('Fehler beim Speichern der Anhänge', 'error');
      }
    },
    [firecallId, showSnackbar],
  );

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next <= 0) {
          // Schedule close outside of setState to avoid cascading renders
          queueMicrotask(() => {
            setOpen(false);
            onClose();
          });
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onClose]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const flushedFieldData = dataFieldsRef.current?.flush();
    const data = item.filteredData();

    // Auto-generate name if empty
    if (!data.name?.trim()) {
      const typeName = item.markerName();
      const sameTypeSiblings = siblings.filter(
        (s) => s.type === item.type && s.id !== item.id,
      );
      data.name = `${typeName} ${sameTypeSiblings.length + 1}`;
    }

    let finalFieldData = flushedFieldData || data.fieldData || {};

    // Compute formula-based fields for non-layer items
    if (data.type !== 'layer' && data.layer) {
      const layerSchema = layers[data.layer]?.dataSchema;
      if (layerSchema) {
        const computed = await computeAllFields(finalFieldData, layerSchema);
        finalFieldData = { ...finalFieldData, ...computed };
      }
    }

    const saveItem = { ...data, fieldData: finalFieldData };
    setOpen(false);
    onClose(saveItem);
  }, [canSave, item, siblings, onClose, layers]);

  return (
    <>
      <Dialog
        open={open}
        onClose={() => onClose()}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          const isTextarea = target.tagName === 'TEXTAREA';
          if (
            e.key === 'Enter' &&
            !e.shiftKey &&
            !isTextarea &&
            canSave &&
            !isUpload
          ) {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        <DialogTitle sx={{ pr: 4 }}>
          {isUpload ? (
            <>Datei zum Einsatz hochladen</>
          ) : item.id ? (
            <>{item.markerName()} bearbeiten</>
          ) : (
            <>Neu: {item.markerName()} hinzufügen</>
          )}
          <IconButton
            aria-label="Abbrechen"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
            size="large"
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon fontSize="medium" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {isUpload
              ? 'Datei oder Foto direkt zum Einsatz hochladen.'
              : item.dialogText()}
          </DialogContentText>
          {allowTypeChange && (
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-item-type-label">Element Typ</InputLabel>
              <Select
                labelId="firecall-item-type-label"
                id="firecall-item-type"
                value={item.type}
                label="Art"
                onChange={handleChange}
              >
                {Object.entries(fcItemNames)
                  .filter(([key]) => !NON_CREATE_ITEMS.includes(key))
                  .map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          {isUpload ? (
            <Box sx={{ mt: 2 }}>
              <FileUploader onFileUploadComplete={handleFileUploadComplete} />
              {uploadedRefs.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {uploadedRefs.map((r) => (
                    <FileDisplay key={r.toString()} url={r.toString()} />
                  ))}
                </Box>
              )}
              {countdown !== null && (
                <Typography sx={{ mt: 2 }} color="text.secondary">
                  Schließe in {countdown}...
                </Typography>
              )}
            </Box>
          ) : (
            <>
              {isNewVehicle && onCloseMultiple && (
                <VehicleQuickAddChips
                  selectedNames={quickAddSelected}
                  existingNames={existingVehicleNames}
                  onToggle={handleQuickAddToggle}
                />
              )}
              <FirecallItemFields
                item={item}
                setItemField={setItemField}
                showLatLng={!!item.id}
                autoFocusField={autoFocusField}
              />
              {isExistingItem && (
                <Box
                  sx={{
                    display: 'flex',
                    gap: 0.5,
                    mt: 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      mr: 0.5,
                      fontSize: '0.875rem',
                      color: 'text.secondary',
                    }}
                  >
                    Reihenfolge:
                  </Box>
                  <Tooltip title="Ganz nach hinten">
                    <IconButton size="small" onClick={handleSendToBack}>
                      <VerticalAlignBottomIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Nach hinten">
                    <IconButton size="small" onClick={handleSendBackward}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Nach vorne">
                    <IconButton size="small" onClick={handleBringForward}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Ganz nach vorne">
                    <IconButton size="small" onClick={handleBringToFront}>
                      <VerticalAlignTopIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              {item.type === 'layer' && (
                <>
                  <DataSchemaEditor
                    dataSchema={item.get<DataSchemaField[]>('dataSchema') || []}
                    onChange={(schema: DataSchemaField[]) =>
                      setItemField('dataSchema', schema)
                    }
                  />
                  <HeatmapSettings
                    config={item.get<HeatmapConfig>('heatmapConfig')}
                    dataSchema={item.get<DataSchemaField[]>('dataSchema') || []}
                    onChange={onHeatmapChange}
                  />
                </>
              )}
              {item.type !== 'layer' && (
                <ItemDataFields
                  dataSchema={
                    item.layer ? layers[item.layer]?.dataSchema : undefined
                  }
                  fieldData={
                    item.get<Record<string, string | number | boolean>>(
                      'fieldData',
                    ) || {}
                  }
                  onChange={(fieldData) => setItemField('fieldData', fieldData)}
                  isNew={!item.id}
                  flushRef={dataFieldsRef}
                />
              )}
              {item.type === 'vehicle' && item.id && (
                <VehicleCrewSection vehicleId={item.id} />
              )}
            </>
          )}
        </DialogContent>
        {!isUpload && (
          <DialogActions>
            {item.id && (
              <Tooltip title="Kopieren">
                <IconButton
                  onClick={async () => {
                    await copyAndSaveFirecallItems(
                      firecallId,
                      item.filteredData(),
                    );
                    setOpen(false);
                    onClose();
                  }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            )}
            {item.id && (
              <Tooltip title="Löschen">
                <IconButton
                  onClick={() => setConfirmDelete(true)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
            <Box sx={{ flex: 1 }} />
            {isNewVehicle && quickAddSelected.length > 0 && onCloseMultiple && (
              <Button
                color="primary"
                startIcon={<AddIcon />}
                variant="contained"
                onClick={handleQuickAddSubmit}
              >
                {quickAddSelected.length} Fahrzeuge hinzufügen
              </Button>
            )}
            {!(
              isNewVehicle &&
              quickAddSelected.length > 0 &&
              onCloseMultiple
            ) && (
              <Button
                color="primary"
                disabled={!canSave}
                startIcon={item.id ? <SaveIcon /> : <AddIcon />}
                variant="contained"
                onClick={handleSave}
              >
                {item.id ? 'Speichern' : 'Hinzufügen'}
              </Button>
            )}
          </DialogActions>
        )}
      </Dialog>
      {confirmDelete && (
        <ConfirmDialog
          title={`${item.title()} löschen`}
          text={`${item.title()} wirklich löschen?`}
          onConfirm={(result) => {
            setConfirmDelete(false);
            if (result) {
              setOpen(false);
              onClose({ ...item.filteredData(), deleted: true });
            }
          }}
        />
      )}
    </>
  );
}
