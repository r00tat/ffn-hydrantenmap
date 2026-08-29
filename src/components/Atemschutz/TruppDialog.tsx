'use client';

import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import {
  MAX_TRUPP_MITGLIEDER,
  type AtemschutzTrupp,
  type TruppInput,
  validateTruppInput,
} from '../../common/atemschutz';
import PersonAutocomplete from './PersonAutocomplete';

export interface TruppDialogProps {
  open: boolean;
  /** Fehlt beim Anlegen. */
  trupp?: AtemschutzTrupp;
  feuerwehren: string[];
  personSuggestions: string[];
  onClose: () => void;
  onSave: (input: TruppInput) => Promise<void>;
}

export default function TruppDialog({
  open,
  trupp,
  feuerwehren,
  personSuggestions,
  onClose,
  onSave,
}: TruppDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [truppName, setTruppName] = useState(trupp?.truppName ?? '');
  const [feuerwehr, setFeuerwehr] = useState(trupp?.feuerwehr ?? '');
  // Drei Zeilen sind der Regelfall — sie stehen von Anfang an bereit, damit
  // niemand dreimal „Weiteres Mitglied" drücken muss.
  const [mitglieder, setMitglieder] = useState<string[]>(() => {
    const vorhanden = trupp?.mitglieder ?? [];
    return vorhanden.length > 0
      ? vorhanden
      : ['', '', ''];
  });
  const [bemerkung, setBemerkung] = useState(trupp?.bemerkung ?? '');
  const [saving, setSaving] = useState(false);

  const input: TruppInput = { truppName, feuerwehr, mitglieder, bemerkung };
  const fehler = validateTruppInput(input);

  const setAt = (index: number, value: string) =>
    setMitglieder((prev) => prev.map((m, i) => (i === index ? value : m)));

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
          {mitglieder.map((mitglied, index) => (
            <Stack
              key={index}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <PersonAutocomplete
                label={t('trupp.mitglied', { index: index + 1 })}
                value={mitglied}
                options={personSuggestions}
                onChange={(value) => setAt(index, value)}
              />
              <IconButton
                aria-label={tCommon('delete')}
                disabled={mitglieder.length <= 1}
                onClick={() =>
                  setMitglieder((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
          ))}
          <Button
            startIcon={<AddIcon />}
            disabled={mitglieder.length >= MAX_TRUPP_MITGLIEDER}
            onClick={() => setMitglieder((prev) => [...prev, ''])}
          >
            {t('trupp.addMitglied')}
          </Button>
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
