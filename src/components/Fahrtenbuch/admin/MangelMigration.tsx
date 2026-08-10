'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { migrateDefectsToMangel } from '../mangelActions';

/**
 * Übernahme der Defekte aus bestehenden Fahrten in die Mängelverwaltung.
 *
 * Ein Knopf und kein automatischer Lauf beim Start: Die Übernahme schreibt
 * einen Datensatz je gemeldetem Defekt und soll unter Aufsicht laufen. Sie ist
 * idempotent, ein zweiter Klick erzeugt also keine Duplikate.
 */
export default function MangelMigration({ groupId }: { groupId: string }) {
  const t = useTranslations('fahrtenbuch.maengel.migrate');
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();

  const run = async () => {
    setRunning(true);
    setFeedback(undefined);
    try {
      const result = await migrateDefectsToMangel(groupId);
      if (!result.success) {
        setFeedback({
          severity: 'error',
          text: t('failed', { message: result.error ?? '' }),
        });
        return;
      }
      setFeedback({
        severity: 'success',
        text: t('result', {
          created: result.created,
          skipped: result.skipped,
        }),
      });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: t('failed', { message: (err as Error).message }),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 480 }}>
      <Typography variant="h6" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('description')}
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

      <Stack direction="row">
        <Button variant="contained" onClick={run} disabled={running}>
          {running ? t('running') : t('button')}
        </Button>
      </Stack>
    </Paper>
  );
}
