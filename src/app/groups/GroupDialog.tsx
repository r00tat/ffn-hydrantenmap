'use client';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect, useMemo, useState } from 'react';
import { UserRecordExtended } from '../../common/users';
import {
  BlaulichtsmsConfigPublic,
  deleteBlaulichtsmsConfig,
  getBlaulichtsmsConfig,
  saveBlaulichtsmsConfig,
} from '../blaulicht-sms/credentialsActions';
import { Group } from './groupTypes';

export interface GroupDialoggOptions {
  onClose: (item?: Group, assigendUsers?: string[]) => void;
  group: Group;
  users: UserRecordExtended[];
}

export const groupTextFields: { [key: string]: string } = {
  name: 'Name',
  description: 'Zusatzinfo',
};

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  slotProps: {
    paper: {
      style: {
        maxHeight: ITEM_HEIGHT * 10 + ITEM_PADDING_TOP,
        width: 250,
      },
    },
  },
};

export default function GroupDialogg({
  onClose,
  group: groupDefault,
  users,
}: GroupDialoggOptions) {
  const [open, setOpen] = useState(true);
  const [group, setGroup] = useState<Group>(groupDefault);
  const [saving, setSaving] = useState(false);

  // BlaulichtSMS credentials state
  const [blsConfig, setBlsConfig] = useState<BlaulichtsmsConfigPublic | null>(null);
  const [blsCustomerId, setBlsCustomerId] = useState('');
  const [blsUsername, setBlsUsername] = useState('');
  const [blsPassword, setBlsPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const groupId = group.id;

  useEffect(() => {
    if (!groupId) return;
    getBlaulichtsmsConfig(groupId)
      .then((existing) => {
        setBlsConfig(existing);
        if (existing) {
          setBlsCustomerId(existing.customerId);
          setBlsUsername(existing.username);
        }
      })
      .catch((err) => console.error('Failed to load BlaulichtSMS config:', err));
  }, [groupId]);

  const userMap = Object.fromEntries(users.map((user) => [user.uid, user]));

  const initialUsers = useMemo(
    () =>
      users
        .filter(
          (user) => group.id && user.groups && user.groups.includes(group.id)
        )
        .map((user) => user.uid),
    [group.id, users]
  );
  const [assigendUsers, setAssigendUsers] = useState<string[]>(initialUsers);

  const onChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement> | SelectChangeEvent) => {
      setGroup(
        (prev) =>
          ({
            ...prev,
            [field]: event.target.value,
          } as unknown as Group)
      );
    };
  const onChangeTextField =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(field)(event);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save BlaulichtSMS credentials if groupId exists
      if (groupId) {
        const hasAnyBlsField = blsCustomerId || blsUsername || blsPassword;
        if (hasAnyBlsField) {
          await saveBlaulichtsmsConfig(groupId, {
            customerId: blsCustomerId,
            username: blsUsername,
            password: blsPassword || undefined,
          });
        } else if (blsConfig) {
          // All fields cleared — delete existing config
          await deleteBlaulichtsmsConfig(groupId);
        }
      }
    } catch (err) {
      console.error('Failed to save BlaulichtSMS config:', err);
    } finally {
      setSaving(false);
    }
    setOpen(false);
    onClose(group, assigendUsers);
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Gruppe {group.name} bearbeiten</DialogTitle>
      <DialogContent>
        <DialogContentText>ID: {group.id}</DialogContentText>
        {Object.entries(groupTextFields).map(([key, label]) => (
          <TextField
            margin="dense"
            id={key}
            key={key}
            label={label}
            type="text"
            fullWidth
            variant="standard"
            onChange={onChangeTextField(key)}
            value={((group as any)[key] as string) || ''}
          />
        ))}

        <FormControl fullWidth variant="standard">
          <InputLabel id={`firecall-item-users-label`}>
            Benutzer der Gruppe
          </InputLabel>
          <Select
            labelId={`firecall-item-users-label`}
            id={`firecall-item-users`}
            multiple={true}
            value={assigendUsers}
            label="Assigned Users"
            input={<OutlinedInput label="Assigned Users" />}
            MenuProps={MenuProps}
            renderValue={(selected) =>
              selected
                .map((key) => userMap[key])
                .filter((v) => v)
                .map((user) => `${user.displayName || user.email}`)
                .join(', ')
            }
            onChange={(event) => {
              const {
                target: { value },
              } = event;
              setAssigendUsers(
                typeof value === 'string' ? value.split(',') : value
              );
            }}
          >
            {users.map((user) => (
              <MenuItem key={`user-for-group-${user.uid}`} value={user.uid}>
                <Checkbox checked={assigendUsers.indexOf(user.uid) > -1} />
                <ListItemText
                  primary={`${user.displayName || ''} (${user.email})`}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {groupId && (
          <>
            <Divider sx={{ mt: 3, mb: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              BlaulichtSMS Zugangsdaten
            </Typography>
            {blsConfig && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Zuletzt geändert:{' '}
                {blsConfig.updatedAt
                  ? new Date(blsConfig.updatedAt).toLocaleString('de-AT')
                  : '—'}{' '}
                von {blsConfig.updatedBy ?? '—'}
              </Typography>
            )}
            <TextField
              label="Kundennummer"
              fullWidth
              margin="dense"
              variant="standard"
              value={blsCustomerId}
              onChange={(e) => setBlsCustomerId(e.target.value)}
            />
            <TextField
              label="Benutzername"
              fullWidth
              margin="dense"
              variant="standard"
              value={blsUsername}
              onChange={(e) => setBlsUsername(e.target.value)}
            />
            <TextField
              label="Passwort"
              fullWidth
              margin="dense"
              variant="standard"
              type={showPassword ? 'text' : 'password'}
              value={blsPassword}
              onChange={(e) => setBlsPassword(e.target.value)}
              placeholder={blsConfig?.hasPassword ? '••••••••' : ''}
              helperText={
                blsConfig?.hasPassword
                  ? 'Leer lassen, um das bestehende Passwort zu behalten. Alle Felder leeren, um Zugangsdaten zu löschen.'
                  : 'Leer lassen, um keine Zugangsdaten zu speichern.'
              }
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </>
        )}
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
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Aktualisieren'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
