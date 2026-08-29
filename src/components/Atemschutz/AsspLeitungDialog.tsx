'use client';

import { useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { useTranslations } from 'next-intl';
import PersonAutocomplete from './PersonAutocomplete';

export interface AsspLeitungDialogProps {
  open: boolean;
  leiter: string;
  fuellpersonal: string[];
  suggestions: string[];
  onClose: () => void;
  onSave: (leiter: string, fuellpersonal: string[]) => Promise<void>;
}

export default function AsspLeitungDialog({
  open,
  leiter,
  fuellpersonal,
  suggestions,
  onClose,
  onSave,
}: AsspLeitungDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const [leiterValue, setLeiterValue] = useState(leiter);
  // Eine leere Zeile am Ende, damit immer ein freies Feld sichtbar ist.
  const [personal, setPersonal] = useState<string[]>(
    fuellpersonal.length > 0 ? fuellpersonal : [''],
  );
  const [saving, setSaving] = useState(false);

  const setAt = (index: number, value: string) =>
    setPersonal((prev) => prev.map((p, i) => (i === index ? value : p)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        leiterValue.trim(),
        personal.map((p) => p.trim()).filter(Boolean),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('header.dialogTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <PersonAutocomplete
            label={t('header.leiter')}
            value={leiterValue}
            options={suggestions}
            onChange={setLeiterValue}
          />
          {personal.map((person, index) => (
            <Stack
              key={index}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <PersonAutocomplete
                label={t('header.fuellpersonal')}
                value={person}
                options={suggestions}
                onChange={(value) => setAt(index, value)}
              />
              <IconButton
                aria-label={tCommon('delete')}
                onClick={() =>
                  setPersonal((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
          ))}
          <Button
            startIcon={<AddIcon />}
            onClick={() => setPersonal((prev) => [...prev, ''])}
          >
            {t('header.addPerson')}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
