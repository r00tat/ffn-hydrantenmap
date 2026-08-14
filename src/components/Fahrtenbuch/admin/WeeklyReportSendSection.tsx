'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { FAHRTENBUCH_MANGEL_EMAILS_MAX } from '../../../common/fahrtenbuch';
import { formatDayLabel } from '../fahrtenbuchExportModel';
import { getFahrtenbuchMangelEmails } from '../stammdatenActions';
import type { WeeklyReportResult } from '../sendWeeklyReports';
import { sendWeeklyReportNow } from '../weeklyReportAdminActions';
import { resolveReportPeriod } from '../weeklyReportPeriod';

/**
 * Manueller Versand des Wochenberichts für eine Gruppe.
 *
 * Die Empfänger sind mit den gepflegten Mangel-Empfängern vorbelegt und für
 * diesen Versand überschreibbar — gespeichert wird die Änderung nicht, dafür
 * ist der Abschnitt darüber da. Die Woche ist wählbar, damit eine ausgefallene
 * Woche nachzureichen ist.
 */
export default function WeeklyReportSendSection({
  groupId,
}: {
  groupId: string;
}) {
  const t = useTranslations('fahrtenbuch');
  // Ohne Angabe die letzte abgeschlossene ISO-Woche — dieselbe Rechnung, die
  // der Montagslauf ohne Payload anstellt.
  const [initial] = useState(() => resolveReportPeriod());
  const [year, setYear] = useState(String(initial.isoYear));
  const [week, setWeek] = useState(String(initial.week));
  const [emails, setEmails] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<WeeklyReportResult | undefined>();
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
          // Bewusst kein `setLoaded(true)`: Mit leeren Feldern und
          // freigeschaltetem Knopf ginge ein Versand an niemanden oder an eine
          // von Hand getippte Adresse, während die gepflegte Liste unbekannt
          // bleibt.
          setFeedback({
            severity: 'error',
            text: t('admin.weeklyReport.loadFailed', {
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
          text: t('admin.weeklyReport.loadFailed', {
            message: (err as Error).message,
          }),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId, t]);

  /**
   * Der eingegebene Zeitraum, mit derselben Funktion aufgelöst wie auf dem
   * Server. Eine unmögliche Woche zeigt sich damit sofort im Formular und nicht
   * erst als Fehler der Action.
   */
  const period = useMemo(() => {
    try {
      return resolveReportPeriod({ year: Number(year), week: Number(week) });
    } catch {
      return undefined;
    }
  }, [year, week]);

  const errorText = (error?: string): string => {
    if (error === 'noRecipients') {
      return t('admin.weeklyReport.errorNoRecipients');
    }
    if (error === 'emailInvalid') {
      return t('admin.weeklyReport.errorEmailInvalid');
    }
    if (error === 'tooManyEmails') {
      return t('admin.weeklyReport.errorTooManyEmails', {
        max: FAHRTENBUCH_MANGEL_EMAILS_MAX,
      });
    }
    if (error === 'invalidWeek') {
      return t('admin.weeklyReport.errorInvalidWeek');
    }
    return t('admin.weeklyReport.failed', { message: error ?? '' });
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setFeedback(undefined);
    setPreview(undefined);
    try {
      const response = await sendWeeklyReportNow({
        groupId,
        year: Number(year),
        week: Number(week),
        recipients: emails,
        dryRun,
      });
      if (!response.success || !response.result) {
        setFeedback({ severity: 'error', text: errorText(response.error) });
        return;
      }
      // `sendWeeklyReportForGroup` fasst einen Fehler des Versands in das
      // Ergebnis, statt zu werfen — ein `success: true` allein heißt also noch
      // nicht, dass die Mail draußen ist.
      if (response.result.status === 'failed') {
        setFeedback({
          severity: 'error',
          text: errorText(response.result.error),
        });
        return;
      }
      if (response.result.status === 'dryRun') {
        setPreview(response.result);
        return;
      }
      setFeedback({
        severity: 'success',
        text: t('admin.weeklyReport.sent', {
          entries: response.result.entryCount,
          warnings: response.result.warningCount,
          mangel: response.result.openMangelCount,
        }),
      });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: errorText((err as Error).message),
      });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !loaded || !period;

  return (
    <Paper sx={{ p: 3, maxWidth: 480 }}>
      <Typography variant="h6" gutterBottom>
        {t('admin.weeklyReport.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('admin.weeklyReport.hint')}
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

      <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
        <TextField
          type="number"
          size="small"
          label={t('admin.weeklyReport.year')}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          sx={{ width: 120 }}
        />
        <TextField
          type="number"
          size="small"
          label={t('admin.weeklyReport.week')}
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          sx={{ width: 100 }}
        />
      </Stack>

      <Typography
        variant="body2"
        color={period ? 'text.secondary' : 'error'}
        sx={{ mb: 2 }}
      >
        {period
          ? t('admin.weeklyReport.period', {
              from: formatDayLabel(period.from),
              to: formatDayLabel(period.to),
            })
          : t('admin.weeklyReport.periodInvalid')}
      </Typography>

      {/* `freeSolo` wie bei den Mangel-Empfängern: Es gibt keine
          Vorschlagsliste, jede Adresse wird ein einzeln entfernbarer Chip. */}
      <Autocomplete
        multiple
        freeSolo
        options={[]}
        value={emails}
        onChange={(_event, value) => setEmails(value as string[])}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('admin.weeklyReport.recipients')}
            placeholder={t('admin.weeklyReport.recipientsPlaceholder')}
            helperText={t('admin.weeklyReport.recipientsHelper')}
          />
        )}
      />

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={() => run(true)} disabled={disabled}>
          {t('admin.weeklyReport.preview')}
        </Button>
        <Button
          variant="contained"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled || emails.length === 0}
        >
          {t('admin.weeklyReport.send')}
        </Button>
      </Stack>

      {/* Der echte Versand geht an eine gepflegte Verteilerliste; die
          Bestätigung nennt deshalb Woche und Adressen im Klartext. */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('admin.weeklyReport.confirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('admin.weeklyReport.confirmText', {
              week: period?.week ?? Number(week),
              year: period?.isoYear ?? Number(year),
              count: emails.length,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {emails.join(', ')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmOpen(false);
              void run(false);
            }}
          >
            {t('admin.weeklyReport.send')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!preview}
        onClose={() => setPreview(undefined)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t('admin.weeklyReport.previewTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2">
            {t('admin.weeklyReport.subject')}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {preview?.subject}
          </Typography>
          {/* Die Textfassung der Mail, nicht das HTML: Sie enthält dieselben
              Zahlen und ist ohne eigenes Rendering zu prüfen. */}
          <Typography
            component="pre"
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', overflowX: 'auto', m: 0 }}
          >
            {preview?.text}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(undefined)}>{t('cancel')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
