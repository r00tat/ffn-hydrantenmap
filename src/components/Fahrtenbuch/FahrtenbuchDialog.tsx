'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useTranslations } from 'next-intl';
import type {
  FahrtenbuchEntry,
  FahrtenbuchPerson,
  FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import FahrtenbuchEntryFields from './FahrtenbuchEntryFields';
import {
  createFahrtenbuchEntry,
  updateFahrtenbuchEntry,
} from './fahrtenbuchActions';
import {
  useEntryFormState,
  type FahrtenbuchFirecallOption,
} from './useEntryFormState';

export interface FahrtenbuchDialogProps {
  open: boolean;
  groupId: string;
  vehicles: FahrtenbuchVehicle[];
  persons: FahrtenbuchPerson[];
  /** Einsätze der Gruppe, neueste zuerst — für die Auswahl beim Zweck `einsatz`. */
  firecalls: FahrtenbuchFirecallOption[];
  /** Bereits geladene Einträge — Grundlage für die Warnung beim Bearbeiten. */
  entries?: FahrtenbuchEntry[];
  /** Vorbelegtes Fahrzeug — gesetzt beim Direkt-Button auf der Fahrzeugkarte. */
  vehicleId?: string;
  /** Gesetzt beim Bearbeiten. */
  entry?: FahrtenbuchEntry;
  onClose: () => void;
}

export default function FahrtenbuchDialog({
  open,
  groupId,
  vehicles,
  persons,
  firecalls,
  entries = [],
  vehicleId,
  entry,
  onClose,
}: FahrtenbuchDialogProps) {
  const t = useTranslations('fahrtenbuch');

  const form = useEntryFormState({
    vehicles,
    firecalls,
    entries,
    vehicleId,
    entry,
    onSubmit: (input, options) =>
      entry?.id
        ? updateFahrtenbuchEntry(groupId, entry.id, input, options)
        : createFahrtenbuchEntry(groupId, input, options),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{entry ? t('editEntry') : t('newEntry')}</DialogTitle>
      <DialogContent>
        <FahrtenbuchEntryFields form={form} persons={persons} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="contained"
          onClick={async () => {
            const result = await form.submit();
            if (result.success) onClose();
          }}
          disabled={form.saving}
        >
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
