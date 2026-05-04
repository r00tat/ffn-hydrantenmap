'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';
import { openAppSettings, PermissionType } from '../../lib/permissions';

const TITLES: Record<PermissionType, string> = {
  location: 'Standort blockiert',
  bluetooth: 'Bluetooth blockiert',
  notifications: 'Mitteilungen blockiert',
};

interface Props {
  open: boolean;
  type: PermissionType | null;
  message: string;
  onClose: () => void;
}

export default function SettingsRedirectDialog({
  open,
  type,
  message,
  onClose,
}: Props) {
  const title = type ? TITLES[type] : 'Berechtigung blockiert';
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          onClick={async () => {
            await openAppSettings();
            onClose();
          }}
        >
          Einstellungen öffnen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
