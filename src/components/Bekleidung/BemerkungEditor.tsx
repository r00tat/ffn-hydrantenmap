'use client';

import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import OnlineOnly from '../site/OnlineOnly';

/**
 * Bemerkung direkt im Detaildialog lesen und ergänzen, ohne den ganzen
 * Bearbeiten-Dialog. `onSave` liefert eine Fehlermeldung oder nichts.
 */
export default function BemerkungEditor({
  value,
  onSave,
}: {
  value?: string;
  onSave: (bemerkung: string) => Promise<string | undefined>;
}) {
  const t = useTranslations('bekleidung');
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    if (draft === undefined) return;
    setBusy(true);
    const message = await onSave(draft.trim());
    setBusy(false);
    setError(message);
    if (!message) setDraft(undefined);
  };

  if (draft !== undefined) {
    return (
      <Stack spacing={1}>
        <TextField
          autoFocus
          multiline
          size="small"
          label={t('fields.bemerkung')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          error={!!error}
          helperText={error}
        />
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => setDraft(undefined)}>
            {t('actions.cancel')}
          </Button>
          <OnlineOnly>
            <Button size="small" variant="contained" disabled={busy} onClick={save}>
              {t('actions.save')}
            </Button>
          </OnlineOnly>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
        {t('fields.bemerkung')}:
      </Typography>
      <Typography variant="body2" sx={{ flexGrow: 1, whiteSpace: 'pre-wrap' }}>
        {value || <em>{t('bemerkung.empty')}</em>}
      </Typography>
      <OnlineOnly>
        <Tooltip title={t('bemerkung.edit')}>
          <IconButton
            size="small"
            aria-label={t('bemerkung.edit')}
            onClick={() => {
              setError(undefined);
              setDraft(value ?? '');
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </OnlineOnly>
    </Stack>
  );
}
