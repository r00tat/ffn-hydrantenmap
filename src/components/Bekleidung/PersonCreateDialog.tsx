'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { createPersonForBekleidung } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';

/**
 * Neue Person der Gruppe — dieselbe Personenliste wie im Fahrtenbuch.
 * Ein Name, den es (normalisiert) schon gibt, lehnt der Server ab.
 */
export default function PersonCreateDialog({
  open,
  groupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onCreated: (personId: string) => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() => createPersonForBekleidung(groupId, name.trim()));
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    if ('id' in outcome.value) onCreated(outcome.value.id);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('personen.newPersonTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={t('personen.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button variant="contained" disabled={busy || !name.trim()} onClick={submit}>
            {t('actions.save')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
