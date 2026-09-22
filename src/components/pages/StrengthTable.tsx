'use client';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useContext, useMemo } from 'react';
import { FirecallItem } from '../firebase/firestore';
import { formatTimestamp } from '../../common/time-format';
import { FirecallContext } from '../../hooks/useFirecall';
import { StrengthGroup, StrengthRow, calculateStrength } from './fahrzeuge-utils';

const COLUMNS = 8;

function StrengthRows({ rows }: { rows: StrengthRow[] }) {
  return (
    <>
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
    </>
  );
}

function TotalRow({ label, group }: { label: string; group: StrengthGroup }) {
  const t = useTranslations('einsatzmittel');
  return (
    <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
      <TableCell>{label}</TableCell>
      <TableCell>{t('totalFw', { count: group.totalFw })}</TableCell>
      <TableCell>
        {Object.entries(group.typCounts).map(([typ, count]) => (
          <Typography variant="body2" sx={{ fontWeight: 'bold' }} key={typ}>
            {count} {typ}
          </Typography>
        ))}
      </TableCell>
      <TableCell align="right">{group.totalMann}</TableCell>
      <TableCell align="right">{group.totalAts}</TableCell>
      <TableCell colSpan={3} />
    </TableRow>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={COLUMNS}
        sx={{ fontWeight: 'bold', backgroundColor: 'action.hover' }}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export default function StrengthTable({ items }: { items: FirecallItem[] }) {
  const t = useTranslations('einsatzmittel');
  const { crewAssignments } = useContext(FirecallContext);
  const summary = useMemo(
    () => calculateStrength(items, crewAssignments),
    [items, crewAssignments]
  );
  const { rows, eigene, fremde } = summary;

  if (rows.length === 0) return null;

  // Ohne Fremdkräfte bleibt die Tabelle, wie sie war: eine Liste, eine
  // Gesamtzeile. Ein leerer Abschnitt „Fremdkräfte" an jedem Einsatz, an dem
  // nur die eigene Wehr ausgerückt ist, wäre Ballast.
  const split = fremde.rows.length > 0;

  return (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('cols.name')}</TableCell>
            <TableCell>{t('cols.fwShort')}</TableCell>
            <TableCell>{t('cols.type')}</TableCell>
            <TableCell align="right">{t('cols.strength')}</TableCell>
            <TableCell align="right">{t('cols.ats')}</TableCell>
            <TableCell>{t('cols.alarmierung')}</TableCell>
            <TableCell>{t('cols.eintreffen')}</TableCell>
            <TableCell>{t('cols.abruecken')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {split ? (
            <>
              {/* Zuerst die eigenen Kräfte: Die Einsatzleitung führt sie, und
                  die Frage „wie viele habe ich" steht vor der Frage „wer ist
                  sonst noch da". */}
              <SectionRow label={t('ownForces')} />
              <StrengthRows rows={eigene.rows} />
              <TotalRow label={t('ownForcesTotal')} group={eigene} />
              <SectionRow label={t('foreignForces')} />
              <StrengthRows rows={fremde.rows} />
              <TotalRow label={t('foreignForcesTotal')} group={fremde} />
            </>
          ) : (
            <StrengthRows rows={rows} />
          )}
          <TotalRow label={t('total')} group={summary} />
        </TableBody>
      </Table>
    </TableContainer>
  );
}
