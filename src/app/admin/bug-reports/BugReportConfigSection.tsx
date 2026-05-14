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
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('bugReport');
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
      showSnackbar(t('configSaved'), 'success');
    } catch (err) {
      showSnackbar(
        `${t('configSaveFailed')}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setSaving(false);
    }
  }, [emails, enabled, showSnackbar, t]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t('configHeader')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          }
          label={t('notificationsEnabled')}
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
              label={t('recipientEmails')}
              placeholder={t('emailPlaceholder')}
              helperText={t('emailHelper')}
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
            {t('save')}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
