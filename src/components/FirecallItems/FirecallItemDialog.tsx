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
import MyDateTimePicker from '../inputs/DateTimePicker';
import { FirecallItem } from '../firebase/firestore';
import { firecallItemInfo, firecallItems } from './infos/firecallitems';
import { FirecallItemInfo } from './infos/types';

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
  const [item, setFirecallItem] = useState<FirecallItem>(
    itemDefault || firecallItemInfo(itemType).factory()
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const itemInfo: FirecallItemInfo = firecallItemInfo(item.type);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setItemField(field, event.target.value);
    };

  const handleChange = (event: SelectChangeEvent) => {
    setItemField('type', event.target.value);
    setFirecallItem((prev) => ({
      ...firecallItemInfo(event.target.value).factory(),
      ...prev,
    }));
  };

  return (
    <>
      <Dialog open={open} onClose={() => onClose()}>
        <DialogTitle>
          {item.id ? (
            <>{itemInfo.name} bearbeiten</>
          ) : (
            <>Neu: {itemInfo.name} hinzufügen</>
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{itemInfo.dialogText(item)}</DialogContentText>
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
                {Object.entries(firecallItems)
                  .filter(([key, fcItem]) => key !== 'fallback')
                  .map(([key, fcItem]) => (
                    <MenuItem key={key} value={key}>
                      {fcItem.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          {Object.entries(itemInfo.fields).map(([key, label]) => (
            <React.Fragment key={key}>
              {itemInfo.dateFields.includes(key) && (
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
              {!itemInfo.dateFields.includes(key) && (
                <TextField
                  margin="dense"
                  id={key}
                  key={key}
                  label={label}
                  type={
                    (itemInfo.fieldTypes && itemInfo.fieldTypes[key]) || 'text'
                  }
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
          title={`${itemInfo.name} ${itemInfo.title(item)} löschen`}
          text={`Element ${itemInfo.name} ${itemInfo.title(
            item
          )} wirklich löschen?`}
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
