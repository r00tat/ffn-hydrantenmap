'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BugReportIcon from '@mui/icons-material/BugReport';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  type BugReport,
  type BugReportConfig,
  type BugReportKind,
  type BugReportStatus,
} from '../../../common/bugReport';
import { useSnackbar } from '../../../components/providers/SnackbarProvider';
import BugReportConfigSection from './BugReportConfigSection';
import BugReportDetailDialog from './BugReportDetailDialog';
import { listBugReportsAction } from './bugReportAdminActions';

interface BugReportListClientProps {
  initialReports: BugReport[];
  initialConfig: BugReportConfig;
}

type KindFilter = 'all' | BugReportKind;
type StatusFilter = 'all' | BugReportStatus;

const STATUS_COLOR: Record<
  BugReportStatus,
  'warning' | 'info' | 'success' | 'default'
> = {
  open: 'warning',
  in_progress: 'info',
  closed: 'success',
  wontfix: 'default',
};

const STATUS_KEY = {
  open: 'statusOpen',
  in_progress: 'statusInProgress',
  closed: 'statusClosed',
  wontfix: 'statusWontfix',
} as const satisfies Record<BugReportStatus, string>;

const KIND_KEY = {
  bug: 'kindBug',
  feature: 'kindFeatureShort',
} as const satisfies Record<BugReportKind, string>;

interface SerializedTimestamp {
  _seconds?: number;
  seconds?: number;
  _nanoseconds?: number;
  nanoseconds?: number;
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
  });
}

function attachmentCount(report: BugReport): number {
  return (
    (report.screenshots?.length ?? 0) + (report.attachments?.length ?? 0)
  );
}

export default function BugReportListClient({
  initialReports,
  initialConfig,
}: BugReportListClientProps) {
  const showSnackbar = useSnackbar();
  const t = useTranslations('bugReport');
  const [reports, setReports] = useState<BugReport[]>(initialReports);
  const [refreshing, setRefreshing] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await listBugReportsAction();
      setReports(next);
    } catch (err) {
      showSnackbar(
        `${t('loadFailed')}: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setRefreshing(false);
    }
  }, [showSnackbar, t]);

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = [
        r.title,
        r.description,
        r.createdBy?.email,
        r.createdBy?.displayName ?? '',
        r.context?.buildId ?? '',
        r.context?.firecallName ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [reports, kindFilter, statusFilter, search]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleDialogClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleStatusChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t('pageTitle')}
      </Typography>

      <BugReportConfigSection initialConfig={initialConfig} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label={t('filterKind')}
            size="small"
            select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">{t('filterAll')}</MenuItem>
            <MenuItem value="bug">{t('kindBug')}</MenuItem>
            <MenuItem value="feature">{t('kindFeatureShort')}</MenuItem>
          </TextField>
          <TextField
            label={t('filterStatus')}
            size="small"
            select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">{t('filterAll')}</MenuItem>
            <MenuItem value="open">{t('statusOpen')}</MenuItem>
            <MenuItem value="in_progress">{t('statusInProgress')}</MenuItem>
            <MenuItem value="closed">{t('statusClosed')}</MenuItem>
            <MenuItem value="wontfix">{t('statusWontfix')}</MenuItem>
          </TextField>
          <TextField
            label={t('searchLabel')}
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            sx={{ flex: 1, minWidth: 200 }}
          />
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('colDate')}</TableCell>
              <TableCell>{t('colType')}</TableCell>
              <TableCell>{t('colTitle')}</TableCell>
              <TableCell>{t('colUser')}</TableCell>
              <TableCell>{t('colStatus')}</TableCell>
              <TableCell align="right">{t('colAttachments')}</TableCell>
              <TableCell>{t('colBuild')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {refreshing && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            )}
            {!refreshing && filteredReports.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" sx={{ py: 2 }}>
                    {t('noReports')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!refreshing &&
              filteredReports.map((report) => {
                const userLabel =
                  report.createdBy?.displayName ||
                  report.createdBy?.email ||
                  '-';
                return (
                  <TableRow
                    key={report.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleRowClick(report.id)}
                  >
                    <TableCell>{formatDate(report.createdAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={
                          report.kind === 'bug' ? (
                            <BugReportIcon />
                          ) : (
                            <LightbulbIcon />
                          )
                        }
                        label={t(KIND_KEY[report.kind])}
                        color={report.kind === 'bug' ? 'error' : 'primary'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{report.title}</TableCell>
                    <TableCell>{userLabel}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t(STATUS_KEY[report.status])}
                        color={STATUS_COLOR[report.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {attachmentCount(report)}
                    </TableCell>
                    <TableCell>{report.context?.buildId ?? '-'}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedId && (
        <BugReportDetailDialog
          reportId={selectedId}
          open={!!selectedId}
          onClose={handleDialogClose}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </Box>
  );
}
