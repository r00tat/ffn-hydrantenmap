'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GitHubIcon from '@mui/icons-material/GitHub';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_SHORT_FIELD_MAX_LENGTH,
  type BugReport,
  type BugReportChange,
  type BugReportComment,
  type BugReportStatus,
  type BugReportTrackedField,
} from '../../../common/bugReport';
import {
  buildBugReportIssueDraftUrl,
  parseBugReportIssueRef,
} from '../../../common/bugReportTracking';
import { formatBugReportDate } from '../../../common/bugReportDate';
import { useSnackbar } from '../../../components/providers/SnackbarProvider';
import {
  addBugReportCommentAction,
  getBugReportAction,
  listBugReportCommentsAction,
  updateBugReportAction,
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
  comments: BugReportComment[];
}

const STATUS_OPTIONS = [
  { value: 'open', tKey: 'statusOpen' },
  { value: 'in_progress', tKey: 'statusInProgress' },
  { value: 'closed', tKey: 'statusClosed' },
  { value: 'wontfix', tKey: 'statusWontfix' },
] as const satisfies readonly { value: BugReportStatus; tKey: string }[];

const STATUS_TKEY = {
  open: 'statusOpen',
  in_progress: 'statusInProgress',
  closed: 'statusClosed',
  wontfix: 'statusWontfix',
} as const satisfies Record<BugReportStatus, string>;

const FIELD_TKEY = {
  status: 'fieldStatus',
  githubIssue: 'fieldGithubIssue',
  assignee: 'fieldAssignee',
  internalNote: 'fieldInternalNote',
} as const satisfies Record<BugReportTrackedField, string>;

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

/** Ein Wert im Verlauf soll eine Zeile bleiben, auch wenn er eine Notiz ist. */
function truncate(value: string, maxLength = 80): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function ChangeLine({ change }: { change: BugReportChange }) {
  const t = useTranslations('bugReport');
  const display = (value: string): string => {
    if (!value) return t('valueEmpty');
    if (change.field === 'status') {
      const tKey = STATUS_TKEY[value as BugReportStatus];
      return tKey ? t(tKey) : value;
    }
    if (change.field === 'githubIssue') {
      return parseBugReportIssueRef(value)?.label ?? value;
    }
    return truncate(value);
  };
  return (
    <Typography variant="body2" color="text.secondary">
      {t('changeLine', {
        field: t(FIELD_TKEY[change.field]),
        from: display(change.from),
        to: display(change.to),
      })}
    </Typography>
  );
}

function HistoryEntry({ entry }: { entry: BugReportComment }) {
  const author =
    entry.createdBy?.displayName || entry.createdBy?.email || '-';
  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor:
          entry.entryType === 'change' ? 'divider' : 'primary.main',
        pl: 1.5,
      }}
    >
      <Typography variant="caption" color="text.secondary" component="div">
        {formatBugReportDate(entry.createdAt, { withSeconds: true })} ·{' '}
        {author}
      </Typography>
      {entry.entryType === 'change' ? (
        (entry.changes ?? []).map((change, index) => (
          <ChangeLine key={`${change.field}-${index}`} change={change} />
        ))
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {entry.text}
        </Typography>
      )}
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
  const [githubIssue, setGithubIssue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  const applyResult = useCallback((result: DetailData) => {
    setData(result);
    setGithubIssue(result.report.githubIssue ?? '');
    setAssignee(result.report.assignee ?? '');
    setInternalNote(result.report.internalNote ?? '');
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    getBugReportAction(reportId)
      .then((result) => {
        if (cancelled) return;
        applyResult(result);
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
  }, [reportId, open, applyResult]);

  const handleStatusChange = useCallback(
    async (status: BugReportStatus) => {
      if (!data) return;
      setStatusSaving(true);
      try {
        await updateBugReportStatusAction(reportId, status);
        // Neu laden statt lokal setzen: die Änderung erzeugt einen
        // Verlaufseintrag, der sonst erst beim nächsten Öffnen auftaucht.
        applyResult(await getBugReportAction(reportId));
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
    [data, reportId, onStatusChanged, showSnackbar, t, applyResult],
  );

  const handleSaveTracking = useCallback(async () => {
    if (!data) return;
    setTrackingSaving(true);
    try {
      await updateBugReportAction(reportId, {
        githubIssue,
        assignee,
        internalNote,
      });
      applyResult(await getBugReportAction(reportId));
      showSnackbar(t('trackingSaved'), 'success');
      onStatusChanged();
    } catch (err) {
      showSnackbar(
        `${t('trackingSaveFailed')}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setTrackingSaving(false);
    }
  }, [
    data,
    reportId,
    githubIssue,
    assignee,
    internalNote,
    applyResult,
    onStatusChanged,
    showSnackbar,
    t,
  ]);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setCommentSaving(true);
    try {
      await addBugReportCommentAction(reportId, commentText);
      const comments = await listBugReportCommentsAction(reportId);
      setData((prev) => (prev ? { ...prev, comments } : prev));
      setCommentText('');
      showSnackbar(t('commentAdded'), 'success');
    } catch (err) {
      showSnackbar(
        `${t('commentAddFailed')}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setCommentSaving(false);
    }
  }, [commentText, reportId, showSnackbar, t]);

  const issueRef = parseBugReportIssueRef(githubIssue);
  const trackingDirty =
    !!data &&
    (githubIssue !== (data.report.githubIssue ?? '') ||
      assignee !== (data.report.assignee ?? '') ||
      internalNote !== (data.report.internalNote ?? ''));

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
                value={formatBugReportDate(data.report.createdAt, {
                  withSeconds: true,
                })}
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

            <Divider />

            {/* Bearbeitung */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {t('trackingHeader')}
              </Typography>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <TextField
                    label={t('githubIssueLabel')}
                    helperText={t('githubIssueHelper')}
                    size="small"
                    fullWidth
                    value={githubIssue}
                    onChange={(e) => setGithubIssue(e.target.value)}
                    disabled={trackingSaving}
                    slotProps={{
                      htmlInput: { maxLength: BUG_REPORT_SHORT_FIELD_MAX_LENGTH },
                    }}
                  />
                  {issueRef ? (
                    <Button
                      component="a"
                      href={issueRef.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      startIcon={<OpenInNewIcon />}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      {t('githubIssueOpen')}
                    </Button>
                  ) : (
                    <Tooltip title={t('githubIssueCreateHint')}>
                      <Button
                        component="a"
                        href={buildBugReportIssueDraftUrl(data.report)}
                        target="_blank"
                        rel="noopener noreferrer"
                        startIcon={<GitHubIcon />}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        {t('githubIssueCreate')}
                      </Button>
                    </Tooltip>
                  )}
                </Stack>
                <TextField
                  label={t('assigneeLabel')}
                  size="small"
                  fullWidth
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={trackingSaving}
                  slotProps={{
                    htmlInput: { maxLength: BUG_REPORT_SHORT_FIELD_MAX_LENGTH },
                  }}
                />
                <TextField
                  label={t('internalNoteLabel')}
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  disabled={trackingSaving}
                  slotProps={{
                    htmlInput: { maxLength: BUG_REPORT_COMMENT_MAX_LENGTH },
                  }}
                />
                <Box>
                  <Button
                    variant="contained"
                    onClick={() => void handleSaveTracking()}
                    disabled={!trackingDirty || trackingSaving}
                    startIcon={
                      trackingSaving ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : undefined
                    }
                  >
                    {t('save')}
                  </Button>
                </Box>
              </Stack>
            </Box>

            <Divider />

            {/* Verlauf & Kommentare */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {t('historyHeader')} ({data.comments.length})
              </Typography>
              {data.comments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('historyEmpty')}
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {data.comments.map((entry) => (
                    <HistoryEntry key={entry.id} entry={entry} />
                  ))}
                </Stack>
              )}
              <TextField
                label={t('commentAdd')}
                placeholder={t('commentPlaceholder')}
                helperText={t('commentInternalHint')}
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={commentSaving}
                slotProps={{
                  htmlInput: { maxLength: BUG_REPORT_COMMENT_MAX_LENGTH },
                }}
              />
              <Box sx={{ mt: 1 }}>
                <Button
                  variant="contained"
                  onClick={() => void handleAddComment()}
                  disabled={!commentText.trim() || commentSaving}
                  startIcon={
                    commentSaving ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : undefined
                  }
                >
                  {t('commentAdd')}
                </Button>
              </Box>
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
