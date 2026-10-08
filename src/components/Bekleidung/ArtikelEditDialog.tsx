'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  BekleidungArtikel,
  BekleidungFuehrung,
  BekleidungKategorie,
} from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { saveArtikel } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';

/**
 * Artikeltyp anlegen oder bearbeiten. Die Führung lässt der Server nur
 * ändern, solange es keine Stücke oder keinen Bestand gibt (`fuehrungLocked`).
 */
export default function ArtikelEditDialog({
  open,
  groupId,
  artikel,
  onClose,
}: {
  open: boolean;
  groupId: string;
  artikel?: BekleidungArtikel;
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [kategorie, setKategorie] = useState<BekleidungKategorie>(artikel?.kategorie ?? 'einsatz');
  const [bezeichnung, setBezeichnung] = useState(artikel?.bezeichnung ?? '');
  const [hersteller, setHersteller] = useState(artikel?.hersteller ?? '');
  const [fuehrung, setFuehrung] = useState<BekleidungFuehrung>(artikel?.fuehrung ?? 'einzeln');
  const [maxWaschgaenge, setMaxWaschgaenge] = useState(
    artikel?.maxWaschgaenge ? String(artikel.maxWaschgaenge) : '',
  );
  const [aktiv, setAktiv] = useState(artikel?.aktiv ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const maxNumber = Number(maxWaschgaenge);
  const maxValid =
    fuehrung !== 'einzeln' ||
    maxWaschgaenge.trim() === '' ||
    (Number.isInteger(maxNumber) && maxNumber > 0);
  const canSubmit = !!bezeichnung.trim() && maxValid && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() =>
      saveArtikel(groupId, artikel?.id, {
        kategorie,
        bezeichnung: bezeichnung.trim(),
        hersteller: hersteller.trim() || undefined,
        fuehrung,
        maxWaschgaenge:
          fuehrung === 'einzeln' && maxWaschgaenge.trim() ? maxNumber : undefined,
        aktiv,
      }),
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t(artikel ? 'artikel.titleEdit' : 'artikel.titleNew')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label={t('fields.kategorie')}
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value as BekleidungKategorie)}
          >
            <MenuItem value="einsatz">{t('kategorie.einsatz')}</MenuItem>
            <MenuItem value="dienst">{t('kategorie.dienst')}</MenuItem>
          </TextField>
          <TextField
            required
            label={t('fields.bezeichnung')}
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
          />
          <TextField
            label={t('fields.hersteller')}
            value={hersteller}
            onChange={(e) => setHersteller(e.target.value)}
          />
          <TextField
            select
            label={t('fields.fuehrung')}
            value={fuehrung}
            onChange={(e) => setFuehrung(e.target.value as BekleidungFuehrung)}
            helperText={t('artikel.fuehrungHelper')}
          >
            <MenuItem value="einzeln">{t('fuehrung.einzeln')}</MenuItem>
            <MenuItem value="menge">{t('fuehrung.menge')}</MenuItem>
          </TextField>
          {fuehrung === 'einzeln' && (
            <TextField
              type="number"
              label={t('fields.maxWaschgaenge')}
              value={maxWaschgaenge}
              onChange={(e) => setMaxWaschgaenge(e.target.value)}
              error={!maxValid}
              helperText={t('artikel.maxWaschgaengeHelper')}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
            />
          )}
          <FormControlLabel
            control={<Switch checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />}
            label={t('fields.aktiv')}
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
