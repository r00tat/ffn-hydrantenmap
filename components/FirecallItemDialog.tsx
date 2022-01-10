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
import { useState } from 'react';
import {
  firecallItemInfo,
  FirecallItemInfo,
  firecallItems,
} from './firecallitems';
import { FirecallItem } from './firestore';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  item?: FirecallItem;
}

export default function FirecallItemDialog({
  onClose,
  item: itemDefault,
}: FirecallItemDialogOptions) {
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItem>(
    itemDefault || {
      name: '',
      type: 'unkown',
    }
  );

  const itemInfo: FirecallItemInfo = firecallItemInfo(item.type);

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFirecallItem((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) => ({
      ...prev,
      ['type']: event.target.value as string,
    }));
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Neues {itemInfo.name} hinzufügen</DialogTitle>
      <DialogContent>
        <DialogContentText>{itemInfo.dialogText(item)}</DialogContentText>
        <FormControl fullWidth variant="standard">
          <InputLabel id="firecall-item-type-label">Element Typ</InputLabel>
          <Select
            labelId="firecall-item-type-label"
            id="firecall-item-type"
            value={item.type}
            label="Art"
            onChange={handleChange}
          >
            <MenuItem value="vehicle">Fahrzeug</MenuItem>
            <MenuItem value="rohr">Rohr</MenuItem>
            <MenuItem value="marker">Marker</MenuItem>
          </Select>
        </FormControl>
        {Object.entries(itemInfo.fields).map(([key, label]) => (
          <TextField
            margin="dense"
            id={key}
            key={key}
            label={label}
            type="text"
            fullWidth
            variant="standard"
            onChange={onChange(key)}
            value={((item as any)[key] as string) || ''}
          />
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
        <Button
          onClick={() => {
            setOpen(false);
            onClose(item);
          }}
        >
          {item.id ? 'Aktualisieren' : 'Hinzufügen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
