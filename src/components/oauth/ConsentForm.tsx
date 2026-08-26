'use client';

import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { McpScope } from '../../common/mcp/scopes';
import {
  approveOauthConsent,
  denyOauthConsent,
} from '../../app/oauth/consent/actions';
import { MCP_SCOPE_LABEL_KEYS } from '../mcp/scopeLabels';

export interface ConsentFormProps {
  query: string;
  clientName: string;
  clientId: string;
  clientUri?: string;
  scopes: McpScope[];
  /** Nur zur Anzeige — die Prüfung läuft serverseitig. */
  redirectHost: string;
  isCimd: boolean;
}

export default function ConsentForm({
  query,
  clientName,
  clientId,
  clientUri,
  scopes,
  redirectHost,
  isCimd,
}: ConsentFormProps) {
  const t = useTranslations('oauthConsent');
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string>();

  const decide = async (decision: 'approve' | 'deny') => {
    setBusy(decision);
    setError(undefined);
    try {
      const { redirectUrl } =
        decision === 'approve'
          ? await approveOauthConsent(query)
          : await denyOauthConsent(query);
      // `window.location` und nicht der Router: Das Ziel liegt bei einer
      // Zustimmung auf einer fremden Origin, dorthin kann Next nicht
      // navigieren.
      window.location.href = redirectUrl;
    } catch (err) {
      setBusy(null);
      setError((err as Error).message);
    }
  };

  const writesData = scopes.includes('einsatz:write');

  return (
    <Paper sx={{ p: 3, maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        {t('title', { client: clientName })}
      </Typography>
      <Typography variant="body1" gutterBottom>
        {t('intro', { client: clientName })}
      </Typography>

      <List dense>
        {scopes.map((scope) => (
          <ListItem key={scope} disableGutters>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <CheckIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText primary={t(MCP_SCOPE_LABEL_KEYS[scope])} />
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      <Alert severity="warning" sx={{ mb: 2 }}>
        {t('privacyWarning')}
      </Alert>

      {writesData && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('writeWarning')}
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" component="div" color="text.secondary">
          {t('redirectTarget')}{' '}
          <Chip size="small" label={redirectHost} sx={{ ml: 0.5 }} />
        </Typography>
        <Typography variant="body2" component="div" color="text.secondary">
          {t('clientIdLabel')}{' '}
          <Chip
            size="small"
            label={clientId}
            sx={{ ml: 0.5, maxWidth: '100%' }}
          />
        </Typography>
        {!isCimd && (
          <Typography variant="body2" color="text.secondary">
            {t('dcrHint')}
          </Typography>
        )}
        {clientUri && (
          <Link
            href={clientUri}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            {clientUri}
            <OpenInNewIcon fontSize="inherit" />
          </Link>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          variant="contained"
          startIcon={
            busy === 'approve' ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CheckIcon />
            )
          }
          disabled={busy !== null}
          onClick={() => decide('approve')}
        >
          {t('approve')}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={
            busy === 'deny' ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CloseIcon />
            )
          }
          disabled={busy !== null}
          onClick={() => decide('deny')}
        >
          {t('deny')}
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {t('revokeHint')}
      </Typography>
    </Paper>
  );
}
