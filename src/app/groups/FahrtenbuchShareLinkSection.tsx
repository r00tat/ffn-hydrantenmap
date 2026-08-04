'use client';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import type { ShareLinkInfo } from '../../common/fahrtenbuchShare';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import { NON_TENANT_GROUP_IDS } from './groupTypes';
import {
  createFahrtenbuchShareLink,
  getFahrtenbuchShareLink,
  revokeFahrtenbuchShareLink,
} from './shareLinkActions';

export interface FahrtenbuchShareLinkSectionProps {
  groupId: string;
}

type PendingAction = 'regenerate' | 'revoke';

/** Wie lange „Link kopiert“ im Tooltip stehen bleibt. */
const COPIED_RESET_MS = 3000;

/**
 * Erzeugt und zeigt den Fahrtenbuch-Share-Link einer Gruppe. Die Aktionen
 * wirken sofort und nicht erst beim „Aktualisieren“ des Gruppen-Dialogs — ein
 * Widerruf, der erst beim Speichern greift, wäre eine Falle.
 */
export default function FahrtenbuchShareLinkSection({
  groupId,
}: FahrtenbuchShareLinkSectionProps) {
  const t = useTranslations('groups.shareLink');
  const format = useFormatter();
  const [link, setLink] = useState<ShareLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pending, setPending] = useState<PendingAction>();

  // Eine Berechtigungsgruppe wie `kostenersatz` ist kein Fahrtenbuch-Mandant;
  // die Server Actions lehnen sie ohnehin ab.
  const isTenant = !!groupId && !NON_TENANT_GROUP_IDS.includes(groupId);

  /**
   * Ein Ladefehler darf nicht wie „kein Link vorhanden“ aussehen: Wer daraufhin
   * „Link erstellen“ klickt, widerruft den in Wahrheit existierenden Link und
   * macht jeden bereits am Fahrzeug klebenden QR-Code tot. Deshalb ein eigener
   * Fehlerzustand statt eines stillen `null`.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setLink(await getFahrtenbuchShareLink(groupId));
    } catch (err) {
      console.error('Failed to load Fahrtenbuch share link:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!isTenant) return;
    load();
  }, [isTenant, load]);

  // „Link kopiert“ ist eine Quittung, kein Dauerzustand.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (err) {
      console.error('Fahrtenbuch share link action failed:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const create = () =>
    run(async () => setLink(await createFahrtenbuchShareLink(groupId)));

  const revoke = () =>
    run(async () => {
      await revokeFahrtenbuchShareLink(groupId);
      setLink(null);
    });

  if (!isTenant) return null;

  return (
    <>
      <Divider sx={{ mt: 3, mb: 1 }} />
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {t('heading')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('description')}
      </Typography>

      {failed && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {t('failed')}
        </Alert>
      )}

      {loading ? (
        <CircularProgress size={20} />
      ) : loadFailed ? (
        <Alert
          severity="error"
          sx={{ mb: 1 }}
          action={
            <Button color="inherit" size="small" onClick={load}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : !link ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('none')}
          </Typography>
          {/* Tooltip-freier Button: ein disabled Button feuert keine Events und
              bräuchte sonst einen span-Wrapper. */}
          <Button
            variant="outlined"
            size="small"
            disabled={busy}
            onClick={create}
          >
            {t('create')}
          </Button>
        </>
      ) : (
        <>
          <Alert severity="warning" sx={{ mb: 1 }}>
            {t('warning')}
          </Alert>
          <TextField
            fullWidth
            margin="dense"
            variant="standard"
            label={t('heading')}
            value={link.url}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={copied ? t('copied') : t('copy')}>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={async () => {
                          try {
                            // Ohne Secure Context — etwa über
                            // `http://<lan-ip>:3000` im Feuerwehrhaus — ist
                            // `navigator.clipboard` schlicht undefined. Ein
                            // `?.` allein meldete hier stillen Erfolg.
                            if (!navigator.clipboard) {
                              throw new Error('clipboard API unavailable');
                            }
                            await navigator.clipboard.writeText(link.url);
                            setCopyFailed(false);
                            setCopied(true);
                          } catch (err) {
                            console.error('Failed to copy share link:', err);
                            setCopied(false);
                            setCopyFailed(true);
                          }
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          {copyFailed && (
            // Das Feld ist readOnly, nicht disabled — von Hand markieren geht.
            <Alert severity="info" sx={{ mt: 1 }}>
              {t('copyFailed')}
            </Alert>
          )}
          <Typography variant="caption" color="text.secondary">
            {t('createdBy', {
              date: format.dateTime(new Date(link.createdAt), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
              name: link.createdByName || '—',
            })}
          </Typography>
          {/* Weißer Grund: ein QR-Code auf dunklem Hintergrund ist im Dark Mode
              für Scanner unbrauchbar. `level="M"` und eine volle Quiet Zone von
              4 Modulen, weil der Ausdruck am Fahrzeug Sonne, Schmutz und Knicke
              abbekommt — die Defaults von qrcode.react (`L`, `marginSize=0`)
              sind dafür die schwächste Stufe. */}
          <Box
            sx={{
              p: 2,
              mt: 1,
              bgcolor: 'white',
              borderRadius: 1,
              width: 'fit-content',
            }}
          >
            <QRCodeSVG
              value={link.url}
              size={200}
              level="M"
              marginSize={4}
              title={t('heading')}
            />
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              disabled={busy}
              onClick={() => setPending('regenerate')}
            >
              {t('regenerate')}
            </Button>
            <Button
              size="small"
              color="error"
              disabled={busy}
              onClick={() => setPending('revoke')}
            >
              {t('revoke')}
            </Button>
          </Stack>
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === 'revoke' ? t('revokeTitle') : t('regenerateTitle')}
          text={
            pending === 'revoke' ? t('revokeConfirm') : t('regenerateConfirm')
          }
          onConfirm={(confirmed) => {
            const action = pending;
            setPending(undefined);
            if (!confirmed) return;
            if (action === 'revoke') revoke();
            else create();
          }}
        />
      )}
    </>
  );
}
