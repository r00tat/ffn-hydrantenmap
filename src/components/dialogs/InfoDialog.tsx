import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';

export interface InfoDialogOptions {
  title: string;
  text?: string;
  ok?: string;
  open?: boolean;
  onConfirm: (confirmed: boolean) => void;
  children?: React.ReactNode;
}

export default function InfoDialog({
  title,
  text,
  ok = 'OK',
  open: openDefault = true,
  onConfirm,
  children,
}: InfoDialogOptions) {
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
        {text && (
          <DialogContentText id="alert-dialog-description">
            {text}
          </DialogContentText>
        )}
        {children && (
          <DialogContentText id="alert-dialog-children">
            {children}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => handleClose(true)}
          autoFocus
          color="primary"
          variant="contained"
        >
          {ok}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
