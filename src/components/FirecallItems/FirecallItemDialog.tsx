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
import React, { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import copyAndSaveFirecallItems from '../../hooks/copyLayer';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useHistoryPathSegments } from '../../hooks/useMapEditor';
import useZOrderActions from '../../hooks/useZOrderActions';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterDisplayableItems,
} from '../firebase/firestore';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import FirecallItemFields from './FirecallItemFields';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  item?: FirecallItem;
  allowTypeChange?: boolean;
  type?: string;
  autoFocusField?: string;
}

export default function FirecallItemDialog({
  onClose,
  item: itemDefault,
  allowTypeChange = true,
  type: itemType,
  autoFocusField,
}: FirecallItemDialogOptions) {
  const firecallId = useFirecallId();
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const historyPathSegments = useHistoryPathSegments();

  // Load siblings for z-order operations (only when editing existing items)
  const layerFilter = item.layer || '';
  const queryConstraints = useMemo(
    () => (layerFilter ? [where('layer', '==', layerFilter)] : []),
    [layerFilter]
  );
  const filterFn = useMemo(
    () =>
      layerFilter
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            (e.layer === undefined || e.layer === '') &&
            filterDisplayableItems(e),
    [layerFilter]
  );
  const siblings = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [firecallId, ...historyPathSegments, FIRECALL_ITEMS_COLLECTION_ID],
    filterFn,
  });

  const { handleBringToFront, handleSendToBack, handleBringForward, handleSendBackward } =
    useZOrderActions(item.data(), siblings, (newZIndex) => {
      setFirecallItem((prev) => prev.copy().set('zIndex', newZIndex));
    });

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  };

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value })
    );
  };

  const isExistingItem = !!item.id;

  return (
    <>
      <Dialog open={open} onClose={() => onClose()}>
        <DialogTitle>
          {item.id ? (
            <>{item.markerName()} bearbeiten</>
          ) : (
            <>Neu: {item.markerName()} hinzufügen</>
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{item.dialogText()}</DialogContentText>
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
                  .filter(([key]) => key !== 'fallback')
                  .map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          <FirecallItemFields
            item={item}
            setItemField={setItemField}
            showLatLng={!!item.id}
            autoFocusField={autoFocusField}
          />
          {isExistingItem && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 2, alignItems: 'center', justifyContent: 'center' }}>
              <Box component="span" sx={{ mr: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
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
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<CloseIcon />}
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Abbrechen
          </Button>
          {item.id && (
            <Button
              startIcon={<ContentCopyIcon />}
              onClick={async () => {
                await copyAndSaveFirecallItems(firecallId, item.filteredData());
                setOpen(false);
                onClose();
              }}
            >
              Kopieren
            </Button>
          )}
          {item.id && (
            <Button
              startIcon={<DeleteIcon />}
              onClick={() => {
                setConfirmDelete(true);
              }}
              color="error"
            >
              Löschen
            </Button>
          )}
          <Button
            color="primary"
            startIcon={item.id ? <SaveIcon /> : <AddIcon />}
            onClick={() => {
              setOpen(false);
              onClose(item.filteredData());
            }}
          >
            {item.id ? 'Aktualisieren' : 'Hinzufügen'}
          </Button>
        </DialogActions>
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
