import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import React, { useState } from 'react';
import copyAndSaveFirecallItems from '../../hooks/copyLayer';
import { useFirecallId } from '../../hooks/useFirecall';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { DataSchemaField, FirecallItem, HeatmapConfig } from '../firebase/firestore';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import DataSchemaEditor from './DataSchemaEditor';
import FirecallItemFields from './FirecallItemFields';
import HeatmapSettings from './HeatmapSettings';
import ItemDataFields from './ItemDataFields';

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
  const layers = useFirecallLayers();
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  };

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value })
    );
  };

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
                onChange={(config: HeatmapConfig | undefined) =>
                  setItemField('heatmapConfig', config)
                }
              />
            </>
          )}
          {item.type !== 'layer' && item.layer && layers[item.layer]?.dataSchema && (
            <ItemDataFields
              dataSchema={layers[item.layer].dataSchema!}
              fieldData={item.get<Record<string, string | number | boolean>>('fieldData') || {}}
              onChange={(fieldData) => setItemField('fieldData', fieldData)}
              isNew={!item.id}
            />
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
