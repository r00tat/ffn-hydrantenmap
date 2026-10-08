'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GERAET_CHARGE_MAX_TEXT, type GeraetCharge } from '../../../common/geraet';
import { saveGeraetCharge, type GeraetChargeInput } from '../geraeteActions';
import { callAction } from './actionResult';

const FIELDS = [
  'bezeichnung',
  'produktionsNummer',
  'einkaufsDatum',
  'ablaufDatum',
  'kommentar',
] as const;

type ChargeField = (typeof FIELDS)[number];
type ChargeForm = Record<ChargeField, string>;

const DATE_FIELDS = new Set<ChargeField>(['einkaufsDatum', 'ablaufDatum']);

function initialForm(charge?: GeraetCharge): ChargeForm {
  return Object.fromEntries(FIELDS.map((f) => [f, charge?.[f] ?? ''])) as ChargeForm;
}

export interface ChargeDialogProps {
  open: boolean;
  groupId: string;
  geraetId: string;
  /** Ohne: neue Charge anlegen. */
  charge?: GeraetCharge;
  onClose: () => void;
}

/**
 * Eine Charge anlegen oder bearbeiten. Alle Felder sind optional; angezeigt
 * wird die Charge über `formatCharge`. Beim Bearbeiten gehen alle Felder mit —
 * der Server ersetzt die ganze Charge, ein leeres Feld fällt weg.
 */
export default function ChargeDialog({
  open,
  groupId,
  geraetId,
  charge,
  onClose,
}: ChargeDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState<ChargeForm>(() => initialForm(charge));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const handleSave = async () => {
    setError(undefined);
    const input: GeraetChargeInput = {
      ...(charge ? { id: charge.id } : {}),
      ...Object.fromEntries(FIELDS.map((f) => [f, form[f].trim()])),
    };
    setBusy(true);
    const outcome = await callAction(() => saveGeraetCharge(groupId, geraetId, input));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  const field = (name: ChargeField) => (
    <TextField
      key={name}
      label={t(`chargen.fields.${name}`)}
      value={form[name]}
      onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
      type={DATE_FIELDS.has(name) ? 'date' : undefined}
      multiline={name === 'kommentar'}
      minRows={name === 'kommentar' ? 2 : undefined}
      slotProps={
        DATE_FIELDS.has(name)
          ? { inputLabel: { shrink: true } }
          : { htmlInput: { maxLength: GERAET_CHARGE_MAX_TEXT } }
      }
      fullWidth
    />
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {charge ? t('chargen.dialogTitleEdit') : t('chargen.dialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {FIELDS.map(field)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={busy}>
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
