'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import LinkOffIcon from '@mui/icons-material/LinkOff';
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
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  deleteMcpClient,
  getMcpClients,
  getMcpGrants,
  revokeMcpGrant,
  type AdminClient,
} from '../../app/admin/mcp/actions';
import type { AdminGrant } from '../../server/oauth/store';

type PendingAction =
  | { kind: 'deleteClient'; client: AdminClient }
  | { kind: 'revokeGrant'; grant: AdminGrant };

/**
 * Admin-Übersicht des MCP-Zugangs: registrierte Anwendungen und aktive
 * Zugänge.
 *
 * Dynamic Client Registration ist ein offener Endpunkt — ohne diese Ansicht
 * ließe sich nicht feststellen, wer sich dort registriert hat.
 */
export default function AdminMcpOverview() {
  const t = useTranslations('adminMcp');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [clients, setClients] = useState<AdminClient[]>();
  const [grants, setGrants] = useState<AdminGrant[]>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingAction>();
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [loadedClients, loadedGrants] = await Promise.all([
        getMcpClients(),
        getMcpGrants(),
      ]);
      setClients(loadedClients);
      setGrants(loadedGrants);
    } catch (err) {
      setError(t('error', { message: (err as Error).message }));
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'deleteClient') {
        await deleteMcpClient(pending.client.client_id);
      } else {
        await revokeMcpGrant(pending.grant.userId, pending.grant.clientId);
      }
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
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : t('never');

  if (clients === undefined || grants === undefined) {
    return (
      <Stack direction="row" spacing={1} sx={{ my: 3, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography variant="body2">{t('loading')}</Typography>
      </Stack>
    );
  }

  return (
    <Box>
      <Typography variant="body1" gutterBottom>
        {t('description')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ my: 2 }} onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}

      <Typography variant="h5" sx={{ mt: 3, mb: 1 }}>
        {t('clientsTitle')}
      </Typography>
      {clients.length === 0 ? (
        <Alert severity="info">{t('noClients')}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('clientName')}</TableCell>
                <TableCell>{t('clientId')}</TableCell>
                <TableCell>{t('source')}</TableCell>
                <TableCell>{t('registeredAt')}</TableCell>
                <TableCell>{t('redirectUris')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.client_id}>
                  <TableCell>{client.client_name || '—'}</TableCell>
                  <TableCell sx={{ wordBreak: 'break-all' }}>
                    {client.client_id}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={
                        client.source === 'cimd'
                          ? t('sourceCimd')
                          : t('sourceDcr')
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {formatDate(
                      new Date(client.client_id_issued_at * 1000).toISOString(),
                    )}
                  </TableCell>
                  <TableCell sx={{ wordBreak: 'break-all' }}>
                    {client.redirect_uris.join(', ')}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => setPending({ kind: 'deleteClient', client })}
                    >
                      {t('deleteClient')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="h5" sx={{ mt: 4, mb: 1 }}>
        {t('grantsTitle')}
      </Typography>
      {grants.length === 0 ? (
        <Alert severity="info">{t('noGrants')}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('user')}</TableCell>
                <TableCell>{t('clientName')}</TableCell>
                <TableCell>{t('scopes')}</TableCell>
                <TableCell>{t('activeTokens')}</TableCell>
                <TableCell>{t('lastUsed')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {grants.map((grant) => (
                <TableRow key={`${grant.userId}:${grant.clientId}`}>
                  <TableCell sx={{ wordBreak: 'break-all' }}>
                    {grant.userId}
                  </TableCell>
                  <TableCell sx={{ wordBreak: 'break-all' }}>
                    {grant.clientName || grant.clientId}
                  </TableCell>
                  <TableCell>{grant.scopes.join(' ')}</TableCell>
                  <TableCell>{grant.activeTokens}</TableCell>
                  <TableCell>{formatDate(grant.lastUsedAt)}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<LinkOffIcon />}
                      onClick={() => setPending({ kind: 'revokeGrant', grant })}
                    >
                      {t('revokeGrant')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!pending} onClose={() => !busy && setPending(undefined)}>
        <DialogTitle>
          {pending?.kind === 'deleteClient'
            ? t('deleteClient')
            : t('revokeGrant')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.kind === 'deleteClient'
              ? t('deleteClientConfirm', {
                  client:
                    pending.client.client_name || pending.client.client_id,
                })
              : pending
                ? t('revokeGrantConfirm', {
                    client: pending.grant.clientName || pending.grant.clientId,
                    user: pending.grant.userId,
                  })
                : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPending(undefined)}>
            {tCommon('cancel')}
          </Button>
          <Button color="error" disabled={busy} onClick={confirm}>
            {pending?.kind === 'deleteClient'
              ? t('deleteClient')
              : t('revokeGrant')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
