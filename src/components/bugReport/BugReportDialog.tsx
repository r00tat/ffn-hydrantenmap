'use client';

import BugReportIcon from '@mui/icons-material/BugReport';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';
import { useDebugLogging } from '../../hooks/useDebugging';
import { useFirecall } from '../../hooks/useFirecall';
import {
  BUG_REPORT_MAX_LOG_ENTRIES,
  type BugReportContext,
  type BugReportKind,
  type BugReportLogEntry,
} from '../../common/bugReport';
import { useSnackbar } from '../providers/SnackbarProvider';
import { captureScreenshot, isScreenshotSupported } from './captureScreenshot';
import { collectContext } from './collectContext';
import { submitBugReportAction } from './submitBugReportAction';
import { uploadBugReportFile } from './uploadBugReportFile';

export interface BugReportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface FrozenSnapshot {
  context: BugReportContext;
  logs: BugReportLogEntry[];
}

export default function BugReportDialog({ open, onClose }: BugReportDialogProps) {
  const pathname = usePathname() ?? '';
  const firecall = useFirecall();
  const { messages, displayMessages, setDisplayMessages } = useDebugLogging();
  const showSnackbar = useSnackbar();
  const t = useTranslations('bugReport');

  const [kind, setKind] = useState<BugReportKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pendingScreenshots, setPendingScreenshots] = useState<Blob[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [snapshot, setSnapshot] = useState<FrozenSnapshot | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const screenshotSupported = isScreenshotSupported();

  // Freeze logs + context when dialog opens.
  useEffect(() => {
    if (open) {
      const ctx = collectContext({
        pathname,
        firecall,
        buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? '',
        database: process.env.NEXT_PUBLIC_FIRESTORE_DB ?? '',
      });
      const logs: BugReportLogEntry[] = (messages ?? [])
        .slice(-BUG_REPORT_MAX_LOG_ENTRIES)
        .map((m) => ({
          message: m.message,
          level:
            typeof m.properties?.level === 'string'
              ? (m.properties.level as string)
              : undefined,
          properties: m.properties,
        }));
      setSnapshot({ context: ctx, logs });
    } else {
      // Reset transient form state when closing.
      setSnapshot(null);
      setKind('bug');
      setTitle('');
      setDescription('');
      setPendingScreenshots([]);
      setPendingAttachments([]);
      setSubmitting(false);
      setMinimized(false);
    }
    // We deliberately only re-run when `open` toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const screenshotPreviews = useMemo(
    () => pendingScreenshots.map((b) => URL.createObjectURL(b)),
    [pendingScreenshots],
  );
  const attachmentPreviews = useMemo(
    () => pendingAttachments.map((f) => URL.createObjectURL(f)),
    [pendingAttachments],
  );

  useEffect(() => {
    return () => {
      screenshotPreviews.forEach((u) => URL.revokeObjectURL(u));
      attachmentPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [screenshotPreviews, attachmentPreviews]);

  const handleCaptureScreenshot = useCallback(async () => {
    setMinimized(true);
    try {
      const blob = await captureScreenshot();
      if (blob) {
        setPendingScreenshots((prev) => [...prev, blob]);
      }
    } finally {
      setMinimized(false);
    }
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;
      const list = Array.from(files);
      setPendingAttachments((prev) => [...prev, ...list]);
      // Reset so picking the same file twice still fires onChange.
      event.target.value = '';
    },
    [],
  );

  const removeScreenshot = (idx: number) => {
    setPendingScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };
  const removeAttachment = (idx: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const isValid = title.trim().length > 0 && description.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    if (!isValid || !snapshot) return;
    setSubmitting(true);
    const reportId = uuid();
    try {
      // Upload screenshots and attachments in parallel.
      const screenshotUploads = pendingScreenshots.map((blob, idx) =>
        uploadBugReportFile(
          reportId,
          blob,
          `screenshot${idx === 0 ? '' : `-${idx + 1}`}.png`,
          'image/png',
        ),
      );
      const attachmentUploads = pendingAttachments.map((file) =>
        uploadBugReportFile(reportId, file, file.name, file.type),
      );

      const [screenshotResults, attachmentResults] = await Promise.all([
        Promise.all(screenshotUploads),
        Promise.all(attachmentUploads),
      ]);

      await submitBugReportAction({
        reportId,
        kind,
        title: title.trim(),
        description: description.trim(),
        context: snapshot.context,
        logs: snapshot.logs,
        screenshots: screenshotResults,
        attachments: attachmentResults,
      });

      showSnackbar(t('submitSuccess'), 'success');
      onClose();
    } catch (err) {
      console.error('Bug report submit failed', err);
      showSnackbar(t('submitFailed'), 'error', {
        label: t('retry'),
        onClick: () => handleSubmit(),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    isValid,
    snapshot,
    pendingScreenshots,
    pendingAttachments,
    kind,
    title,
    description,
    showSnackbar,
    onClose,
    t,
  ]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      fullWidth
      maxWidth="sm"
      sx={{ display: minimized ? 'none' : undefined }}
    >
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <BugReportIcon />
          <span>{t('dialogTitle')}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <ToggleButtonGroup
            value={kind}
            exclusive
            onChange={(_e, next) => {
              if (next === 'bug' || next === 'feature') setKind(next);
            }}
            aria-label={t('kindAriaLabel')}
            size="small"
          >
            <ToggleButton value="bug" aria-label={t('kindBug')}>
              {t('kindBug')}
            </ToggleButton>
            <ToggleButton value="feature" aria-label={t('kindFeature')}>
              {t('kindFeature')}
            </ToggleButton>
          </ToggleButtonGroup>

          {kind === 'bug' && !displayMessages && (
            <Alert severity="info">
              <Stack spacing={1}>
                <Typography variant="body2">{t('debugHint')}</Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={false}
                      onChange={(_e, checked) => setDisplayMessages(checked)}
                      slotProps={{
                        input: { 'aria-label': t('enableDebugLogging') },
                      }}
                    />
                  }
                  label={t('enableDebugLogging')}
                />
              </Stack>
            </Alert>
          )}
          {kind === 'bug' && displayMessages && (
            <Alert severity="success">{t('debugLoggingActive')}</Alert>
          )}

          <TextField
            label={t('titleLabel')}
            required
            autoFocus
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            label={t('descriptionLabel')}
            required
            fullWidth
            multiline
            minRows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('attachments')}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              {screenshotSupported && (
                <Button
                  startIcon={<ScreenshotMonitorIcon />}
                  variant="outlined"
                  size="small"
                  onClick={handleCaptureScreenshot}
                  disabled={submitting}
                >
                  {t('captureScreenshot')}
                </Button>
              )}
              <Button
                startIcon={<PhotoCameraIcon />}
                variant="outlined"
                size="small"
                component="label"
                disabled={submitting}
              >
                {t('addImages')}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleFileInputChange}
                />
              </Button>
            </Stack>

            {(pendingScreenshots.length > 0 ||
              pendingAttachments.length > 0) && (
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ mt: 2, flexWrap: 'wrap' }}
              >
                {pendingScreenshots.map((blob, idx) => (
                  <Box
                    key={`ss-${idx}`}
                    sx={{
                      position: 'relative',
                      width: 96,
                      height: 96,
                      border: '1px solid #ccc',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotPreviews[idx]}
                      alt={`screenshot-${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={t('removeScreenshot')}
                      onClick={() => removeScreenshot(idx)}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bgcolor: 'background.paper',
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                {pendingAttachments.map((file, idx) => (
                  <Box
                    key={`att-${idx}`}
                    sx={{
                      position: 'relative',
                      width: 96,
                      height: 96,
                      border: '1px solid #ccc',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachmentPreviews[idx]}
                      alt={file.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={t('removeAttachment')}
                      onClick={() => removeAttachment(idx)}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bgcolor: 'background.paper',
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">{t('capturedContext')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {snapshot ? (
                <Box>
                  <Typography variant="caption" component="div">
                    {t('urlLabel')}: {snapshot.context.url}
                  </Typography>
                  <Typography variant="caption" component="div">
                    {t('buildLabel')}: {snapshot.context.buildId || '-'}
                  </Typography>
                  <Typography variant="caption" component="div">
                    {t('platformLabel')}: {snapshot.context.platform}
                  </Typography>
                  <Typography variant="caption" component="div">
                    {t('firecallLabel')}: {snapshot.context.firecallName ?? '-'}
                  </Typography>
                  <Typography variant="caption" component="div">
                    {t('logEntriesLabel')}: {snapshot.logs.length}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      maxHeight: 160,
                      overflow: 'auto',
                      fontSize: 11,
                      mt: 1,
                      bgcolor: 'action.hover',
                      p: 1,
                    }}
                  >
                    {snapshot.logs
                      .map((l) => `[${l.level ?? '-'}] ${l.message}`)
                      .join('\n')}
                  </Box>
                </Box>
              ) : (
                <Typography variant="caption">-</Typography>
              )}
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t('cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid || submitting}
        >
          {t('submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
