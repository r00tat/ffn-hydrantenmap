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
import { bestandDocId, normalizeCharge } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { adjustBestand } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';
import { knownSizes, type BekleidungView } from './bekleidungUi';

type Mode = 'zugang' | 'korrektur';

/** Bekannte Chargen eines Artikels, für die Auswahl beim Zugang. */
function knownChargen(artikelId: string, view: BekleidungView): string[] {
  const chargen = new Set<string>();
  for (const b of view.bestand) {
    const charge = normalizeCharge(b.charge);
    if (b.artikelId === artikelId && charge) chargen.add(charge);
  }
  return [...chargen].sort(new Intl.Collator('de', { numeric: true }).compare);
}

/**
 * Zugang oder Korrektur eines Mengenbestands je Charge. Die Korrektur nimmt
 * den gezählten Bestand und bucht die Differenz — so muss niemand rechnen.
 * `charge` als Prop legt die Charge fest; `''` heißt „ohne Charge".
 */
export default function BestandAdjustDialog({
  open,
  view,
  artikelId: fixedArtikelId,
  groesse: fixedGroesse,
  charge: fixedCharge,
  onClose,
}: {
  open: boolean;
  view: BekleidungView;
  artikelId?: string;
  groesse?: string;
  charge?: string;
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
  const [charge, setCharge] = useState(fixedCharge ?? '');
  const [mode, setMode] = useState<Mode>('zugang');
  const [value, setValue] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const docId = artikelId && groesse.trim() ? bestandDocId(artikelId, groesse, charge) : '';
  const current =
    view.bestand.find((b) => docId && bestandDocId(b.artikelId, b.groesse, b.charge) === docId)
      ?.anzahl ?? 0;
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
        ...(normalizeCharge(charge) ? { charge: normalizeCharge(charge) } : {}),
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
          <Autocomplete
            freeSolo
            disabled={fixedCharge !== undefined}
            options={artikelId ? knownChargen(artikelId, view) : []}
            inputValue={charge}
            onInputChange={(_, v) => setCharge(v)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('fields.charge')}
                helperText={fixedCharge === undefined ? t('lagerstand.chargeHint') : undefined}
              />
            )}
          />
          <Typography variant="body2">{t('lagerstand.current', { count: current })}</Typography>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <FormControlLabel
              value="zugang"
              control={<Radio />}
              label={t('lagerstand.modeZugang')}
            />
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
