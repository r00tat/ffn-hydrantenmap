'use client';

import { useCallback, useState } from 'react';
import SaveIcon from '@mui/icons-material/Save';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type BugReportConfig } from '../../../common/bugReport';
import { useSnackbar } from '../../../components/providers/SnackbarProvider';
import { updateBugReportConfigAction } from './bugReportAdminActions';

interface BugReportConfigSectionProps {
  initialConfig: BugReportConfig;
}

export default function BugReportConfigSection({
  initialConfig,
}: BugReportConfigSectionProps) {
  const showSnackbar = useSnackbar();
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [emails, setEmails] = useState<string[]>(
    initialConfig.recipientEmails ?? [],
  );
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const cleaned = emails
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      await updateBugReportConfigAction({
        enabled,
        recipientEmails: cleaned,
      });
      setEmails(cleaned);
      showSnackbar('Konfiguration gespeichert', 'success');
    } catch (err) {
      showSnackbar(
        `Speichern fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setSaving(false);
    }
  }, [emails, enabled, showSnackbar]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Notification-Konfiguration
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          }
          label="Notifications aktiviert"
        />

        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={emails}
          onChange={(_event, value) => setEmails(value as string[])}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Empfänger E-Mails"
              placeholder="E-Mail eingeben und Enter drücken"
              helperText="Mehrere Adressen möglich. Erste Adresse wird als To verwendet, weitere als Cc."
            />
          )}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={
              saving ? <CircularProgress size={16} /> : <SaveIcon />
            }
            onClick={handleSave}
            disabled={saving}
          >
            Speichern
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
