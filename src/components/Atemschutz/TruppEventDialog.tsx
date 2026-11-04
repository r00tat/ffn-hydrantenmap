'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  TRUPP_EVENT_FIELDS,
  truppLabel,
  validateTruppEventEdit,
  type AtemschutzTrupp,
  type TruppEvent,
  type TruppEventInput,
} from '../../common/atemschutz';
import { fromLocalInput, toLocalInput } from '../../common/zeitEingabe';

export interface TruppEventDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  event: TruppEvent;
  onClose: () => void;
  onSave: (input: TruppEventInput) => Promise<void>;
}

/**
 * Abmarsch oder Rückkehr eines Trupps korrigieren — Zeit und Druck.
 *
 * Beide stehen nicht in `abfragen`, sondern als Felder am Trupp
 * (`TRUPP_EVENT_FIELDS`), und ließen sich nach dem Erfassen nicht mehr ändern.
 * Ein vertippter Abmarschdruck verschiebt aber die ganze Prognose. Der
 * Zustand des Trupps bleibt unberührt: Das hier ist eine Korrektur, kein
 * Zustandswechsel.
 */
export default function TruppEventDialog({
  open,
  trupp,
  event,
  onClose,
  onSave,
}: TruppEventDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const fields = TRUPP_EVENT_FIELDS[event];
  const originalTime = trupp[fields.time];
  const originalPressure = trupp[fields.pressure];

  const [druck, setDruck] = useState(
    typeof originalPressure === 'number' ? String(originalPressure) : '',
  );
  const [zeit, setZeit] = useState(() => toLocalInput(originalTime ?? new Date()));
  /**
   * Unverändert bleibt die erfasste Zeit **samt Sekunden** — `datetime-local`
   * kennt nur Minuten, und aus Abmarsch und Rückkehr errechnet sich die Dauer.
   */
  const [zeitGeaendert, setZeitGeaendert] = useState(false);
  const [saving, setSaving] = useState(false);

  const druckWert = druck.trim() ? Number(druck.trim().replace(',', '.')) : undefined;
  const zeitpunkt =
    (zeitGeaendert || !originalTime ? fromLocalInput(zeit) : originalTime) ?? '';
  const input: TruppEventInput = {
    zeitpunkt,
    ...(druckWert !== undefined ? { druck: druckWert } : {}),
  };
  const fehler = validateTruppEventEdit(trupp, event, input);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(input);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {event === 'abmarsch'
          ? t('ueberwachung.abmarschBearbeitenTitle')
          : t('ueberwachung.rueckkehrBearbeitenTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>
          <TextField
            fullWidth
            type="datetime-local"
            label={t('ueberwachung.ereignisZeit')}
            value={zeit}
            onChange={(e) => {
              setZeit(e.target.value);
              setZeitGeaendert(true);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            autoFocus
            type="number"
            label={t('ueberwachung.ereignisDruck')}
            value={druck}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            onChange={(e) => setDruck(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            {t('ueberwachung.korrekturTagebuchHinweis')}
          </Typography>
          {fehler.length > 0 && (
            <Alert severity="warning">
              {fehler
                .map((key) =>
                  t(`ueberwachung.errors.${key}` as 'ueberwachung.errors.druckInvalid'),
                )
                .join(' · ')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={saving || fehler.length > 0}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
