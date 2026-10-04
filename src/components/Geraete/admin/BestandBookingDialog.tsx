'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  formatLagerort,
  parseMenge,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import { bookGeraetBestand } from '../geraeteActions';
import { callAction } from './actionResult';

export type BestandBookingMode = 'zugang' | 'umbuchung' | 'inventur';

export interface BestandBookingDialogProps {
  open: boolean;
  groupId: string;
  geraet: Geraet;
  /** Der Lagerort, an dem gebucht wird (bei Umbuchung: die Quelle). */
  bestand: GeraetBestand;
  /** Alle Lagerorte des Artikels — die Ziele einer Umbuchung. */
  bestaende: GeraetBestand[];
  mode: BestandBookingMode;
  onClose: () => void;
}

/**
 * Eine Buchung an einem Lagerort: Zugang (Lieferung), Umbuchung (z. B.
 * Lager → SRF) oder Inventur (Ist-Wert setzen). Bestand, Gesamtbestand und
 * Nachbestellmarke rechnet der Server in einer Transaktion nach.
 */
export default function BestandBookingDialog({
  open,
  groupId,
  geraet,
  bestand,
  bestaende,
  mode,
  onClose,
}: BestandBookingDialogProps) {
  const t = useTranslations('geraete');
  const tCommon = useTranslations('common');

  const targets = bestaende.filter((b) => b.id !== bestand.id);
  const [menge, setMenge] = useState('');
  const [istWert, setIstWert] = useState(String(bestand.anzahl));
  const [zielBestandId, setZielBestandId] = useState(targets[0]?.id ?? '');
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const einheit = geraet.einheit ?? '';

  const handleSave = async () => {
    setError(undefined);
    const note = bemerkung.trim() || undefined;
    let input: Parameters<typeof bookGeraetBestand>[1];
    if (mode === 'inventur') {
      const ist = parseMenge(istWert);
      if (ist === undefined || ist < 0) {
        setError(t('errors.countInvalid'));
        return;
      }
      input = { art: 'inventur', bestandId: bestand.id, istWert: ist, bemerkung: note };
    } else {
      const m = parseMenge(menge);
      if (m === undefined || m <= 0) {
        setError(t('errors.mengeInvalid'));
        return;
      }
      if (mode === 'umbuchung') {
        if (!zielBestandId) {
          setError(t('errors.zielRequired'));
          return;
        }
        input = {
          art: 'umbuchung',
          bestandId: bestand.id,
          zielBestandId,
          menge: m,
          bemerkung: note,
        };
      } else {
        input = { art: 'zugang', bestandId: bestand.id, menge: m, bemerkung: note };
      }
    }

    setBusy(true);
    const outcome = await callAction(() => bookGeraetBestand(groupId, input));
    setBusy(false);
    if (!outcome.ok) {
      setError(t('errors.saveFailed', { error: outcome.error }));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t(`booking.title.${mode}`)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            {geraet.bezeichnung}
            <br />
            {t('booking.at', {
              lagerort: formatLagerort(bestand.lagerort),
              anzahl: bestand.anzahl,
              einheit,
            })}
          </Typography>

          {mode === 'umbuchung' && targets.length === 0 && (
            <Alert severity="info">{t('booking.noTargets')}</Alert>
          )}
          {mode === 'umbuchung' && targets.length > 0 && (
            <TextField
              select
              label={t('booking.ziel')}
              value={zielBestandId}
              onChange={(e) => setZielBestandId(e.target.value)}
              fullWidth
            >
              {targets.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {formatLagerort(b.lagerort)} ({b.anzahl})
                </MenuItem>
              ))}
            </TextField>
          )}

          {mode === 'inventur' ? (
            <TextField
              label={t('booking.istWert')}
              value={istWert}
              onChange={(e) => setIstWert(e.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              autoFocus
              fullWidth
            />
          ) : (
            <TextField
              label={t('booking.menge')}
              value={menge}
              onChange={(e) => setMenge(e.target.value)}
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
              autoFocus
              fullWidth
            />
          )}

          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={busy || (mode === 'umbuchung' && targets.length === 0)}
        >
          {t('booking.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
