'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FAHRTENBUCH_MANGEL_EMAILS_MAX } from '../../../common/fahrtenbuch';
import {
  getFahrtenbuchMangelEmails,
  saveFahrtenbuchMangelEmails,
} from '../stammdatenActions';

/**
 * Empfänger der Mangel-Benachrichtigung einer Gruppe.
 *
 * Geladen über eine Server Action und nicht über einen Firestore-Snapshot: Die
 * Collection `fahrtenbuchConfig` ist für Clients gesperrt, damit nicht jedes
 * Gruppenmitglied die Adresse des Fahrzeugverantwortlichen auslesen kann.
 */
export default function MangelNotificationSettings({
  groupId,
}: {
  groupId: string;
}) {
  const t = useTranslations('fahrtenbuch');
  const [emails, setEmails] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getFahrtenbuchMangelEmails(groupId);
        if (!active) return;
        if (!result.success) {
          // Bewusst kein `setLoaded(true)`: Mit einem leeren Formular und
          // freigeschaltetem Speichern-Knopf würde ein Klick die tatsächlich
          // gepflegten Empfänger löschen.
          setFeedback({
            severity: 'error',
            text: t('admin.mangelEmailsLoadFailed', {
              message: result.error ?? '',
            }),
          });
          return;
        }
        setEmails(result.emails);
        setLoaded(true);
      } catch (err) {
        if (!active) return;
        setFeedback({
          severity: 'error',
          text: t('admin.mangelEmailsLoadFailed', {
            message: (err as Error).message,
          }),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId, t]);

  const saveErrorText = (error?: string): string => {
    if (error === 'emailInvalid') return t('admin.mangelEmailInvalid');
    if (error === 'tooManyEmails') {
      return t('admin.mangelEmailsTooMany', {
        max: FAHRTENBUCH_MANGEL_EMAILS_MAX,
      });
    }
    return t('admin.mangelEmailsSaveFailed', { message: error ?? '' });
  };

  const save = async () => {
    setSaving(true);
    setFeedback(undefined);
    try {
      const result = await saveFahrtenbuchMangelEmails(groupId, emails);
      if (!result.success) {
        setFeedback({ severity: 'error', text: saveErrorText(result.error) });
        return;
      }
      setFeedback({ severity: 'success', text: t('admin.mangelEmailsSaved') });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: saveErrorText((err as Error).message),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('admin.mangelEmails')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.mangelEmailsHint')}
      </Typography>

      {feedback && (
        <Alert
          severity={feedback.severity}
          sx={{ mb: 2 }}
          onClose={() => setFeedback(undefined)}
        >
          {feedback.text}
        </Alert>
      )}

      {/* `freeSolo`, weil es keine Vorschlagsliste gibt — die Adressen tippt
          die Verwalterin ein. Jeder Eintrag wird ein Chip und ist damit
          einzeln wieder entfernbar. */}
      <Autocomplete
        multiple
        freeSolo
        options={[]}
        value={emails}
        onChange={(_event, value) => setEmails(value as string[])}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('admin.mangelEmailsLabel')}
            placeholder={t('admin.mangelEmailsPlaceholder')}
            helperText={t('admin.mangelEmailsHelper')}
          />
        )}
      />

      <Stack direction="row" sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={saving || !loaded}>
          {t('save')}
        </Button>
      </Stack>
    </Paper>
  );
}
