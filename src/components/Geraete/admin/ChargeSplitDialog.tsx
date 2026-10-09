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
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatCharge,
  formatLagerort,
  parseMenge,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import { clean } from '../../../common/geraetBestandLogic';
import { activeChargen, sortFefo } from '../../../common/geraetCharge';
import { aufteilenGeraetBestand } from '../geraeteActions';
import { callAction } from './actionResult';
import { formatIsoDate } from './chargeFormat';

export interface ChargeSplitDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  bestand: GeraetBestand;
  onClose: () => void;
}

/**
 * Ordnet den Bestand eines Lagerorts den Chargen zu — für Ware, die vor den
 * Chargen da war oder ohne Charge zugebucht wurde. `anzahl` bleibt gleich;
 * was keiner Charge zugeordnet ist, ist der Rest ohne Charge.
 */
export default function ChargeSplitDialog({
  open,
  groupId,
  geraet,
  bestand,
  onClose,
}: ChargeSplitDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const chargen = useMemo(() => sortFefo(activeChargen(geraet)), [geraet]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      chargen.map((c) => {
        const menge = bestand.chargen?.[c.id];
        return [c.id, menge ? String(menge) : ''];
      }),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Leer zählt als 0; eine ungültige Eingabe sperrt das Speichern.
  const parsed = chargen.map((c) => {
    const text = values[c.id] ?? '';
    return { id: c.id, menge: text.trim() ? parseMenge(text) : 0 };
  });
  const allValid = parsed.every((p) => p.menge !== undefined);
  const sum = clean(parsed.reduce((s, p) => s + (p.menge ?? 0), 0));
  const rest = clean((bestand.anzahl ?? 0) - sum);
  // Leeren geht immer — auch bei negativem Bestand.
  const restOk = rest >= 0 || sum === 0;

  const handleSave = async () => {
    setError(undefined);
    const map: Record<string, number> = {};
    for (const p of parsed) if (p.menge) map[p.id] = p.menge;
    setBusy(true);
    const outcome = await callAction(() => aufteilenGeraetBestand(groupId, bestand.id, map));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('chargen.split.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            {geraet.bezeichnung}
            <br />
            {t('booking.at', {
              lagerort: formatLagerort(bestand.lagerort),
              anzahl: bestand.anzahl,
              einheit: geraet.einheit ?? '',
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('chargen.split.hint')}
          </Typography>
          {chargen.length === 0 && (
            <Alert severity="info">{t('chargen.split.noChargen')}</Alert>
          )}
          {chargen.map((c) => (
            <TextField
              key={c.id}
              label={formatCharge(c)}
              value={values[c.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              helperText={
                c.ablaufDatum ? t('chargen.booking.ablauf', { datum: formatIsoDate(format, c.ablaufDatum) }) : undefined
              }
              fullWidth
            />
          ))}
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {t('chargen.split.rest', { menge: rest })}
          </Typography>
          {!restOk && (
            <Alert severity="warning">
              {t('chargen.split.restNegative', { anzahl: bestand.anzahl })}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={busy || !allValid || !restOk || chargen.length === 0}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
