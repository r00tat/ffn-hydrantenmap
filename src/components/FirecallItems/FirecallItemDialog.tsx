import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { StorageReference } from 'firebase/storage';
import { MuiColorInput } from 'mui-color-input';
import React, { useCallback, useState } from 'react';
import { parseTimestamp } from '../../common/time-format';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem, NON_DISPLAYABLE_ITEMS } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import { icons } from './elements/icons';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  item?: FirecallItem;
  allowTypeChange?: boolean;
  type?: string;
}

export default function FirecallItemDialog({
  onClose,
  item: itemDefault,
  allowTypeChange = true,
  type: itemType,
}: FirecallItemDialogOptions) {
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem)
  );
  const layers = useFirecallLayers();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  };

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setItemField(field, event.target.value);
    };

  const handleChange = (event: SelectChangeEvent) => {
    // setItemField('type', event.target.value);
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value })
    );
  };

  const fileUploadComplete = useCallback(
    (key: string, refs: StorageReference[]) => {
      console.info(`file upload complete for ${key}: ${refs.toString()}`);
      const oldValue = (item as any)[key] || [];
      setItemField(key, [...oldValue, ...refs.map((r) => r.toString())]);
    },
    [item]
  );

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
                  .filter(([key, name]) => key !== 'fallback')
                  .map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          {NON_DISPLAYABLE_ITEMS.indexOf(item.type) < 0 && item.id && (
            <>
              <TextField
                margin="dense"
                id="lat"
                key="lat"
                label={'Latitude'}
                variant="standard"
                onChange={onChange('lat')}
                value={item.lat || ''}
              />
              <TextField
                margin="dense"
                id="lng"
                key="lng"
                label={'Longitutde'}
                variant="standard"
                onChange={onChange('lng')}
                value={item.lng || ''}
              />
            </>
          )}
          {Object.entries(item.fields()).map(([key, label]) => (
            <React.Fragment key={key}>
              {item.dateFields().includes(key) && (
                <MyDateTimePicker
                  label={label}
                  value={
                    (((item as any)[key] as string) &&
                      parseTimestamp((item as any)[key] as string)) ||
                    null
                  }
                  setValue={(newValue) => {
                    setItemField(key, newValue?.toISOString());
                  }}
                />
              )}
              {item.fieldTypes()[key] === 'boolean' && (
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={
                          (item as any)[key] === 'true' ||
                          (item as any)[key] === true
                        }
                        onChange={(event, checked) => {
                          setItemField(key, checked ? 'true' : 'false');
                        }}
                      />
                    }
                    label={label}
                  />
                </FormGroup>
              )}
              {item.fieldTypes()[key] === 'TaktischesZeichen' && (
                <>
                  <FormControl fullWidth>
                    <InputLabel htmlFor={`${key}-select`}>
                      Taktisches Zeichen
                    </InputLabel>
                    <Select
                      defaultValue=""
                      id={`${key}-select`}
                      label="Taktisches Zeichen"
                      value={(item as any)[key] || ''}
                      onChange={(event): void => {
                        setItemField(key, event.target.value as string);
                      }}
                    >
                      <MenuItem value="">
                        <em>Kein taktisches Zeichen</em>
                      </MenuItem>
                      {Object.entries(icons).map(([group, groupEntries]) => [
                        <ListSubheader key={group}>
                          {group.replace(/_/g, ' ')}
                        </ListSubheader>,
                        ...Object.entries(groupEntries).map(([name, icon]) => (
                          <MenuItem value={name} key={name}>
                            {name.replace(/_/g, ' ')}
                          </MenuItem>
                        )),
                      ])}
                    </Select>
                  </FormControl>
                </>
              )}
              {item.fieldTypes()[key] === 'select' && (
                <FormControl fullWidth variant="standard">
                  <InputLabel id={`firecall-item-${key}-label`}>
                    {label}
                  </InputLabel>
                  <Select
                    labelId={`firecall-item-${key}-label`}
                    id={`firecall-item-${key}`}
                    value={item.get<string>(key) || ''}
                    label={label}
                    onChange={(event): void => {
                      setItemField(key, event.target.value as string);
                    }}
                  >
                    {Object.entries(item.selectValues()[key] || {}).map(
                      ([k, l]) => (
                        <MenuItem key={k} value={k}>
                          {l}
                        </MenuItem>
                      )
                    )}
                  </Select>
                </FormControl>
              )}
              {item.fieldTypes()[key] === 'attachment' && (
                <>
                  <FileUploader
                    onFileUploadComplete={(ref) => fileUploadComplete(key, ref)}
                  />
                  {(item as any)[key] &&
                    ((item as any)[key] as string[]).map((url) => (
                      <FileDisplay
                        key={url}
                        url={url}
                        edit
                        onDeleteCallback={() => {
                          setItemField(
                            key,
                            ((item as any)[key] as string[]).filter(
                              (u) => u !== url
                            )
                          );
                        }}
                      />
                    ))}
                </>
              )}
              {item.fieldTypes()[key] === 'color' && (
                <>
                  <MuiColorInput
                    value={(item as any)[key] || '#0000ff'}
                    fallbackValue="#0000ff"
                    format="hex8"
                    onChange={(newValue, colors) => setItemField(key, newValue)}
                    isAlphaHidden={false}
                    fullWidth
                    id={key}
                    key={key}
                    label={label}
                    style={{ marginTop: 12 }}
                  />
                </>
              )}
              {!item.dateFields().includes(key) &&
                ![
                  'boolean',
                  'date',
                  'TaktischesZeichen',
                  'attachment',
                  'select',
                  'color',
                ].includes(item.fieldTypes()[key]) && (
                  <TextField
                    margin="dense"
                    id={key}
                    key={key}
                    label={label}
                    type={item.fieldTypes()[key] || 'text'}
                    multiline={item.fieldTypes()[key] === 'textarea'}
                    fullWidth
                    variant="standard"
                    onChange={onChange(key)}
                    value={((item as any)[key] as string) || ''}
                  />
                )}
            </React.Fragment>
          ))}
          {NON_DISPLAYABLE_ITEMS.indexOf(item.type) < 0 && (
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-item-layer-label">Ebene</InputLabel>
              <Select
                labelId="firecall-item-layer-label"
                id="firecall-item-layer"
                value={item.layer || ''}
                label="Ebene"
                onChange={(event): void => {
                  setItemField('layer', event.target.value as string);
                }}
              >
                <MenuItem key="">Einsatz</MenuItem>
                {Object.entries(layers)
                  .filter(([key]) => key !== 'fallback')
                  .map(([key, layer]) => (
                    <MenuItem key={key} value={key}>
                      {layer.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Abbrechen
          </Button>
          {item.id && (
            <Button
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
