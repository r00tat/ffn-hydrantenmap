import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import React, { useState } from 'react';
import { Group } from './GroupAction';

export interface GroupDialoggOptions {
  onClose: (item?: Group) => void;
  group: Group;
}

export const groupTextFields: { [key: string]: string } = {
  name: 'Name',
  description: 'Zusatzinfo',
};

export default function GroupDialogg({
  onClose,
  group: groupDefault,
}: GroupDialoggOptions) {
  const [open, setOpen] = useState(true);
  const [group, setGroup] = useState<Group>(groupDefault);

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
            onClose(group);
          }}
        >
          Aktualisieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
