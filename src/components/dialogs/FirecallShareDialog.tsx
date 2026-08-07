'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { createCustomFirebaseTokenForFirecall } from '../../app/actions/auth';
import { normalizeGuestName } from '../../common/firecallGuest';

export interface FirecallShareDialogProps {
  firecallId: string;
  onClose: () => void;
}

type AccessLevel = 'read' | 'write';

/**
 * Erstellt einen Share-Link für einen Einsatz. Der Ersteller vergibt einen Namen
 * für den Gast — damit ist der Zugang in der Benutzerverwaltung wiedererkennbar —
 * und entscheidet zwischen Nur-Lese- und Schreibzugriff.
 */
export default function FirecallShareDialog({
  firecallId,
  onClose,
}: FirecallShareDialogProps) {
  const t = useTranslations('firecallShare');
  const tCommon = useTranslations('common');
  const [name, setName] = useState('');
  const [access, setAccess] = useState<AccessLevel>('read');
  const [nameError, setNameError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [createdFor, setCreatedFor] = useState<{
    name: string;
    access: AccessLevel;
  }>();

  const copyLink = useCallback(async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      return true;
    } catch {
      return false;
    }
  }, []);

  const createLink = useCallback(async () => {
    const guestName = normalizeGuestName(name);
    if (!guestName) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setError(undefined);
    setCreating(true);
    try {
      const canWrite = access === 'write';
      const result = await createCustomFirebaseTokenForFirecall(firecallId, {
        name: guestName,
        canWrite,
      });
      if (!result.token) {
        setError(t('error', { error: result.error ?? '' }));
        return;
      }
      const shareLink = `${window.location.origin}/einsatz/${firecallId}?token=${result.token}`;
      setLink(shareLink);
      setCreatedFor({ name: guestName, access });
      setCopied(await copyLink(shareLink));
    } catch (err: any) {
      setError(t('error', { error: err?.message ?? '' }));
    } finally {
      setCreating(false);
    }
  }, [access, copyLink, firecallId, name, t]);

  const reset = useCallback(() => {
    setLink(undefined);
    setCreatedFor(undefined);
    setCopied(false);
    setError(undefined);
    setName('');
    setAccess('read');
  }, []);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        {!link && (
          <>
            <DialogContentText sx={{ mb: 2 }}>{t('intro')}</DialogContentText>
            <TextField
              label={t('nameLabel')}
              helperText={nameError ? t('nameRequired') : t('nameHelper')}
              error={nameError}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createLink();
              }}
              autoFocus
              fullWidth
              required
              sx={{ mb: 2 }}
            />
            <FormControl>
              <FormLabel id="firecall-share-access">
                {t('accessLabel')}
              </FormLabel>
              <RadioGroup
                aria-labelledby="firecall-share-access"
                value={access}
                onChange={(e) => setAccess(e.target.value as AccessLevel)}
              >
                <FormControlLabel
                  value="read"
                  control={<Radio />}
                  label={
                    <>
                      {t('accessRead')}
                      <Typography variant="body2" color="text.secondary">
                        {t('accessReadHint')}
                      </Typography>
                    </>
                  }
                />
                <FormControlLabel
                  value="write"
                  control={<Radio />}
                  label={
                    <>
                      {t('accessWrite')}
                      <Typography variant="body2" color="text.secondary">
                        {t('accessWriteHint')}
                      </Typography>
                    </>
                  }
                />
              </RadioGroup>
            </FormControl>
          </>
        )}

        {link && (
          <>
            {createdFor && (
              <DialogContentText sx={{ mb: 1 }}>
                {t('createdFor', {
                  name: createdFor.name,
                  access:
                    createdFor.access === 'write'
                      ? t('accessWrite')
                      : t('accessRead'),
                })}
              </DialogContentText>
            )}
            <Alert severity={copied ? 'success' : 'info'} sx={{ mb: 2 }}>
              {copied ? t('copied') : t('copyFallback')}
            </Alert>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {/* Der Link ist bewusst vollständig sichtbar: er muss auch dann
                  weitergegeben werden können, wenn das Kopieren scheitert. */}
              <Link
                href={link}
                target="_blank"
                rel="noopener"
                sx={{ overflowWrap: 'anywhere' }}
              >
                {link}
              </Link>
              <Tooltip title={t('copy')}>
                <IconButton
                  aria-label={t('copy')}
                  onClick={async () => setCopied(await copyLink(link))}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        {link ? (
          <Button onClick={reset}>{t('createAnother')}</Button>
        ) : (
          <Button
            onClick={createLink}
            variant="contained"
            disabled={creating}
            startIcon={
              creating ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {t('create')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
