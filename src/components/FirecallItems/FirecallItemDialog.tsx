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
import TextField from '@mui/material/TextField';
import moment from 'moment';
import React, { useState } from 'react';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { FirecallItem } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import { fcItemClasses, fcItemNames, getItemClass } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import { CheckBox } from '@mui/icons-material';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

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
              {!item.dateFields().includes(key) &&
                item.fieldTypes()[key] !== 'boolean' && (
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
              onClose(item);
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
