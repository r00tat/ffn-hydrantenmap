'use client';

import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { BugReportStatus } from '../../common/bugReport';
import { formatBugReportDate } from '../../common/bugReportDate';
import type {
  BugReportReporterEntry,
  BugReportReporterView,
} from '../../common/bugReportReporterView';
import {
  getMyBugReportFilesAction,
  listMyBugReportsAction,
} from './myBugReportsActions';

const STATUS_TKEY = {
  open: 'statusOpen',
  in_progress: 'statusInProgress',
  closed: 'statusClosed',
  wontfix: 'statusWontfix',
} as const satisfies Record<BugReportStatus, string>;

const STATUS_COLOR = {
  open: 'default',
  in_progress: 'info',
  closed: 'success',
  wontfix: 'warning',
} as const satisfies Record<BugReportStatus, string>;

function StatusChip({ status }: { status: BugReportStatus }) {
  const t = useTranslations('bugReport');
  const tKey = STATUS_TKEY[status];
  return (
    <Chip
      size="small"
      label={tKey ? t(tKey) : status}
      color={STATUS_COLOR[status] ?? 'default'}
    />
  );
}

function EntryLine({ entry }: { entry: BugReportReporterEntry }) {
  const t = useTranslations('myBugReports');
  const tBug = useTranslations('bugReport');
  const statusLabel = (value: string) => {
    const tKey = STATUS_TKEY[value as BugReportStatus];
    return tKey ? tBug(tKey) : value || tBug('valueEmpty');
  };
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5 }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {formatBugReportDate(entry.createdAt)} ·{' '}
        {entry.authorName || t('authorFallback')}
      </Typography>
      {entry.entryType === 'comment' ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {entry.text}
        </Typography>
      ) : (
        (entry.changes ?? []).map((change, index) => (
          <Typography
            key={`${change.field}-${index}`}
            variant="body2"
            color="text.secondary"
          >
            {change.field === 'status'
              ? t('statusChange', {
                  from: statusLabel(change.from),
                  to: statusLabel(change.to),
                })
              : change.to
                ? t('resolutionChanged')
                : t('resolutionRemoved')}
          </Typography>
        ))
      )}
    </Box>
  );
}

function ReportFiles({ reportId }: { reportId: string }) {
  const t = useTranslations('myBugReports');
  const [files, setFiles] = useState<string[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    getMyBugReportFilesAction(reportId)
      .then((result) => {
        if (!cancelled) {
          setFiles([...result.screenshotUrls, ...result.attachmentUrls]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (error) {
    return (
      <Alert severity="warning">{t('filesFailed', { message: error })}</Alert>
    );
  }
  if (!files) return <CircularProgress size={20} />;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1,
      }}
    >
      {files.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
          <Box
            component="img"
            src={url}
            alt={t('screenshotAlt')}
            sx={{
              width: '100%',
              height: 120,
              objectFit: 'cover',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          />
        </a>
      ))}
    </Box>
  );
}

function ReportItem({ report }: { report: BugReportReporterView }) {
  const t = useTranslations('myBugReports');
  const tBug = useTranslations('bugReport');
  const [expanded, setExpanded] = useState(false);
  const hasFiles = report.screenshots.length + report.attachments.length > 0;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          {report.kind === 'feature' ? (
            <LightbulbIcon color="primary" fontSize="small" />
          ) : (
            <BugReportIcon color="error" fontSize="small" />
          )}
          <Typography sx={{ fontWeight: 600 }}>{report.title}</Typography>
          <StatusChip status={report.status} />
          <Typography variant="caption" color="text.secondary">
            {t('createdAt', { date: formatBugReportDate(report.createdAt) })}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {tBug(report.kind === 'feature' ? 'kindFeatureShort' : 'kindBug')}
              {report.updatedAt
                ? ` · ${t('updatedAt', { date: formatBugReportDate(report.updatedAt) })}`
                : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2">{t('resolutionHeader')}</Typography>
            {report.resolution ? (
              <Alert
                severity={report.status === 'closed' ? 'success' : 'info'}
                sx={{ whiteSpace: 'pre-wrap' }}
              >
                {report.resolution}
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('noResolution')}
              </Typography>
            )}
          </Box>

          {report.entries.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('historyHeader')}
              </Typography>
              <Stack spacing={1}>
                {report.entries.map((entry) => (
                  <EntryLine key={entry.id} entry={entry} />
                ))}
              </Stack>
            </Box>
          )}

          <Box>
            <Typography variant="subtitle2">{t('descriptionHeader')}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {report.description}
            </Typography>
          </Box>

          {hasFiles && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('filesHeader')}
              </Typography>
              {expanded && <ReportFiles reportId={report.id} />}
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * „Meine Meldungen“: was aus den eigenen Bug-Reports und Wünschen geworden
 * ist. Zeigt nur die Projektion für den Melder (`toReporterView`) — interne
 * Notizen, Zuständigkeit, Logs und interne Kommentare kommen gar nicht erst
 * im Browser an.
 */
export default function MyBugReports() {
  const t = useTranslations('myBugReports');
  const [reports, setReports] = useState<BugReportReporterView[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    listMyBugReportsAction()
      .then((result) => {
        if (!cancelled) setReports(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Alert severity="error">{t('loadFailed', { message: error })}</Alert>;
  }
  if (!reports) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (reports.length === 0) {
    return (
      <Typography variant="body1" color="text.secondary">
        {t('empty')}
      </Typography>
    );
  }
  return (
    <Box>
      {reports.map((report) => (
        <ReportItem key={report.id} report={report} />
      ))}
    </Box>
  );
}
