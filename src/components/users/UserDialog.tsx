import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import React, { useState } from 'react';
import { feuerwehren } from '../../common/feuerwehren';
import { UserRecordExtended, userTextFields } from '../../common/users';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 10 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

export interface UserRecordExtendedDialogOptions {
  onClose: (item?: UserRecordExtended, newPassword?: string) => void;
  user: UserRecordExtended;
  groups: { [key: string]: string };
}

export default function UserRecordExtendedDialog({
  onClose,
  user: userDefault,
  groups,
}: UserRecordExtendedDialogOptions) {
  const [open, setOpen] = useState(true);
  const [user, setUserRecordExtended] =
    useState<UserRecordExtended>(userDefault);
  const [newPassword, setNewPassword] = useState('');

  const onChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement> | SelectChangeEvent) => {
      setUserRecordExtended(
        (prev) =>
          ({
            ...prev,
            [field]: event.target.value,
          } as unknown as UserRecordExtended)
      );
    };
  const onChangeTextField =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(field)(event);

  const onChangeSwitch =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setUserRecordExtended(
        (prev) =>
          ({
            ...prev,
            [field]: event.target.checked,
          } as unknown as UserRecordExtended)
      );
    };

  const handleGroupChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value },
    } = event;
    setUserRecordExtended(
      (prev) =>
        ({
          ...prev,
          groups: typeof value === 'string' ? value.split(',') : value,
        } as unknown as UserRecordExtended)
    );
  };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Benutzer {user.displayName} bearbeiten</DialogTitle>
      <DialogContent>
        <DialogContentText>
          UID: {user.uid}
          <br />
          E-Mail: {user.email}
          <br />
          Feuerwehr: {user.feuerwehr}
          <br />
          Abschnitt: {feuerwehren[user.feuerwehr || 'fallback']?.abschnitt}
        </DialogContentText>
        <FormControl fullWidth variant="standard">
          <InputLabel id="fw-label">Feuerwehr</InputLabel>
          <Select
            labelId="fw-label"
            id="user-fw"
            value={user.feuerwehr || 'neusiedl'}
            label="Feuerwehr"
            onChange={onChange('feuerwehr')}
          >
            {Object.entries(feuerwehren)
              .filter(([key]) => key !== 'fallback')
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, fw]) => (
                <MenuItem key={key} value={key}>
                  {fw.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        {Object.entries(userTextFields).map(([key, label]) => (
          <TextField
            margin="dense"
            id={key}
            key={key}
            label={label}
            type="text"
            fullWidth
            variant="standard"
            onChange={onChangeTextField(key)}
            value={((user as any)[key] as string) || ''}
          />
        ))}
        <TextField
          margin="dense"
          id="newPassword"
          label="Neues Passwort setzen"
          type="password"
          fullWidth
          variant="standard"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          helperText={
            newPassword && newPassword.length < 6
              ? 'Mindestens 6 Zeichen'
              : undefined
          }
        />
        <FormControl sx={{ m: 1, width: 300 }}>
          <InputLabel id="user-group-checkbox-label">Gruppen</InputLabel>
          <Select
            labelId="user-group-checkbox-label"
            id="user-group-checkbox"
            multiple
            value={user.groups || []}
            onChange={handleGroupChange}
            input={<OutlinedInput label="Group" />}
            renderValue={(selected) =>
              selected
                .map((key) => groups[key])
                .filter((v) => v)
                .join(', ')
            }
            MenuProps={MenuProps}
          >
            {Object.entries(groups).map(([key, name]) => (
              <MenuItem key={key} value={key}>
                <Checkbox checked={(user.groups || []).indexOf(key) > -1} />
                <ListItemText primary={name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={user.authorized}
                onChange={onChangeSwitch('authorized')}
              />
            }
            label="Authorized"
          />
        </FormGroup>
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
            onClose(user, newPassword || undefined);
          }}
        >
          Aktualisieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
