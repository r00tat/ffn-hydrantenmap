'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  totalWaschgaenge,
  waschLimitState,
  type BekleidungStueck,
  type WaschProgramm,
} from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { recordWaesche } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import { stueckLabel, todayLocalDate, type BekleidungView } from './bekleidungUi';
import StueckCollector from './StueckCollector';

export const WASCH_PROGRAMME: WaschProgramm[] = ['standard', 'impraegnierung', 'sonstiges'];

// Gewaschen werden Stücke im Lager wie ausgegebene — nur ausgeschiedene nicht.
const offerWashable = (s: BekleidungStueck) => s.status !== 'ausgeschieden';

/**
 * Waschgang erfassen. Erreicht ein Stück mit dieser Wäsche die Höchstzahl
 * seines Artikels, steht eine Warnung daneben — gesperrt wird nicht.
 */
export default function WaescheDialog({
  open,
  view,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [datum, setDatum] = useState(todayLocalDate);
  const [programm, setProgramm] = useState<WaschProgramm>('standard');
  const [programmText, setProgrammText] = useState('');
  const [stueckIds, setStueckIds] = useState<string[]>([]);
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [triedSubmit, setTriedSubmit] = useState(false);

  const textMissing = programm === 'sonstiges' && !programmText.trim();
  const canSubmit = !!datum && stueckIds.length > 0 && !busy;

  const limitChip = (s: BekleidungStueck) => {
    const artikel = view.artikelById.get(s.artikelId);
    const after = { waschgaenge: s.waschgaenge + 1, waschgaengeAltbestand: s.waschgaengeAltbestand };
    const state = waschLimitState(after, artikel);
    if (state === 'ok' || !artikel?.maxWaschgaenge) return null;
    return (
      <Chip
        size="small"
        color={state === 'reached' ? 'error' : 'warning'}
        label={`${t(state === 'reached' ? 'detail.limitReached' : 'detail.limitNear')} · ${t(
          'waesche.limitAfter',
          { total: totalWaschgaenge(after), max: artikel.maxWaschgaenge },
        )}`}
      />
    );
  };

  const submit = async () => {
    setTriedSubmit(true);
    if (textMissing) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      recordWaesche(view.groupId, {
        datum,
        programm,
        programmText: programm === 'sonstiges' ? programmText.trim() : undefined,
        stueckIds,
        bemerkung: bemerkung.trim() || undefined,
      }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(
        errorText(outcome.error, {
          stueckLabel: (id) => {
            const s = view.stueckById.get(id);
            return s ? stueckLabel(s, view.artikelById) : id;
          },
        }),
      );
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('waesche.title')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date"
              label={t('fields.datum')}
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label={t('fields.programm')}
              value={programm}
              onChange={(e) => setProgramm(e.target.value as WaschProgramm)}
              sx={{ minWidth: 180 }}
            >
              {WASCH_PROGRAMME.map((p) => (
                <MenuItem key={p} value={p}>
                  {t(`programm.${p}`)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {programm === 'sonstiges' && (
            <TextField
              required
              label={t('fields.programmText')}
              value={programmText}
              onChange={(e) => setProgrammText(e.target.value)}
              error={triedSubmit && textMissing}
              helperText={triedSubmit && textMissing ? t('waesche.programmTextRequired') : undefined}
            />
          )}
          <StueckCollector
            view={view}
            selectedIds={stueckIds}
            onChange={setStueckIds}
            offer={offerWashable}
            renderExtra={limitChip}
          />
          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            multiline
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button variant="contained" disabled={!canSubmit} onClick={submit}>
            {t('waesche.submit')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
