import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';

export interface AlertDialogOptions {
  title: string;
  text: string;
  yes?: string;
  no?: string;
  open?: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export default function ConfirmDialog({
  title,
  text,
  yes = 'ja',
  no = 'nein',
  open: openDefault = true,
  onConfirm,
}: AlertDialogOptions) {
  const [open, setOpen] = React.useState(openDefault);

  const handleClose = (result: boolean) => {
    setOpen(false);

    onConfirm(result);
  };

  return (
    <Dialog
      open={open}
      onClose={() => handleClose(false)}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          {text}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => handleClose(false)}>{no}</Button>
        <Button onClick={() => handleClose(true)} autoFocus variant="contained">
          {yes}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
