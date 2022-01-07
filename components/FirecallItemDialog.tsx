import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { FirecallItem } from './firestore';

export interface FirecallItemDialogOptions {
  onClose: (rohr?: FirecallItem) => void;
  item?: FirecallItem;
  children: React.ReactNode;
  dialogText: React.ReactNode;
}

export default function FirecallItemDialog({
  onClose,
  item: rohrDefault,
  children,
  dialogText,
}: FirecallItemDialogOptions) {
  const [open, setOpen] = useState(true);
  const [rohr, setFirecallItem] = useState<FirecallItem>(
    rohrDefault || {
      name: '',
    }
  );

  const onChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFirecallItem((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  return (
    <Dialog open={open} onClose={() => onClose()}>
      <DialogTitle>Neues Element hinzuf&uuml;gen</DialogTitle>
      <DialogContent>
        <DialogContentText>{dialogText}</DialogContentText>
        {children}
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
