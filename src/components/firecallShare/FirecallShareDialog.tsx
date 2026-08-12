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
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { FirecallShareLink } from '../../common/firecallShareLink';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallShareLinkForm, {
  type FirecallShareLinkFormValues,
} from './FirecallShareLinkForm';
import FirecallShareLinkList from './FirecallShareLinkList';
import useFirecallShareLinks from './useFirecallShareLinks';

export interface FirecallShareDialogProps {
  firecallId: string;
  onClose: () => void;
}

/** `list` zeigt die Übersicht, `create`/`edit` das Formular. */
type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; link: FirecallShareLink };

/**
 * Verwaltet die Zugänge eines Einsatzes: bestehende Links mit Zugriff, Ablauf
 * und Status, dazu Anlegen, Bearbeiten, Deaktivieren und erneutes Kopieren.
 *
 * Nur Benutzer mit Gruppenzugriff kommen hier weiter — die Server Actions
 * weisen Einsatz-Gäste ab, damit ein weitergegebener Link keine weiteren
 * Zugänge nach sich ziehen kann.
 */
export default function FirecallShareDialog({
  firecallId,
  onClose,
}: FirecallShareDialogProps) {
  const t = useTranslations('firecallShare');
  const tCommon = useTranslations('common');
  const { links, loading, loadFailed, busy, reload, create, update, issueUrl } =
    useFirecallShareLinks(firecallId);

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [values, setValues] = useState<FirecallShareLinkFormValues>();
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingDeactivation, setPendingDeactivation] =
    useState<FirecallShareLink>();

  const copyLink = useCallback(async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      return true;
    } catch {
      return false;
    }
  }, []);

  const showLink = useCallback(
    async (value: string) => {
      setLink(value);
      setCopied(await copyLink(value));
    },
    [copyLink]
  );

  const backToList = useCallback(() => {
    setMode({ kind: 'list' });
    setValues(undefined);
    setLink(undefined);
    setCopied(false);
    setError(undefined);
  }, []);

  const submit = useCallback(async () => {
    if (!values) return;
    setError(undefined);
    try {
      if (mode.kind === 'create') {
        await showLink(await create(values));
      } else if (mode.kind === 'edit') {
        await update(mode.link.uid, {
          name: values.name,
          canWrite: values.canWrite,
          expiresAt: values.expiresAt,
        });
        backToList();
      }
    } catch (err: unknown) {
      setError(
        t('updateError', { error: (err as Error)?.message ?? String(err) })
      );
    }
  }, [backToList, create, mode, showLink, t, update, values]);

  const copyExisting = useCallback(
    async (existing: FirecallShareLink) => {
      setError(undefined);
      try {
        await showLink(await issueUrl(existing.uid));
      } catch (err: unknown) {
        setError(
          t('copyError', { error: (err as Error)?.message ?? String(err) })
        );
      }
    },
    [issueUrl, showLink, t]
  );

  const toggleActive = useCallback(
    async (existing: FirecallShareLink, active: boolean) => {
      if (!active) {
        setPendingDeactivation(existing);
        return;
      }
      setError(undefined);
      try {
        await update(existing.uid, { active: true });
      } catch (err: unknown) {
        setError(
          t('updateError', { error: (err as Error)?.message ?? String(err) })
        );
      }
    },
    [t, update]
  );

  const confirmDeactivation = useCallback(
    async (confirmed: boolean) => {
      const target = pendingDeactivation;
      setPendingDeactivation(undefined);
      if (!confirmed || !target) return;
      setError(undefined);
      try {
        await update(target.uid, { active: false });
      } catch (err: unknown) {
        setError(
          t('updateError', { error: (err as Error)?.message ?? String(err) })
        );
      }
    },
    [pendingDeactivation, t, update]
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode.kind === 'edit' && !link ? t('editTitle') : t('title')}
      </DialogTitle>
      <DialogContent>
        {/* Ein erzeugter oder erneut ausgestellter Link verdrängt alles andere:
            er ist das Einzige, was jetzt weitergegeben werden muss. */}
        {link && (
          <>
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

        {!link && mode.kind === 'list' && (
          <>
            <DialogContentText sx={{ mb: 1 }}>{t('intro')}</DialogContentText>
            {loading && <CircularProgress size={24} sx={{ my: 2 }} />}
            {/* Ein Ladefehler darf nicht wie „kein Link vorhanden" aussehen —
                sonst legt jemand einen zweiten Zugang an, obwohl längst einer
                im Umlauf ist. */}
            {!loading && loadFailed && (
              <Alert
                severity="error"
                sx={{ my: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={reload}>
                    {t('retry')}
                  </Button>
                }
              >
                {t('loadError')}
              </Alert>
            )}
            {!loading && !loadFailed && links.length === 0 && (
              <DialogContentText sx={{ my: 2 }}>
                {t('noLinks')}
              </DialogContentText>
            )}
            {!loading && !loadFailed && links.length > 0 && (
              <FirecallShareLinkList
                links={links}
                busy={busy}
                onCopy={copyExisting}
                onEdit={(existing) => setMode({ kind: 'edit', link: existing })}
                onToggleActive={toggleActive}
              />
            )}
          </>
        )}

        {!link && mode.kind !== 'list' && (
          <FirecallShareLinkForm
            link={mode.kind === 'edit' ? mode.link : undefined}
            onChange={setValues}
          />
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        {link && <Button onClick={backToList}>{t('backToList')}</Button>}
        {!link && mode.kind === 'list' && (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => setMode({ kind: 'create' })}
          >
            {t('newLink')}
          </Button>
        )}
        {!link && mode.kind !== 'list' && (
          <>
            <Button onClick={backToList}>{tCommon('cancel')}</Button>
            <Button
              onClick={submit}
              variant="contained"
              disabled={busy || !values}
              startIcon={
                busy ? <CircularProgress size={16} color="inherit" /> : null
              }
            >
              {mode.kind === 'edit' ? tCommon('save') : t('create')}
            </Button>
          </>
        )}
      </DialogActions>

      {pendingDeactivation && (
        <ConfirmDialog
          title={t('deactivateTitle')}
          text={t('deactivateText', { name: pendingDeactivation.name })}
          yes={t('deactivate')}
          no={tCommon('cancel')}
          onConfirm={confirmDeactivation}
        />
      )}
    </Dialog>
  );
}
