'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';
import { formatCurrency } from '../../common/kostenersatz';
import {
  fetchSumupTransactions,
  SumUpTransactionRow,
} from './sumupTransactionActions';

type SortKey = keyof SumUpTransactionRow;
type SortDir = 'asc' | 'desc';

function formatDate(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return <Chip color="success" label="Bezahlt" size="small" />;
    case 'pending':
      return <Chip color="warning" label="Ausstehend" size="small" />;
    case 'failed':
      return <Chip color="error" label="Fehlgeschlagen" size="small" />;
    case 'expired':
      return <Chip color="default" label="Abgelaufen" size="small" />;
    default:
      return <Chip label={status} size="small" />;
  }
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'recipientName', label: 'Empfänger' },
  { key: 'totalSum', label: 'Betrag' },
  { key: 'sumupPaymentStatus', label: 'Status' },
  { key: 'createdAt', label: 'Erstellt' },
  { key: 'sumupPaidAt', label: 'Bezahlt' },
  { key: 'sumupTransactionCode', label: 'Transaktionscode' },
  { key: 'firecallName', label: 'Einsatz' },
];

export default function SumUpTransactionList() {
  const [rows, setRows] = useState<SumUpTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSumupTransactions();
      setRows(data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Transaktionen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">SumUp Transaktionen</Typography>
          <Tooltip title="Aktualisieren">
            <span>
              <IconButton onClick={loadData} disabled={loading} size="small">
                {loading ? <CircularProgress size={18} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">
            Keine SumUp-Transaktionen vorhanden.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <TableSortLabel
                        active={sortKey === col.key}
                        direction={sortKey === col.key ? sortDir : 'asc'}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={`${row.firecallId}-${row.calculationId}`}>
                    <TableCell>
                      {row.recipientName ? (
                        <Link component={NextLink} href={`/einsatz/${row.firecallId}/kostenersatz/${row.calculationId}`}>
                          {row.recipientName}
                        </Link>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{formatCurrency(row.totalSum)}</TableCell>
                    <TableCell>
                      <StatusChip status={row.sumupPaymentStatus} />
                    </TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell>{formatDate(row.sumupPaidAt)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {row.sumupTransactionCode || '-'}
                    </TableCell>
                    <TableCell>
                      <Link component={NextLink} href={`/einsatz/${row.firecallId}/kostenersatz`}>
                        {row.firecallName}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
