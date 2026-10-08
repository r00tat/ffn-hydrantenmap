'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { normalizeGroesse } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { adjustBestand } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import { knownSizes, type BekleidungView } from './bekleidungUi';

type Mode = 'zugang' | 'korrektur';

/**
 * Zugang oder Korrektur eines Mengenbestands. Die Korrektur nimmt den
 * gezählten Bestand und bucht die Differenz — so muss niemand rechnen.
 */
export default function BestandAdjustDialog({
  open,
  view,
  artikelId: fixedArtikelId,
  groesse: fixedGroesse,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  artikelId?: string;
  groesse?: string;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const mengeArtikel = useMemo(
    () => view.artikel.filter((a) => a.fuehrung === 'menge'),
    [view.artikel],
  );
  const [artikelId, setArtikelId] = useState(fixedArtikelId ?? '');
  const [groesse, setGroesse] = useState(fixedGroesse ?? '');
  const [mode, setMode] = useState<Mode>('zugang');
  const [value, setValue] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const current =
    view.bestand.find(
      (b) =>
        b.artikelId === artikelId &&
        groesse.trim() &&
        normalizeGroesse(b.groesse) === normalizeGroesse(groesse),
    )?.anzahl ?? 0;
  const number = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(number) && number >= 0;
  const delta = valid ? (mode === 'zugang' ? number : number - current) : 0;
  const canSubmit = !!artikelId && !!groesse.trim() && valid && delta !== 0 && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      adjustBestand(view.groupId, {
        artikelId,
        groesse: groesse.trim(),
        delta,
        bemerkung: bemerkung.trim() || undefined,
      }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(
        errorText(outcome.error, {
          artikelLabel: (id) => view.artikelById.get(id)?.bezeichnung ?? id,
        }),
      );
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('lagerstand.adjustTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label={t('fields.artikel')}
            value={artikelId}
            disabled={!!fixedArtikelId}
            onChange={(e) => setArtikelId(e.target.value)}
          >
            {mengeArtikel.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.bezeichnung}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            freeSolo
            disabled={!!fixedGroesse}
            options={artikelId ? knownSizes(artikelId, view.bestand) : []}
            inputValue={groesse}
            onInputChange={(_, v) => setGroesse(v)}
            renderInput={(params) => <TextField {...params} label={t('fields.groesse')} />}
          />
          <Typography variant="body2">{t('lagerstand.current', { count: current })}</Typography>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <FormControlLabel value="zugang" control={<Radio />} label={t('lagerstand.modeZugang')} />
            <FormControlLabel
              value="korrektur"
              control={<Radio />}
              label={t('lagerstand.modeKorrektur')}
            />
          </RadioGroup>
          <TextField
            type="number"
            label={t(mode === 'zugang' ? 'lagerstand.zugangLabel' : 'lagerstand.korrekturLabel')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
          <TextField
            label={t('fields.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button variant="contained" disabled={!canSubmit} onClick={submit}>
            {t('actions.save')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
