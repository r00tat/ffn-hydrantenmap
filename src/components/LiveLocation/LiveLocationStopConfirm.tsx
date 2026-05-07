'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

export interface LiveLocationStopConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LiveLocationStopConfirm({
  open,
  onClose,
  onConfirm,
}: LiveLocationStopConfirmProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Live-Sharing beenden?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Dein Live-Standort wird nicht mehr mit anderen Einsatzkräften geteilt.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleConfirm} color="error" variant="contained">
          Beenden
        </Button>
      </DialogActions>
    </Dialog>
  );
}
