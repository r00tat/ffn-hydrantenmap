'use client';

import DeleteIcon from '@mui/icons-material/LinkOff';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getConnectedApplications,
  revokeConnectedApplication,
} from '../../app/verbundene-anwendungen/actions';
import type { ConnectedApplication } from '../../server/oauth/store';
import { MCP_SCOPE_LABEL_KEYS } from './scopeLabels';

/**
 * „Verbundene Anwendungen" — die Selbstverwaltung des MCP-Zugangs.
 *
 * Grundlage ist die Einwilligung und nicht das Token: Ein Zugang bleibt auch
 * dann sichtbar, wenn gerade kein Refresh Token gültig ist. Sonst verschwände
 * der Eintrag genau dann aus der Liste, wenn jemand ihn widerrufen will.
 */
export default function ConnectedApplications() {
  const t = useTranslations('connectedApps');
  const tConsent = useTranslations('oauthConsent');
  const format = useFormatter();

  const [apps, setApps] = useState<ConnectedApplication[]>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<ConnectedApplication>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setApps(await getConnectedApplications());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const revoke = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await revokeConnectedApplication(pending.clientId);
      setNotice(t('revoked'));
      setPending(undefined);
      await reload();
    } catch (err) {
      setError(t('error', { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (value?: string) =>
    value
      ? format.dateTime(new Date(value), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : t('never');

  return (
    <Box>
      <Typography variant="body1" gutterBottom>
        {t('description')}
      </Typography>
      <Link component={NextLink} href="/docs/mcp" variant="body2">
        {t('docsLink')}
      </Link>

      {error && (
        <Alert severity="error" sx={{ my: 2 }} onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ my: 2 }} onClose={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}

      {apps === undefined && (
        <Stack direction="row" spacing={1} sx={{ my: 3, alignItems: 'center' }}>
          <CircularProgress size={20} />
          <Typography variant="body2">{t('loading')}</Typography>
        </Stack>
      )}

      {apps?.length === 0 && (
        <Alert severity="info" sx={{ my: 2 }}>
          {t('empty')}
        </Alert>
      )}

      <Stack spacing={2} sx={{ mt: 2 }}>
        {apps?.map((app) => (
          <Card key={app.clientId} variant="outlined">
            <CardContent>
              <Typography variant="h6">
                {app.clientName || app.clientId}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {app.clientId}
              </Typography>

              <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                {t('scopes')}:{' '}
                {app.scopes.map((scope) => (
                  <Chip
                    key={scope}
                    size="small"
                    sx={{ mr: 0.5, mb: 0.5 }}
                    label={
                      MCP_SCOPE_LABEL_KEYS[
                        scope as keyof typeof MCP_SCOPE_LABEL_KEYS
                      ]
                        ? tConsent(
                            MCP_SCOPE_LABEL_KEYS[
                              scope as keyof typeof MCP_SCOPE_LABEL_KEYS
                            ],
                          )
                        : scope
                    }
                  />
                ))}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {t('grantedAt')}: {formatDate(app.grantedAt)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('lastUsed')}: {formatDate(app.lastUsedAt)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('activeTokens', { count: app.activeTokens })}
              </Typography>

              <Button
                color="error"
                startIcon={<DeleteIcon />}
                sx={{ mt: 1 }}
                onClick={() => setPending(app)}
              >
                {t('revoke')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!pending} onClose={() => !busy && setPending(undefined)}>
        <DialogTitle>{t('revokeConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('revokeConfirmText', {
              client: pending?.clientName || pending?.clientId || '',
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPending(undefined)}>
            {tConsent('deny')}
          </Button>
          <Button color="error" disabled={busy} onClick={revoke}>
            {t('revoke')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
