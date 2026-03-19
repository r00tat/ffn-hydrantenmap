'use client';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { FirecallItem } from '../firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { calculateStrength } from './fahrzeuge-utils';

export default function StrengthTable({ items }: { items: FirecallItem[] }) {
  const { rows, totalMann, totalAts, totalFw, typCounts } = useMemo(
    () => calculateStrength(items),
    [items]
  );

  if (rows.length === 0) return null;

  return (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Bezeichnung</TableCell>
            <TableCell>FW</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell align="right">Stärke</TableCell>
            <TableCell align="right">ATS</TableCell>
            <TableCell>Alarmierung</TableCell>
            <TableCell>Eintreffen</TableCell>
            <TableCell>Abrücken</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.fw || ''}</TableCell>
              <TableCell>{row.typ}</TableCell>
              <TableCell align="right">{row.mann}</TableCell>
              <TableCell align="right">{row.ats}</TableCell>
              <TableCell>{row.alarmierung ? formatTimestamp(row.alarmierung) : ''}</TableCell>
              <TableCell>{row.eintreffen ? formatTimestamp(row.eintreffen) : ''}</TableCell>
              <TableCell>{row.abruecken ? formatTimestamp(row.abruecken) : ''}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
            <TableCell>Gesamt</TableCell>
            <TableCell>{totalFw} FW</TableCell>
            <TableCell>
              {Object.entries(typCounts).map(([typ, count]) => (
                <Typography variant="body2" fontWeight="bold" key={typ}>
                  {count} {typ}
                </Typography>
              ))}
            </TableCell>
            <TableCell align="right">{totalMann}</TableCell>
            <TableCell align="right">{totalAts}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
