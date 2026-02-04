import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import React, { useEffect, useMemo, useState } from 'react';
import { UserRecordExtended } from '../../common/users';
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
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 10 + ITEM_PADDING_TOP,
      width: 250,
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
              // On autofill we get a stringified value.
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
            onClose(group, assigendUsers);
          }}
        >
          Aktualisieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
