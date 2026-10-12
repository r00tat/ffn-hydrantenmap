'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BekleidungArtikel } from '../../common/bekleidung';
import { callAction } from '../Geraete/admin/actionResult';
import OnlineOnly from '../site/OnlineOnly';
import { mergeArtikel } from './bekleidungActions';
import { useBekleidungErrorText } from './bekleidungErrors';

/** Bezeichnung mit Hersteller — Varianten heißen oft gleich. */
export const artikelLabel = (a: BekleidungArtikel) =>
  a.hersteller ? `${a.bezeichnung} (${a.hersteller})` : a.bezeichnung;

/**
 * Einen Artikeltyp in einen gleichartigen (Kategorie und Führung) übernehmen.
 * Stücke, Ausgaben und Bestand wandern mit, der Artikel selbst wird gelöscht.
 */
export default function ArtikelMergeDialog({
  open,
  groupId,
  source,
  targets,
  onClose,
}: {
  open: boolean;
  groupId: string;
  source: BekleidungArtikel;
  targets: BekleidungArtikel[];
  onClose: () => void;
}) {
  const t = useTranslations('bekleidung');
  const errorText = useBekleidungErrorText();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!source.id || !targetId) return;
    setBusy(true);
    setError(undefined);
    const outcome = await callAction(() => mergeArtikel(groupId, targetId, [source.id!]));
    setBusy(false);
    if (!outcome.ok) {
      setError(errorText(outcome.error));
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('artikel.mergeTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            {t('artikel.mergeHint', { name: artikelLabel(source) })}
          </Typography>
          <TextField
            select
            label={t('artikel.mergeTarget')}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {artikelLabel(a)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
        <OnlineOnly>
          <Button variant="contained" color="warning" disabled={!targetId || busy} onClick={submit}>
            {t('artikel.merge')}
          </Button>
        </OnlineOnly>
      </DialogActions>
    </Dialog>
  );
}
