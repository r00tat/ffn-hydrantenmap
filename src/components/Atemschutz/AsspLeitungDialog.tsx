'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { useTranslations } from 'next-intl';
import { sanitizePersonen } from '../../common/atemschutz';
import PersonAutocomplete from './PersonAutocomplete';
import PersonChipsInput from './PersonChipsInput';

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
  const [personal, setPersonal] = useState<string[]>(() =>
    sanitizePersonen(fuellpersonal),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(leiterValue.trim(), sanitizePersonen(personal));
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
          <PersonChipsInput
            label={t('header.fuellpersonal')}
            helperText={t('header.fuellpersonalHint')}
            value={personal}
            options={suggestions}
            onChange={setPersonal}
          />
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
