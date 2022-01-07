import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Rohr } from './firestore';

export interface RohrDialogOptions {
  onClose: (rohr?: Rohr) => void;
  rohr?: Rohr;
}

export default function RohrDialog({
  onClose,
  rohr: rohrDefault,
}: RohrDialogOptions) {
  const [open, setOpen] = useState(true);
  const [rohr, setRohr] = useState<Rohr>(
    rohrDefault || {
      art: 'C',
      type: 'rohr',
    }
  );

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setRohr((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Rohr hinzuf&uuml;gen</DialogTitle>
      <DialogContent>
        <DialogContentText>Neues C/B Rohr oder Wasserwerfer</DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label="Art (C/B oder Wasserwerfer)"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('art')}
          value={rohr.art}
        />
        <TextField
          margin="dense"
          id="durchfluss"
          label="Durchfluss (l/min)"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('durchfluss')}
          value={rohr.durchfluss || ''}
        />
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
            onClose(rohr);
          }}
        >
          {rohr.id ? 'Aktualisieren' : 'Hinzufügen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
