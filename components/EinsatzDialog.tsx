import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { defaultPosition } from '../hooks/usePosition';
import { firestore } from './firebase';
import { Firecall } from './firestore';

export interface EinsatzDialogOptions {
  onClose: (einsatz?: Firecall) => void;
  einsatz?: Firecall;
  position?: L.LatLng;
}

export default function EinsatzDialog({
  onClose,
  einsatz: einsatzDefault,
  position = defaultPosition,
}: EinsatzDialogOptions) {
  const [open, setOpen] = useState(true);
  const [einsatz, setEinsatz] = useState<Firecall>(
    einsatzDefault || {
      name: '',
      date: new Date().toISOString(),
    }
  );
  const { email } = useFirebaseLogin();

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setEinsatz((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  const saveEinsatz = useCallback(
    async (fc: Firecall) => {
      if (fc.id) {
        // update
        await setDoc(
          doc(firestore, 'call', fc.id),
          { ...fc, updatedAt: new Date(), updatedBy: email },
          { merge: true }
        );
      } else {
        //save new
        const firecallData: Firecall = {
          ...fc,
          user: email,
          created: new Date(),
          lat: position.lat,
          lng: position.lng,
        };
        await addDoc(collection(firestore, 'call'), firecallData);
      }
    },
    [email, position.lat, position.lng]
  );

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Einsatz hinzuf&uuml;gen</DialogTitle>
      <DialogContent>
        <DialogContentText>Neuer Einsatz</DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label="Bezeichnung"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('name')}
          value={einsatz.name}
        />
        <TextField
          margin="dense"
          id="fw"
          label="Feuerwehr"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('fw')}
          value={einsatz.fw}
        />
        <TextField
          margin="dense"
          id="date"
          label="Datum YYYY-MM-DD"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('date')}
          value={einsatz.date}
        />
        <TextField
          margin="dense"
          id="description"
          label="Beschreibung"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('description')}
          value={einsatz.description}
        />

        <TextField
          margin="dense"
          id="alarmierung"
          label="Alarmierung"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('alarmierung')}
          value={einsatz.alarmierung}
        />
        <TextField
          margin="dense"
          id="eintreffen"
          label="Eintreffen"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('eintreffen')}
          value={einsatz.eintreffen}
        />
        <TextField
          margin="dense"
          id="abruecken"
          label="Abrücken"
          type="datetime"
          fullWidth
          variant="standard"
          onChange={onChange('abruecken')}
          value={einsatz.abruecken}
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
            saveEinsatz(einsatz);
            onClose(einsatz);
          }}
        >
          {einsatz.id ? 'Aktualisieren' : 'Hinzufügen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
