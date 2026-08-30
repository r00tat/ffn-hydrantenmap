'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  buildFuellungRechnungMail,
  sendFuellungRechnung,
} from './rechnungActions';

export interface RechnungMailDialogProps {
  open: boolean;
  groupId: string;
  rechnungId: string;
  onClose: () => void;
  onSent: () => void;
}

export default function RechnungMailDialog({
  open,
  groupId,
  rechnungId,
  onClose,
  onSent,
}: RechnungMailDialogProps) {
  const t = useTranslations('atemschutz');
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const result = await buildFuellungRechnungMail({ groupId, rechnungId });
      if (!aktiv) return;
      if (!result.success) {
        setFehler(result.error ?? 'saveFailed');
      } else {
        setTo(result.to ?? '');
        setCc((result.cc ?? []).join(', '));
        setSubject(result.subject ?? '');
        setBody(result.body ?? '');
      }
      setLaedt(false);
    })();
    return () => {
      aktiv = false;
    };
  }, [groupId, rechnungId]);

  const handleSend = async () => {
    setSendet(true);
    setFehler(undefined);
    const result = await sendFuellungRechnung({
      groupId,
      rechnungId,
      to,
      cc: cc
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      subject,
      body,
    });
    setSendet(false);
    if (result.success) {
      onSent();
      onClose();
      return;
    }
    setFehler(result.error ?? 'saveFailed');
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('rechnung.mailTitle')}</DialogTitle>
      <DialogContent>
        {laedt ? (
          <Stack sx={{ alignItems: 'center', py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {fehler && <Alert severity="error">{t(`errors.${fehler}` as 'errors.saveFailed')}</Alert>}
            <TextField
              label={t('rechnung.mailTo')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label={t('rechnung.mailCc')}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              fullWidth
              helperText={t('rechnung.mailCcHelp')}
            />
            <TextField
              label={t('rechnung.mailSubject')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label={t('rechnung.mailBody')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              minRows={8}
              required
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rechnung.cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={laedt || sendet || !to || !subject || !body}
        >
          {t('rechnung.send')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
