'use client';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import React, { useCallback, useMemo, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId } from '../../hooks/useFirecall';
import { useAuditLogEntries } from '../../hooks/useAuditLog';
import { AuditLogEntry } from '../firebase/firestore';
import { downloadRowsAsCsv } from '../firebase/download';
import { DownloadButton } from '../inputs/DownloadButton';

type AuditSortField =
  | 'timestamp'
  | 'user'
  | 'action'
  | 'elementType'
  | 'elementName';

const ACTION_KEYS = ['create', 'update', 'delete'] as const;

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'error'> = {
  create: 'success',
  update: 'warning',
  delete: 'error',
};

function SortableHeader({
  label,
  field,
  activeField,
  direction,
  onClick,
}: {
  label: string;
  field: AuditSortField;
  activeField: AuditSortField;
  direction: 'asc' | 'desc';
  onClick: (field: AuditSortField) => void;
}) {
  const isActive = field === activeField;
  return (
    <Box
      onClick={() => onClick(field)}
      sx={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        userSelect: 'none',
        '&:hover': { opacity: 0.7 },
      }}
    >
      <b>{label}</b>
      {isActive &&
        (direction === 'asc' ? (
          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
        ) : (
          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
        ))}
    </Box>
  );
}

function compareField(
  a: AuditLogEntry,
  b: AuditLogEntry,
  field: AuditSortField,
  direction: 'asc' | 'desc'
): number {
  let result: number;
  switch (field) {
    case 'timestamp':
      result = (a.timestamp || '').localeCompare(b.timestamp || '');
      break;
    case 'user':
      result = (a.user || '').localeCompare(b.user || '');
      break;
    case 'action':
      result = (a.action || '').localeCompare(b.action || '');
      break;
    case 'elementType':
      result = (a.elementType || '').localeCompare(b.elementType || '');
      break;
    case 'elementName':
      result = (a.elementName || '').localeCompare(b.elementName || '');
      break;
    default:
      result = 0;
  }
  return direction === 'asc' ? result : -result;
}

function actionLabel(
  action: string,
  t: ReturnType<typeof useTranslations<'auditlog'>>,
): string {
  if (action === 'create' || action === 'update' || action === 'delete') {
    return t(`action.${action}`);
  }
  return action;
}

function ValueDisplay({ data }: { data?: Record<string, any> }) {
  if (!data) return <Typography variant="body2" color="text.secondary">-</Typography>;

  return (
    <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {Object.entries(data)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => (
          <div key={k}>
            <b>{k}:</b> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </div>
        ))}
    </Box>
  );
}

function downloadAuditLog(
  entries: AuditLogEntry[],
  t: ReturnType<typeof useTranslations<'auditlog'>>,
) {
  const rows: any[][] = [
    [
      t('cols.timestamp'),
      t('cols.user'),
      t('cols.action'),
      t('cols.elementType'),
      t('cols.elementName'),
      t('cols.elementId'),
    ],
    ...entries.map((e) => [
      formatTimestamp(e.timestamp),
      e.user,
      actionLabel(e.action, t),
      e.elementType,
      e.elementName,
      e.elementId,
    ]),
  ];
  downloadRowsAsCsv(rows, t('csvFilename'));
}

export default function AuditLog() {
  const t = useTranslations('auditlog');
  const firecallId = useFirecallId();
  const entries = useAuditLogEntries();

  const [searchText, setSearchText] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [sortField, setSortField] = useState<AuditSortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const elementTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.elementType));
    return Array.from(types).sort();
  }, [entries]);

  const handleSortClick = useCallback(
    (field: AuditSortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  const filteredAndSorted = useMemo(() => {
    const search = searchText.toLowerCase();
    return entries
      .filter((e) => {
        if (filterAction && e.action !== filterAction) return false;
        if (filterType && e.elementType !== filterType) return false;
        if (search) {
          return (
            (e.user || '').toLowerCase().includes(search) ||
            (e.elementName || '').toLowerCase().includes(search) ||
            (e.elementType || '').toLowerCase().includes(search) ||
            actionLabel(e.action, t).toLowerCase().includes(search)
          );
        }
        return true;
      })
      .sort((a, b) => compareField(a, b, sortField, sortDirection));
  }, [entries, searchText, filterAction, filterType, sortField, sortDirection, t]);

  if (firecallId === 'unknown') {
    return (
      <Typography variant="h4" gutterBottom sx={{ p: 2, m: 2 }}>
        {t('title')}
      </Typography>
    );
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {t('title')}{' '}
        <DownloadButton
          onClick={() => downloadAuditLog(filteredAndSorted, t)}
          tooltip={t('downloadCsvTooltip')}
        />
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            label={t('search')}
            size="small"
            fullWidth
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('filterAction')}</InputLabel>
            <Select
              value={filterAction}
              label={t('filterAction')}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <MenuItem value="">{t('filterAll')}</MenuItem>
              {ACTION_KEYS.map((key) => (
                <MenuItem key={key} value={key}>
                  {t(`action.${key}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('filterType')}</InputLabel>
            <Select
              value={filterType}
              label={t('filterType')}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <MenuItem value="">{t('filterAll')}</MenuItem>
              {elementTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
            {t('showingOf', {
              count: filteredAndSorted.length,
              total: entries.length,
            })}
          </Typography>
        </Grid>
      </Grid>

      <Grid container>
        <Grid size={{ xs: 6, md: 3, lg: 2 }}>
          <SortableHeader
            label={t('cols.timestamp')}
            field="timestamp"
            activeField={sortField}
            direction={sortDirection}
            onClick={handleSortClick}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2, lg: 2 }}>
          <SortableHeader
            label={t('cols.user')}
            field="user"
            activeField={sortField}
            direction={sortDirection}
            onClick={handleSortClick}
          />
        </Grid>
        <Grid size={{ xs: 4, md: 1, lg: 1 }}>
          <SortableHeader
            label={t('cols.action')}
            field="action"
            activeField={sortField}
            direction={sortDirection}
            onClick={handleSortClick}
          />
        </Grid>
        <Grid size={{ xs: 4, md: 2, lg: 1 }}>
          <SortableHeader
            label={t('cols.elementType')}
            field="elementType"
            activeField={sortField}
            direction={sortDirection}
            onClick={handleSortClick}
          />
        </Grid>
        <Grid size={{ xs: 4, md: 4, lg: 6 }}>
          <SortableHeader
            label={t('cols.elementName')}
            field="elementName"
            activeField={sortField}
            direction={sortDirection}
            onClick={handleSortClick}
          />
        </Grid>
      </Grid>

      {filteredAndSorted.map((entry, index) => (
        <Accordion
          key={entry.id || index}
          disableGutters
          sx={{
            backgroundColor: index % 2 === 0 ? undefined : '#f5f5f5',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
            <Grid container sx={{ width: '100%', alignItems: 'center' }}>
              <Grid size={{ xs: 6, md: 3, lg: 2 }}>
                <Typography variant="body2">
                  {formatTimestamp(entry.timestamp)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2, lg: 2 }}>
                <Typography variant="body2">
                  {entry.user?.replace(/@.*/, '')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 4, md: 1, lg: 1 }}>
                <Chip
                  label={actionLabel(entry.action, t)}
                  color={ACTION_COLORS[entry.action] || 'default'}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 4, md: 2, lg: 1 }}>
                <Typography variant="body2">{entry.elementType}</Typography>
              </Grid>
              <Grid size={{ xs: 4, md: 4, lg: 6 }}>
                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                  {entry.elementName}
                </Typography>
              </Grid>
            </Grid>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('elementId')}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 1 }}>
                  {entry.elementId}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary">
                  {t('user')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {entry.user}
                </Typography>
              </Grid>
              {entry.previousValue && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('previousValue')}
                  </Typography>
                  <ValueDisplay data={entry.previousValue} />
                </Grid>
              )}
              {entry.newValue && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('newValue')}
                  </Typography>
                  <ValueDisplay data={entry.newValue} />
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}

      {filteredAndSorted.length === 0 && (
        <Typography sx={{ py: 4, textAlign: 'center' }} color="text.secondary">
          {t('noEntries')}
        </Typography>
      )}
    </Box>
  );
}
