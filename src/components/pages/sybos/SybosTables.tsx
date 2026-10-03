'use client';

import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import { CrewAssignment } from '../../firebase/firestore';
import { StrengthRow } from '../fahrzeuge-utils';
import type { FahrtRow, MeasurementTable, SpectrumRow, TruppRow } from './sybosExtras';
import { formatSybosTime, MaterialCount } from './sybosReport';

/**
 * Eine Tabelle mit Überschrift; ohne Zeilen bleibt sie ganz weg.
 *
 * Bewusst schlichte HTML-Tabellen statt Kopierfelder: Kräfte, Mannschaft und
 * Material werden in Sybos Zeile für Zeile ausgewählt — von Hand oder über
 * eine Browser-Erweiterung, die Tabellen ausliest. Die Zeilen kommen
 * alphabetisch sortiert aus `sybosReport.ts`, so wie sie in Sybos stehen.
 */
export function TitledTable({
  title,
  head,
  rows,
  action,
}: {
  title: string;
  head: ReactNode[];
  rows: ReactNode[][];
  action?: ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <Box>
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" gutterBottom sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {action}
        </Box>
      )}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {head.map((h, i) => (
                <TableCell key={i} sx={{ fontWeight: 'bold' }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, r) => (
              <TableRow key={r}>
                {row.map((cell, c) => (
                  <TableCell key={c}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

export function StrengthRowsTable({ title, rows }: { title: string; rows: StrengthRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[
        t('name'),
        t('fw'),
        t('type'),
        t('persons'),
        t('ats'),
        t('alarmierung'),
        t('eintreffen'),
        t('abruecken'),
      ]}
      rows={rows.map((r) => [
        r.name,
        r.fw || '',
        r.typ,
        r.mann || '',
        r.ats || '',
        formatSybosTime(r.alarmierung),
        formatSybosTime(r.eintreffen),
        formatSybosTime(r.abruecken),
      ])}
    />
  );
}

export function CrewTable({ title, crew }: { title: string; crew: CrewAssignment[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('name'), t('funktion'), t('vehicle')]}
      rows={crew.map((c) => [c.name, c.funktion, c.vehicleName || ''])}
    />
  );
}

export function MaterialTable({ title, material }: { title: string; material: MaterialCount[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('material'), t('count')]}
      rows={material.map((m) => [m.label, m.count])}
    />
  );
}

export function TruppTable({ title, rows }: { title: string; rows: TruppRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[
        t('trupp'),
        t('mitglieder'),
        t('einheit'),
        t('auftrag'),
        t('abmarsch'),
        t('rueckkehr'),
        t('dauer'),
        t('druck'),
      ]}
      rows={rows.map((r) => [
        r.trupp,
        r.mitglieder,
        r.einheit,
        r.auftrag,
        r.abmarsch,
        r.rueckkehr,
        r.dauer,
        r.druck,
      ])}
    />
  );
}

export function MeasurementTableView({
  table,
  action,
}: {
  table: MeasurementTable;
  action?: ReactNode;
}) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={table.layerName}
      action={action}
      head={[t('messpunkt'), t('zeit'), ...table.columns.map((c) => c.header)]}
      rows={table.rows.map((r) => [r.name, r.time, ...r.values])}
    />
  );
}

export function SpectrumTable({ title, rows }: { title: string; rows: SpectrumRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('probe'), t('nuklid'), t('geraet'), t('beginn'), t('dauer'), t('beschreibung')]}
      rows={rows.map((r) => [r.probe, r.nuklid, r.geraet, r.beginn, r.dauer, r.beschreibung])}
    />
  );
}

export function FahrtenTable({ title, rows }: { title: string; rows: FahrtRow[] }) {
  const t = useTranslations('sybos.cols');
  return (
    <TitledTable
      title={title}
      head={[t('vehicle'), t('fahrer'), t('abfahrt'), t('ankunft'), t('km'), t('ziel')]}
      rows={rows.map((r) => [r.fahrzeug, r.fahrer, r.abfahrt, r.ankunft, r.km, r.ziel])}
    />
  );
}
