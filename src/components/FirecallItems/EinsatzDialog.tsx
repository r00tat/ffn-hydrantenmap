import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
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
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import DrivePickerComponent from '../../app/sheet/DrivePicker/DrivePicker';
import { GeoPositionObject } from '../../common/geo';
import { parseTimestamp } from '../../common/time-format';
import { defaultPosition } from '../../hooks/constants';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallSelect } from '../../hooks/useFirecall';
import { firestore } from '../firebase/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import { copyFirecallSheet } from './EinsatzAction';

export interface EinsatzDialogOptions {
  onClose: (einsatz?: Firecall) => void;
  einsatz?: Firecall;
  position?: GeoPositionObject;
}

export default function EinsatzDialog({
  onClose,
  einsatz: einsatzDefault,
  position = defaultPosition,
}: EinsatzDialogOptions) {
  const [open, setOpen] = useState(true);
  const [isStateCopy, setIsStateCopy] = useState(false);
  const [einsatz, setEinsatz] = useState<Firecall>(
    einsatzDefault || {
      name: '',
      date: new Date().toISOString(),
      deleted: false,
    }
  );
  const { email, myGroups } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setEinsatz((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  const saveEinsatz = useCallback(
    async (fc: Firecall) => {
      // if (!fc.sheetId) {
      //   fc.sheetId = await copyFirecallSheet(fc);
      // }

      if (fc.id) {
        // update
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, fc.id),
          { ...fc, updatedAt: new Date().toISOString(), updatedBy: email },
          { merge: true }
        );
      } else {
        //save new
        const firecallData: Firecall = {
          ...fc,
          user: email,
          created: new Date().toISOString(),
          lat: position.lat,
          lng: position.lng,
        };
        const newDoc = await addDoc(
          collection(firestore, FIRECALL_COLLECTION_ID),
          firecallData
        );
        if (setFirecallId) {
          setFirecallId(newDoc.id);
        }
      }
    },
    [email, position.lat, position.lng, setFirecallId]
  );

  const onDrivePickerClose = useCallback(
    (doc?: google.picker.DocumentObject) => {
      console.info(`drive picker close`, doc);
      if (doc) {
        setEinsatz((prev) => ({ ...prev, sheetId: doc.id }));
      }
      setOpen(true);
    },
    []
  );

  const handleChange = (event: SelectChangeEvent) => {
    // setItemField('type', event.target.value);
    setEinsatz((prev) => ({ ...prev, group: event.target.value }));
  };

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
        <FormControl fullWidth variant="standard">
          <InputLabel id="firecall-group-label">Gruppe</InputLabel>
          <Select
            labelId="firecall-group-label"
            id="firecall-item-type"
            value={einsatz.group}
            label="Art"
            onChange={handleChange}
          >
            {myGroups.map((group) => (
              <MenuItem key={`group-${group.id}`} value={group.id}>
                {group.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
        <MyDateTimePicker
          label="Einsatzdatum"
          value={parseTimestamp(einsatz.date) || null}
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, date: newValue?.toISOString() });
          }}
        ></MyDateTimePicker>
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

        <MyDateTimePicker
          label="Alarmierung"
          value={parseTimestamp(einsatz.alarmierung) || null}
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, alarmierung: newValue?.toISOString() });
          }}
        />
        <MyDateTimePicker
          label="Eintreffen"
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, eintreffen: newValue?.toISOString() });
          }}
          value={parseTimestamp(einsatz.eintreffen) || null}
        />
        <MyDateTimePicker
          label="Abrücken"
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, abruecken: newValue?.toISOString() });
          }}
          value={parseTimestamp(einsatz.abruecken) || null}
        />

        <TextField
          margin="dense"
          id="sheetId"
          label="Einsatzmappe Google Sheet ID"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('sheetId')}
          value={einsatz.sheetId || ''}
        />
        <TextField
          margin="dense"
          id="sheetRange"
          label="Einsatzmappe Google Sheet Daten Bereich"
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('sheetRange')}
          value={einsatz.sheetRange || ''}
        />
        <DrivePickerComponent
          onClose={onDrivePickerClose}
          onOpen={() => setOpen(false)}
        />
        <Button
          disabled={isStateCopy}
          onClick={async () => {
            setIsStateCopy(true);
            const fileId = await copyFirecallSheet(einsatz);
            setEinsatz((prev) => ({
              ...prev,
              sheetId: fileId,
            }));
            setIsStateCopy(false);
          }}
        >
          Vorlage kopieren
          {isStateCopy && <CircularProgress />}
        </Button>
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
