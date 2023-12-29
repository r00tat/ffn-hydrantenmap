import { ListSubheader } from '@mui/material';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { StorageReference } from 'firebase/storage';
import moment from 'moment';
import React, { useCallback, useState } from 'react';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';
import { fcItemNames, getItemClass } from './elements';
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
    getItemClass(itemDefault || ({ type: itemType } as FirecallItem))
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => getItemClass({ ...prev.data(), [field]: value }));
  };

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setItemField(field, event.target.value);
    };

  const handleChange = (event: SelectChangeEvent) => {
    setItemField('type', event.target.value);
    // setFirecallItem((prev) => ({
    //   ...firecallItemInfo(event.target.value).factory(),
    //   ...prev,
    // }));
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
          {Object.entries(item.fields()).map(([key, label]) => (
            <React.Fragment key={key}>
              {item.dateFields().includes(key) && (
                <MyDateTimePicker
                  label={label}
                  value={
                    (((item as any)[key] as string) &&
                      moment((item as any)[key] as string)) ||
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
                      <Checkbox
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
              {!item.dateFields().includes(key) &&
                ![
                  'boolean',
                  'date',
                  'TaktischesZeichen',
                  'attachment',
                ].includes(item.fieldTypes()[key]) && (
                  <TextField
                    margin="dense"
                    id={key}
                    key={key}
                    label={label}
                    type={item.fieldTypes()[key] || 'text'}
                    fullWidth
                    variant="standard"
                    onChange={onChange(key)}
                    value={((item as any)[key] as string) || ''}
                  />
                )}
            </React.Fragment>
          ))}
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
              onClose({ ...item, deleted: true });
            }
          }}
        />
      )}
    </>
  );
}
