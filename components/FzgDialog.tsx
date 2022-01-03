import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Fzg } from './firestore';

export interface FzgDialogOptions {
  onClose: (fzg?: Fzg) => void;
  vehicle?: Fzg;
}

export default function FzgDialog({ onClose, vehicle }: FzgDialogOptions) {
  const [open, setOpen] = useState(true);
  const [fzg, setFzg] = useState<Fzg>(
    vehicle || {
      alarmierung: new Date().toLocaleString('de-DE'),
      eintreffen: new Date().toLocaleString('de-DE'),
    }
  );

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFzg((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Fahrzeug hinzuf&uuml;gen</DialogTitle>
      <DialogContent>
        <DialogContentText>Neues Fahrzeug</DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label="Bezeichnung"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('name')}
          value={fzg.name}
        />
        <TextField
          margin="dense"
          id="fw"
          label="Feuerwehr"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('fw')}
          value={fzg.fw}
        />
        <TextField
          margin="dense"
          id="besatzung"
          label="Besatzung 1:?"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('besatzung')}
          value={fzg.besatzung}
        />
        <TextField
          margin="dense"
          id="ats"
          label="ATS Träger"
          type="number"
          fullWidth
          variant="standard"
          onChange={onChange('ats')}
          value={fzg.ats}
        />
        <TextField
          margin="dense"
          id="alarmierung"
          label="Alarmierung"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('alarmierung')}
          value={fzg.alarmierung}
        />
        <TextField
          margin="dense"
          id="eintreffen"
          label="Eintreffen"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('eintreffen')}
          value={fzg.eintreffen}
        />
        <TextField
          margin="dense"
          id="abruecken"
          label="Abrücken"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('abruecken')}
          value={fzg.abruecken}
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
            onClose(fzg);
          }}
        >
          Hinzuf&uuml;gen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
