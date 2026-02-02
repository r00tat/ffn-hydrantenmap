'use client';

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import {
  buildTemplateContext,
  isValidEmail,
  renderEmailTemplates,
  SendEmailRequest,
} from '../../common/kostenersatzEmail';
import { sendKostenersatzEmailAction } from './kostenersatzEmailAction';
import { useKostenersatzEmailConfig } from '../../hooks/useKostenersatzEmailConfig';
import { Firecall } from '../firebase/firestore';

export interface KostenersatzEmailDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  firecallId: string;
}

export default function KostenersatzEmailDialog({
  open,
  onClose,
  onSuccess,
  calculation,
  firecall,
  firecallId,
}: KostenersatzEmailDialogProps) {
  const { config, loading: configLoading } = useKostenersatzEmailConfig();

  // Form state
  const [to, setTo] = useState('');
  const [ccList, setCcList] = useState<string[]>([]);
  const [newCc, setNewCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // UI state
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when dialog opens or config loads
  useEffect(() => {
    if (open && config && !configLoading) {
      // Build template context
      const context = buildTemplateContext(calculation, firecall);

      // Render templates
      const { subject: renderedSubject, body: renderedBody } = renderEmailTemplates(config, context);

      // Set form values
      setTo(calculation.recipient.email || '');
      setCcList(config.ccEmail ? [config.ccEmail] : []);
      setNewCc('');
      setSubject(renderedSubject);
      setBody(renderedBody);
      setError(null);
    }
  }, [open, config, configLoading, calculation, firecall]);

  // Add CC address
  const handleAddCc = useCallback(() => {
    const trimmedCc = newCc.trim();
    if (trimmedCc && isValidEmail(trimmedCc) && !ccList.includes(trimmedCc)) {
      setCcList((prev) => [...prev, trimmedCc]);
      setNewCc('');
    }
  }, [newCc, ccList]);

  // Remove CC address
  const handleRemoveCc = useCallback((emailToRemove: string) => {
    setCcList((prev) => prev.filter((email) => email !== emailToRemove));
  }, []);

  // Handle CC input keypress (add on Enter)
  const handleCcKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCc();
      }
    },
    [handleAddCc]
  );

  // Validate form
  const isValid = useCallback(() => {
    if (!to || !isValidEmail(to)) return false;
    if (!subject.trim()) return false;
    if (!body.trim()) return false;
    return true;
  }, [to, subject, body]);

  // Send email
  const handleSend = useCallback(async () => {
    if (!isValid()) return;

    setSending(true);
    setError(null);

    try {
      const requestBody: SendEmailRequest = {
        firecallId,
        calculationId: calculation.id!,
        to,
        cc: ccList,
        subject,
        body,
      };

      const result = await sendKostenersatzEmailAction(requestBody);

      if (!result.success) {
        throw new Error(result.details || result.error || 'Failed to send email');
      }

      // Success
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error sending email:', err);
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }, [isValid, firecallId, calculation.id, to, ccList, subject, body, onSuccess, onClose]);

  return (
    <Dialog
      open={open}
      onClose={sending ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '60vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">E-Mail senden</Typography>
          <IconButton onClick={onClose} disabled={sending} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {configLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* From (read-only) */}
            <TextField
              label="Von"
              value={config.fromEmail}
              disabled
              fullWidth
              size="small"
              slotProps={{
                input: {
                  readOnly: true,
                },
              }}
            />

            {/* To */}
            <TextField
              label="An"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              fullWidth
              size="small"
              required
              error={to !== '' && !isValidEmail(to)}
              helperText={to !== '' && !isValidEmail(to) ? 'Ungültige E-Mail-Adresse' : ''}
              disabled={sending}
            />

            {/* CC */}
            <Box>
              <TextField
                label="CC"
                value={newCc}
                onChange={(e) => setNewCc(e.target.value)}
                onKeyPress={handleCcKeyPress}
                fullWidth
                size="small"
                disabled={sending}
                placeholder="E-Mail-Adresse hinzufügen..."
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={handleAddCc}
                          disabled={!newCc.trim() || !isValidEmail(newCc.trim()) || sending}
                          size="small"
                        >
                          <AddIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {ccList.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {ccList.map((email) => (
                    <Chip
                      key={email}
                      label={email}
                      size="small"
                      onDelete={sending ? undefined : () => handleRemoveCc(email)}
                    />
                  ))}
                </Box>
              )}
            </Box>

            {/* Subject */}
            <TextField
              label="Betreff"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              size="small"
              required
              error={subject === ''}
              disabled={sending}
            />

            {/* Body */}
            <TextField
              label="Nachricht"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              rows={12}
              required
              error={body === ''}
              disabled={sending}
            />

            <Typography variant="caption" color="text.secondary">
              Die PDF-Rechnung wird automatisch als Anhang beigefügt.
            </Typography>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={sending} color="inherit">
          Abbrechen
        </Button>
        <Button
          onClick={handleSend}
          disabled={sending || !isValid() || configLoading}
          variant="contained"
          startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
        >
          {sending ? 'Wird gesendet...' : 'Senden'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
