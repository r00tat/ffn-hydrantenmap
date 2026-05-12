import AutoSnapshotIntervalSelect from '../inputs/AutoSnapshotIntervalSelect';
import Box from '@mui/material/Box';
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
import Typography from '@mui/material/Typography';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
} from 'firebase/firestore';
import { useFormatter, useTranslations } from 'next-intl';
import { addDoc, setDoc } from '../../lib/firestoreClient';
import { StorageReference } from 'firebase/storage';
import { useCallback, useEffect, useState } from 'react';
import { GeoPositionObject } from '../../common/geo';
import { parseTimestamp } from '../../common/time-format';
import { defaultPosition } from '../../hooks/constants';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallSelect } from '../../hooks/useFirecall';
import { firestore } from '../firebase/firebase';
import { Firecall, FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import { useSnackbar } from '../providers/SnackbarProvider';
import MyDateTimePicker from '../inputs/DateTimePicker';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';
import {
  getBlaulichtSmsAlarms,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';
import { getGroupsWithBlaulichtsmsConfig } from '../../app/blaulicht-sms/credentialsActions';
import { stripNullish } from '../../common/stripNullish';
import { createDefaultEinsatz, resetEinsatzToManual } from './einsatzDefaults';

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
    einsatzDefault || createDefaultEinsatz()
  );
  const { email, myGroups } = useFirebaseLogin();
  const setFirecallId = useFirecallSelect();
  const showSnackbar = useSnackbar();
  const [saving, setSaving] = useState(false);
  const t = useTranslations();
  const format = useFormatter();

  const isNewEinsatz = !einsatzDefault;

  const [configuredGroups, setConfiguredGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(einsatz.group ?? '');
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);
  const [selectedAlarmId, setSelectedAlarmId] = useState<string>(
    einsatzDefault?.blaulichtSmsAlarmId ?? ''
  );

  const applyAlarm = useCallback((alarm: BlaulichtSmsAlarm) => {
    const parts = alarm.alarmText.split('/');
    const name = parts.length >= 5
      ? [parts[2], parts[3], parts[4]].join(' ').trim()
      : alarm.alarmText;
    const coords =
      alarm.geolocation?.coordinates ?? alarm.coordinates ?? null;
    setEinsatz((prev) => ({
      ...prev,
      name,
      date: new Date(alarm.alarmDate).toISOString(),
      description: alarm.alarmText,
      blaulichtSmsAlarmId: alarm.alarmId,
      ...(coords ? { lat: coords.lat, lng: coords.lon } : {}),
    }));
  }, []);

  // Load which groups have BlaulichtSMS credentials (once on dialog mount).
  // The server filters this list by the caller's group membership.
  useEffect(() => {
    getGroupsWithBlaulichtsmsConfig()
      .then(setConfiguredGroups)
      .catch((err) =>
        console.error('Failed to load BlaulichtSMS configured groups:', err)
      );
  }, []);

  // For new Einsätze: default the group to the first one the user is a
  // member of as soon as `myGroups` is available. Avoids a hardcoded
  // default that may not match the user's permissions.
  useEffect(() => {
    if (!isNewEinsatz) return;
    if (einsatz.group) return;
    if (myGroups.length === 0) return;
    const defaultGroup = myGroups[0].id;
    if (!defaultGroup) return;
    setEinsatz((prev) =>
      prev.group ? prev : { ...prev, group: defaultGroup },
    );
    setSelectedGroup((prev) => prev || defaultGroup);
  }, [isNewEinsatz, einsatz.group, myGroups]);

  // Fetch alarms when selected group changes and has credentials.
  // Whenever no fresh alarm gets auto-applied (group has no credentials,
  // or returned 0 alarms), clear any previously applied alarm data so the
  // dialog never carries stale BlaulichtSMS info from a different group.
  useEffect(() => {
    const shouldFetch =
      selectedGroup && configuredGroups.includes(selectedGroup);

    const clearStaleAlarmData = () => {
      if (!isNewEinsatz) return;
      setSelectedAlarmId('');
      setEinsatz((prev) =>
        prev.blaulichtSmsAlarmId ? resetEinsatzToManual(prev) : prev,
      );
    };

    const fetchAlarms = async () => {
      if (!shouldFetch) {
        setAlarms([]);
        clearStaleAlarmData();
        return;
      }
      setAlarmsLoading(true);
      try {
        const fetchedAlarms = await getBlaulichtSmsAlarms(selectedGroup);
        const sorted = [...fetchedAlarms].sort(
          (a, b) =>
            new Date(b.alarmDate).getTime() - new Date(a.alarmDate).getTime()
        );
        setAlarms(sorted);
        if (isNewEinsatz) {
          if (sorted.length > 0) {
            setSelectedAlarmId(sorted[0].alarmId);
            applyAlarm(sorted[0]);
          } else {
            clearStaleAlarmData();
          }
        }
      } catch (err) {
        console.error('Failed to fetch BlaulichtSMS alarms:', err);
      } finally {
        setAlarmsLoading(false);
      }
    };

    fetchAlarms();
  }, [isNewEinsatz, selectedGroup, configuredGroups, applyAlarm]);

  const handleAlarmChange = useCallback(
    (event: SelectChangeEvent) => {
      const alarmId = event.target.value;
      setSelectedAlarmId(alarmId);
      if (alarmId) {
        const alarm = alarms.find((a) => a.alarmId === alarmId);
        if (alarm) {
          if (isNewEinsatz) {
            applyAlarm(alarm);
          } else {
            setEinsatz((prev) => ({ ...prev, blaulichtSmsAlarmId: alarm.alarmId }));
          }
        }
      } else if (isNewEinsatz) {
        setEinsatz((prev) => resetEinsatzToManual(prev));
      } else {
        setEinsatz((prev) => ({ ...prev, blaulichtSmsAlarmId: undefined }));
      }
    },
    [alarms, applyAlarm, isNewEinsatz]
  );

  const handleFileUploadComplete = useCallback(
    async (refs: StorageReference[]) => {
      const newUrls = refs.map((r) => r.toString());
      setEinsatz((prev) => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...newUrls],
      }));
      if (einsatz.id) {
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, einsatz.id),
          { attachments: arrayUnion(...newUrls) },
          { merge: true }
        );
      }
    },
    [einsatz.id]
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
      if (fc.id) {
        // update
        const updatePayload = stripNullish({
          ...fc,
          updatedAt: new Date().toISOString(),
          updatedBy: email,
        });
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, fc.id),
          updatePayload,
          { merge: true }
        );
      } else {
        //save new
        const firecallData = stripNullish({
          ...fc,
          user: email,
          created: new Date().toISOString(),
          lat: fc.lat ?? position.lat,
          lng: fc.lng ?? position.lng,
        });
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
    const newGroup = event.target.value;
    setEinsatz((prev) => ({ ...prev, group: newGroup }));
    setSelectedGroup(newGroup);
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>{t('einsatzDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('einsatzDialog.subtitleNew')}</DialogContentText>
        {alarmsLoading && (
          <DialogContentText
            sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}
          >
            <CircularProgress size={20} />
            {t('firecall.alarmsLoading')}
          </DialogContentText>
        )}
        {!alarmsLoading && alarms.length > 0 && (
          <FormControl fullWidth variant="standard" sx={{ mb: 1 }}>
            <InputLabel id="alarm-select-label">
              {t('firecall.alarmSelect')}
            </InputLabel>
            <Select
              labelId="alarm-select-label"
              id="alarm-select"
              value={selectedAlarmId}
              label={t('firecall.alarmSelect')}
              onChange={handleAlarmChange}
            >
              <MenuItem value="">
                {isNewEinsatz
                  ? t('firecall.manualEntry')
                  : t('firecall.noAssignment')}
              </MenuItem>
              {alarms.map((alarm) => (
                <MenuItem key={alarm.alarmId} value={alarm.alarmId}>
                  {alarm.alarmText} (
                  {format.dateTime(new Date(alarm.alarmDate), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  )
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField
          autoFocus
          margin="dense"
          id="name"
          label={t('firecall.fields.name')}
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('name')}
          value={einsatz.name}
          required
        />
        <FormControl fullWidth variant="standard">
          <InputLabel id="firecall-group-label">
            {t('firecall.fields.group')}
          </InputLabel>
          <Select
            labelId="firecall-group-label"
            id="firecall-item-type"
            value={einsatz.group || ''}
            label={t('firecall.fields.group')}
            onChange={handleChange}
            required
          >
            {einsatz.group &&
              !myGroups.some((g) => g.id === einsatz.group) && (
                <MenuItem
                  key={`group-${einsatz.group}-readonly`}
                  value={einsatz.group}
                  disabled
                >
                  {t('firecall.noPermission', { group: einsatz.group })}
                </MenuItem>
              )}
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
          label={t('firecall.fields.fw')}
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('fw')}
          value={einsatz.fw}
        />
        <MyDateTimePicker
          label={t('firecall.fields.alarmierung')}
          value={parseTimestamp(einsatz.date) || null}
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, date: newValue?.toISOString() });
          }}
        ></MyDateTimePicker>
        <TextField
          margin="dense"
          id="description"
          label={t('firecall.fields.description')}
          type="text"
          fullWidth
          variant="standard"
          onChange={onChange('description')}
          value={einsatz.description}
        />
        <MyDateTimePicker
          label={t('firecall.fields.eintreffen')}
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, eintreffen: newValue?.toISOString() });
          }}
          value={parseTimestamp(einsatz.eintreffen) || null}
        />
        <MyDateTimePicker
          label={t('firecall.fields.abruecken')}
          setValue={(newValue) => {
            setEinsatz({ ...einsatz, abruecken: newValue?.toISOString() });
          }}
          value={parseTimestamp(einsatz.abruecken) || null}
        />
        <AutoSnapshotIntervalSelect
          value={einsatz.autoSnapshotInterval}
          onChange={(value) => {
            setEinsatz((prev) => ({ ...prev, autoSnapshotInterval: value }));
          }}
        />
        {einsatz.id && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              {t('firecall.fields.attachments')}
            </Typography>
            <FileUploader onFileUploadComplete={handleFileUploadComplete} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {einsatz.attachments?.map((url) => (
                <Box key={url} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FileDisplay
                    url={url}
                    edit
                    onDeleteCallback={async (deletedUrl) => {
                      setEinsatz((prev) => ({
                        ...prev,
                        attachments: prev.attachments?.filter(
                          (u) => u !== deletedUrl
                        ),
                      }));
                      if (einsatz.id) {
                        await setDoc(
                          doc(firestore, FIRECALL_COLLECTION_ID, einsatz.id),
                          { attachments: arrayRemove(deletedUrl) },
                          { merge: true }
                        );
                      }
                    }}
                  />
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          color="warning"
          onClick={() => {
            setOpen(false);
            onClose();
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!einsatz.name || !einsatz.group || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveEinsatz(einsatz);
              setOpen(false);
              onClose(einsatz);
            } catch (err) {
              console.error('Failed to save Einsatz:', err);
              showSnackbar(t('einsatzDialog.saveError'), 'error');
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving
            ? t('common.saving')
            : einsatz.id
              ? t('common.update')
              : t('common.add')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
