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
import { useFirecallId } from '../../hooks/useFirecall';
import FahrtenbuchEntryFields from './FahrtenbuchEntryFields';
import {
  createFahrtenbuchEntry,
  firecallRoundTripDistance,
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
  // Der in der App ausgewählte Einsatz, sonst der letzte — die Unterscheidung
  // trifft schon `useFirecall`. Gehört hierher und nicht in `useEntryFormState`:
  // Das Gastformular hinter einem Freigabe-Link läuft ohne diesen Kontext.
  const activeFirecallId = useFirecallId();

  const form = useEntryFormState({
    vehicles,
    firecalls,
    entries,
    vehicleId,
    entry,
    activeFirecallId,
    resolveDistance: async (firecallId) => {
      const result = await firecallRoundTripDistance(groupId, firecallId);
      if (!result.success || result.roundTripKm === undefined) return undefined;
      return {
        roundTripKm: result.roundTripKm,
        source: result.source ?? 'estimate',
      };
    },
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
