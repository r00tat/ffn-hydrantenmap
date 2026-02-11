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
import { useCallback, useEffect, useState } from 'react';
import { GeoPositionObject } from '../../common/geo';
import { formatTimestamp, parseTimestamp } from '../../common/time-format';
import { defaultPosition } from '../../hooks/constants';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallSelect } from '../../hooks/useFirecall';
import { firestore } from '../firebase/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import MyDateTimePicker from '../inputs/DateTimePicker';
import {
  getBlaulichtSmsAlarms,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';

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
  const [einsatz, setEinsatz] = useState<Firecall>(
    einsatzDefault || {
      name: `Einsatz am ${formatTimestamp(new Date())}`,
      group: 'ffnd',
      fw: 'Neusiedl am See',
      description: '',
      date: new Date().toISOString(),
      alarmierung: new Date().toISOString(),
      eintreffen: new Date().toISOString(),
      deleted: false,
    }
  );
  const { email, myGroups, groups } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();

  const isNewEinsatz = !einsatzDefault;
  const isInFfnd = groups?.includes('ffnd') ?? false;

  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(
    isNewEinsatz && isInFfnd
  );
  const [selectedAlarmId, setSelectedAlarmId] = useState<string>('');

  const applyAlarm = useCallback((alarm: BlaulichtSmsAlarm) => {
    const parts = alarm.alarmText.split('/');
    const name = parts.length >= 5
      ? [parts[2], parts[3], ...parts.slice(4)].join(' ').trim()
      : alarm.alarmText;
    setEinsatz((prev) => ({
      ...prev,
      name,
      date: new Date(alarm.alarmDate).toISOString(),
      alarmierung: new Date(alarm.alarmDate).toISOString(),
      description: alarm.alarmText,
    }));
  }, []);

  useEffect(() => {
    if (isNewEinsatz && isInFfnd) {
      getBlaulichtSmsAlarms()
        .then((fetchedAlarms) => {
          const sorted = [...fetchedAlarms].sort(
            (a, b) =>
              new Date(b.alarmDate).getTime() -
              new Date(a.alarmDate).getTime()
          );
          setAlarms(sorted);
          if (sorted.length > 0) {
            setSelectedAlarmId(sorted[0].alarmId);
            applyAlarm(sorted[0]);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch BlaulichtSMS alarms:', error);
        })
        .finally(() => setAlarmsLoading(false));
    }
  }, [isNewEinsatz, isInFfnd, applyAlarm]);

  const handleAlarmChange = useCallback(
    (event: SelectChangeEvent) => {
      const alarmId = event.target.value;
      setSelectedAlarmId(alarmId);
      if (alarmId) {
        const alarm = alarms.find((a) => a.alarmId === alarmId);
        if (alarm) {
          applyAlarm(alarm);
        }
      }
    },
    [alarms, applyAlarm]
  );

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

  const handleChange = (event: SelectChangeEvent) => {
    // setItemField('type', event.target.value);
    setEinsatz((prev) => ({ ...prev, group: event.target.value }));
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Einsatz hinzuf&uuml;gen</DialogTitle>
      <DialogContent>
        <DialogContentText>Neuer Einsatz</DialogContentText>
        {isNewEinsatz && isInFfnd && alarmsLoading && (
          <DialogContentText
            sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}
          >
            <CircularProgress size={20} />
            Blaulicht-SMS Alarme werden geladen...
          </DialogContentText>
        )}
        {isNewEinsatz && isInFfnd && !alarmsLoading && alarms.length > 0 && (
          <FormControl fullWidth variant="standard" sx={{ mb: 1 }}>
            <InputLabel id="alarm-select-label">
              Blaulicht-SMS Alarm
            </InputLabel>
            <Select
              labelId="alarm-select-label"
              id="alarm-select"
              value={selectedAlarmId}
              label="Blaulicht-SMS Alarm"
              onChange={handleAlarmChange}
            >
              <MenuItem value="">Manuell eingeben</MenuItem>
              {alarms.map((alarm) => (
                <MenuItem key={alarm.alarmId} value={alarm.alarmId}>
                  {alarm.alarmText} (
                  {new Date(alarm.alarmDate).toLocaleString('de-AT')})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
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
          required
        />
        <FormControl fullWidth variant="standard">
          <InputLabel id="firecall-group-label">Gruppe</InputLabel>
          <Select
            labelId="firecall-group-label"
            id="firecall-item-type"
            value={einsatz.group || ''}
            label="Art"
            onChange={handleChange}
            required
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
      </DialogContent>
      <DialogActions>
        <Button
          color="warning"
          onClick={() => {
            setOpen(false);
            onClose();
          }}
        >
          Abbrechen
        </Button>
        <Button
          disabled={!einsatz.name || !einsatz.group}
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
