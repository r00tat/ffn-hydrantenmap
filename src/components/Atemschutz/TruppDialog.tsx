'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import {
  MAX_TRUPP_MITGLIEDER,
  type AtemschutzTrupp,
  type TruppInput,
  validateTruppInput,
} from '../../common/atemschutz';
import PersonChipsInput from './PersonChipsInput';

export interface TruppDialogProps {
  open: boolean;
  /** Fehlt beim Anlegen. */
  trupp?: AtemschutzTrupp;
  feuerwehren: string[];
  personSuggestions: string[];
  /**
   * Fahrzeuge und taktische Einheiten des Einsatzes. **Fehlt** die Angabe,
   * entfällt das Feld — am Sammelplatz steht beim Erfassen noch nicht fest,
   * wohin der Trupp geht, dort wird die Einheit erst beim Entsenden gefragt.
   */
  einheitVorschlaege?: string[];
  /**
   * Vorbelegung beim **Anlegen** — die eigene Einheit des Geräts bzw. die des
   * aktiven Reiters. Am bestehenden Trupp gilt sein eigener Wert.
   */
  einheitVorgabe?: string;
  onClose: () => void;
  onSave: (input: TruppInput) => Promise<void>;
}

export default function TruppDialog({
  open,
  trupp,
  feuerwehren,
  personSuggestions,
  einheitVorschlaege,
  einheitVorgabe,
  onClose,
  onSave,
}: TruppDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [truppName, setTruppName] = useState(trupp?.truppName ?? '');
  const [feuerwehr, setFeuerwehr] = useState(trupp?.feuerwehr ?? '');
  const [mitglieder, setMitglieder] = useState<string[]>(
    () => trupp?.mitglieder ?? [],
  );
  const [bemerkung, setBemerkung] = useState(trupp?.bemerkung ?? '');
  const [entsendetAn, setEntsendetAn] = useState(
    trupp?.entsendetAn ?? einheitVorgabe ?? '',
  );
  const [saving, setSaving] = useState(false);

  const input: TruppInput = {
    truppName,
    feuerwehr,
    mitglieder,
    bemerkung,
    entsendetAn,
  };
  const fehler = validateTruppInput(input);

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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {trupp ? t('trupp.dialogTitleEdit') : t('trupp.dialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Autocomplete
            freeSolo
            fullWidth
            options={feuerwehren}
            value={feuerwehr}
            onInputChange={(_, next) => setFeuerwehr(next ?? '')}
            onChange={(_, next) =>
              setFeuerwehr(typeof next === 'string' ? next : '')
            }
            renderInput={(params) => (
              <TextField {...params} required label={t('trupp.feuerwehr')} />
            )}
          />
          <TextField
            fullWidth
            label={t('trupp.name')}
            helperText={t('trupp.nameHint')}
            value={truppName}
            onChange={(e) => setTruppName(e.target.value)}
          />
          <PersonChipsInput
            label={t('trupp.mitglieder')}
            helperText={t('trupp.mitgliederHint')}
            vollText={t('trupp.mitgliederVoll', { max: MAX_TRUPP_MITGLIEDER })}
            value={mitglieder}
            options={personSuggestions}
            max={MAX_TRUPP_MITGLIEDER}
            onChange={setMitglieder}
          />
          {einheitVorschlaege && (
            <Autocomplete
              freeSolo
              fullWidth
              options={einheitVorschlaege}
              value={entsendetAn}
              onInputChange={(_, next) => setEntsendetAn(next ?? '')}
              onChange={(_, next) =>
                setEntsendetAn(typeof next === 'string' ? next : '')
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('ueberwachung.truppEinheit')}
                  helperText={t('ueberwachung.truppEinheitHint')}
                />
              )}
            />
          )}
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('trupp.bemerkung')}
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
          {fehler.length > 0 && (
            <Alert severity="warning">
              {fehler
                .map((key) =>
                  t(`trupp.errors.${key}` as 'trupp.errors.feuerwehrMissing'),
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
