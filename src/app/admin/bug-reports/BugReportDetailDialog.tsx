'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  type BugReport,
  type BugReportStatus,
} from '../../../common/bugReport';
import { useSnackbar } from '../../../components/providers/SnackbarProvider';
import {
  getBugReportAction,
  updateBugReportStatusAction,
} from './bugReportAdminActions';

interface BugReportDetailDialogProps {
  reportId: string;
  open: boolean;
  onClose: () => void;
  onStatusChanged: () => void;
}

interface DetailData {
  report: BugReport;
  screenshotUrls: string[];
  attachmentUrls: string[];
}

const STATUS_OPTIONS = [
  { value: 'open', tKey: 'statusOpen' },
  { value: 'in_progress', tKey: 'statusInProgress' },
  { value: 'closed', tKey: 'statusClosed' },
  { value: 'wontfix', tKey: 'statusWontfix' },
] as const satisfies readonly { value: BugReportStatus; tKey: string }[];

interface SerializedTimestamp {
  _seconds?: number;
  seconds?: number;
}

function toDate(value: BugReport['createdAt'] | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const ts = value as unknown as SerializedTimestamp;
  const seconds = ts._seconds ?? ts.seconds;
  if (typeof seconds === 'number') {
    return new Date(seconds * 1000);
  }
  return null;
}

function formatDate(value: BugReport['createdAt'] | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.5 }}>
      <Typography
        variant="body2"
        sx={{ minWidth: 140, fontWeight: 600 }}
        component="span"
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={{ wordBreak: 'break-all' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function BugReportDetailDialog({
  reportId,
  open,
  onClose,
  onStatusChanged,
}: BugReportDetailDialogProps) {
  const showSnackbar = useSnackbar();
  const t = useTranslations('bugReport');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailData | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    getBugReportAction(reportId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportId, open]);

  const handleStatusChange = useCallback(
    async (status: BugReportStatus) => {
      if (!data) return;
      setStatusSaving(true);
      try {
        await updateBugReportStatusAction(reportId, status);
        setData({
          ...data,
          report: { ...data.report, status },
        });
        showSnackbar(t('statusUpdated'), 'success');
        onStatusChanged();
      } catch (err) {
        showSnackbar(
          `${t('statusUpdateFailed')}: ${err instanceof Error ? err.message : String(err)}`,
          'error',
        );
      } finally {
        setStatusSaving(false);
      }
    },
    [data, reportId, onStatusChanged, showSnackbar, t],
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {data?.report?.kind === 'feature' ? (
          <LightbulbIcon color="primary" />
        ) : (
          <BugReportIcon color="error" />
        )}
        <span>{data?.report?.title ?? t('detailFallbackTitle')}</span>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}

        {data && (
          <Stack spacing={2}>
            {/* Metadata */}
            <Box>
              <MetadataRow
                label={t('filterKind')}
                value={
                  <Chip
                    size="small"
                    label={t(
                      data.report.kind === 'bug'
                        ? 'kindBug'
                        : 'kindFeatureShort',
                    )}
                    color={data.report.kind === 'bug' ? 'error' : 'primary'}
                    variant="outlined"
                  />
                }
              />
              <MetadataRow
                label={t('filterStatus')}
                value={
                  <TextField
                    select
                    size="small"
                    value={data.report.status}
                    onChange={(e) =>
                      void handleStatusChange(
                        e.target.value as BugReportStatus,
                      )
                    }
                    disabled={statusSaving}
                    sx={{ minWidth: 180 }}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {t(o.tKey)}
                      </MenuItem>
                    ))}
                  </TextField>
                }
              />
              <MetadataRow
                label={t('metaDate')}
                value={formatDate(data.report.createdAt)}
              />
              <MetadataRow
                label={t('metaUser')}
                value={
                  data.report.createdBy?.displayName
                    ? `${data.report.createdBy.displayName} <${data.report.createdBy.email}>`
                    : (data.report.createdBy?.email ?? '-')
                }
              />
              <MetadataRow
                label={t('metaUrl')}
                value={data.report.context?.url ?? '-'}
              />
              <MetadataRow
                label={t('metaPath')}
                value={data.report.context?.pathname ?? '-'}
              />
              <MetadataRow
                label={t('metaBuild')}
                value={`${data.report.context?.buildId ?? '-'}${
                  data.report.context?.database
                    ? ` (${data.report.context.database})`
                    : ''
                }`}
              />
              <MetadataRow
                label={t('metaPlatform')}
                value={`${data.report.context?.platform ?? '-'}${
                  data.report.context?.isNative ? ' (native)' : ''
                }`}
              />
              <MetadataRow
                label={t('metaUserAgent')}
                value={data.report.context?.userAgent ?? '-'}
              />
              {data.report.context?.firecallName && (
                <MetadataRow
                  label={t('metaFirecall')}
                  value={`${data.report.context.firecallName}${
                    data.report.context.firecallId
                      ? ` (${data.report.context.firecallId})`
                      : ''
                  }`}
                />
              )}
              {data.report.notificationError && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {t('notificationErrorLabel')}: {data.report.notificationError}
                </Alert>
              )}
            </Box>

            <Divider />

            {/* Description */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {t('descriptionHeader')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {data.report.description}
              </Typography>
            </Box>

            {/* Screenshots */}
            {data.screenshotUrls.length > 0 && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, mb: 1 }}
                >
                  {t('screenshotsHeader')} ({data.screenshotUrls.length})
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 1,
                  }}
                >
                  {data.screenshotUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
              </Box>
            )}

            {/* Attachments */}
            {data.attachmentUrls.length > 0 && (
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, mb: 1 }}
                >
                  {t('attachmentsHeader')} ({data.attachmentUrls.length})
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 1,
                  }}
                >
                  {data.attachmentUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={t('attachmentAlt')}
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
              </Box>
            )}

            {/* Logs */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('logsHeader')} ({data.report.logs?.length ?? 0})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {!data.report.logs || data.report.logs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('logsEmpty')}
                  </Typography>
                ) : (
                  <Box
                    component="pre"
                    sx={{
                      fontSize: '0.75rem',
                      m: 0,
                      maxHeight: 320,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                      backgroundColor: 'action.hover',
                      p: 1,
                      borderRadius: 1,
                    }}
                  >
                    {data.report.logs
                      .map((log) => {
                        const level = log.level ? `[${log.level}] ` : '';
                        const props = log.properties
                          ? ` ${JSON.stringify(log.properties)}`
                          : '';
                        return `${level}${log.message}${props}`;
                      })
                      .join('\n')}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
