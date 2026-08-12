'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  browserSupportsWebAuthn,
  startRegistration,
} from '@simplewebauthn/browser';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  deletePasskey,
  finishPasskeyRegistration,
  listPasskeys,
  renamePasskey,
  startPasskeyRegistration,
} from '../../app/actions/passkey';
import { MAX_PASSKEY_LABEL_LENGTH, PasskeyInfo } from '../../common/passkey';

/** Ein vom Nutzer wiedererkennbarer Vorschlag für die Bezeichnung. */
function suggestLabel(): string {
  if (typeof navigator === 'undefined') return 'Passkey';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Passkey';
}

export default function PasskeyManager() {
  const t = useTranslations('passkey');
  const format = useFormatter();

  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [supported, setSupported] = useState<boolean | undefined>();
  const [currentDomain, setCurrentDomain] = useState('');
  const [toDelete, setToDelete] = useState<PasskeyInfo | undefined>();
  const [toRename, setToRename] = useState<PasskeyInfo | undefined>();
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    // `browserSupportsWebAuthn()` und `location` gibt es nur im Client, deshalb
    // erst nach dem Mount — sonst weicht das Server-Markup vom Client ab.
    setSupported(browserSupportsWebAuthn());
    setCurrentDomain(window.location.hostname);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPasskeys(await listPasskeys());
    } catch (err) {
      console.error('failed to load passkeys', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAdd = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { options, challengeToken } = await startPasskeyRegistration();
      const response = await startRegistration({ optionsJSON: options });
      await finishPasskeyRegistration(challengeToken, response, suggestLabel());
      await reload();
    } catch (err) {
      // Abbruch im Systemdialog ist kein Fehler, der gemeldet werden muss.
      if ((err as Error)?.name !== 'NotAllowedError') {
        console.error('passkey registration failed', err);
        setError(t('addFailed'));
      }
    } finally {
      setBusy(false);
    }
  }, [reload, t]);

  const onConfirmDelete = useCallback(async () => {
    if (!toDelete) return;
    setBusy(true);
    setError(undefined);
    try {
      await deletePasskey(toDelete.id);
      setToDelete(undefined);
      await reload();
    } catch (err) {
      console.error('passkey deletion failed', err);
      setError(t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }, [reload, t, toDelete]);

  const onConfirmRename = useCallback(async () => {
    if (!toRename || !renameValue.trim()) return;
    setBusy(true);
    try {
      await renamePasskey(toRename.id, renameValue.trim());
      setToRename(undefined);
      await reload();
    } catch (err) {
      console.error('passkey rename failed', err);
    } finally {
      setBusy(false);
    }
  }, [reload, renameValue, toRename]);

  function formatDate(value: string) {
    return format.dateTime(new Date(value), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('description')}
      </Typography>

      {supported === false && <Alert severity="info">{t('notSupported')}</Alert>}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress size={24} sx={{ mt: 2 }} />
      ) : passkeys.length === 0 ? (
        <Typography variant="body2" sx={{ mt: 2 }}>
          {t('none')}
        </Typography>
      ) : (
        <List dense>
          {passkeys.map((passkey) => {
            // Passkeys anderer Domains bleiben sichtbar und löschbar — sonst
            // könnte man einen auf der Dev-Domain angelegten Passkey aus der
            // Produktion nie mehr entfernen.
            const foreign = !!currentDomain && passkey.rpId !== currentDomain;
            return (
              <ListItem
                key={passkey.id}
                sx={foreign ? { opacity: 0.6 } : undefined}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={t('rename')}>
                      <span>
                        <IconButton
                          aria-label={t('rename')}
                          disabled={busy}
                          onClick={() => {
                            setToRename(passkey);
                            setRenameValue(passkey.label);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t('delete')}>
                      <span>
                        <IconButton
                          aria-label={t('delete')}
                          disabled={busy}
                          onClick={() => setToDelete(passkey)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemIcon>
                  <KeyIcon />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <span>{passkey.label}</span>
                      <Chip size="small" label={passkey.rpId} />
                      {foreign && (
                        <Typography variant="caption" color="warning.main">
                          {t('otherDomain', { domain: passkey.rpId })}
                        </Typography>
                      )}
                    </Stack>
                  }
                  secondary={`${t('created', {
                    date: formatDate(passkey.createdAt),
                  })} · ${
                    passkey.lastUsedAt
                      ? t('lastUsed', { date: formatDate(passkey.lastUsedAt) })
                      : t('neverUsed')
                  }`}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {supported && (
        <Button
          variant="outlined"
          startIcon={busy ? <CircularProgress size={18} /> : <AddIcon />}
          disabled={busy}
          onClick={() => onAdd()}
          sx={{ mt: 1 }}
        >
          {t('add')}
        </Button>
      )}

      <Dialog open={!!toDelete} onClose={() => setToDelete(undefined)}>
        <DialogTitle>{t('delete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('deleteConfirm', { label: toDelete?.label ?? '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(undefined)}>{t('cancel')}</Button>
          <Button color="error" disabled={busy} onClick={() => onConfirmDelete()}>
            {t('delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!toRename} onClose={() => setToRename(undefined)}>
        <DialogTitle>{t('renameTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={t('labelField')}
            value={renameValue}
            slotProps={{ htmlInput: { maxLength: MAX_PASSKEY_LABEL_LENGTH } }}
            onChange={(event) => setRenameValue(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToRename(undefined)}>{t('cancel')}</Button>
          <Button
            disabled={busy || !renameValue.trim()}
            onClick={() => onConfirmRename()}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
