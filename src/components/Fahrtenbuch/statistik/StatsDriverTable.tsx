'use client';

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DriverStat } from '../../../common/fahrtenbuchStatsSeries';
import { splitDuration } from './statsPresentation';

export interface StatsDriverTableProps {
  drivers: DriverStat[];
  /** Einheiten der Gruppe, für die je eine Spalte erscheint (`km`, `h`). */
  units: string[];
  /** Klick auf eine Zeile setzt oder löst den Fahrer-Filter. */
  onDriverClick?: (driverKey: string) => void;
  selectedKey?: string;
  maxRows?: number;
}

type SortKey = 'name' | 'trips' | 'duration' | 'lastEntry' | `unit:${string}`;

/**
 * Fahrer-Auswertung: wer wie viel gefahren ist — und wer seit wann nicht mehr.
 *
 * Sortierbar, weil „Top Fahrer" mehrere Fragen sind: die meisten Fahrten, die
 * meisten Kilometer oder die längste Zeit im Fahrzeug. Die Spalte „letzte
 * Fahrt" beantwortet die Gegenfrage nach der Fahrpraxis.
 */
export default function StatsDriverTable({
  drivers,
  units,
  onDriverClick,
  selectedKey,
  maxRows = 25,
}: StatsDriverTableProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();
  const [sortKey, setSortKey] = useState<SortKey>('trips');
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const value = (driver: DriverStat): number | string => {
      if (sortKey === 'name') return driver.name.toLowerCase();
      if (sortKey === 'trips') return driver.trips;
      if (sortKey === 'duration') return driver.durationMinutes;
      if (sortKey === 'lastEntry') return driver.lastEntryAt ?? '';
      return driver.counterTotals[sortKey.slice('unit:'.length)] ?? 0;
    };
    return [...drivers].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const compare =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right));
      return descending ? -compare : compare;
    });
  }, [drivers, sortKey, descending]);

  const shown = sorted.slice(0, maxRows);

  const sortHandler = (key: SortKey) => () => {
    if (key === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(key);
    // Neue Spalte: Zahlen absteigend (die größte zuerst ist die Frage), Namen
    // aufsteigend.
    setDescending(key !== 'name');
  };

  const header = (key: SortKey, label: string, align: 'left' | 'right') => (
    <TableCell align={align} sortDirection={sortKey === key ? (descending ? 'desc' : 'asc') : false}>
      <TableSortLabel
        active={sortKey === key}
        direction={descending ? 'desc' : 'asc'}
        onClick={sortHandler(key)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  if (drivers.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        {t('stats.noData')}
      </Typography>
    );
  }

  return (
    <>
      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {header('name', t('stats.driverTable.name'), 'left')}
              {header('trips', t('stats.kpi.trips'), 'right')}
              {units.map((unit) =>
                header(`unit:${unit}`, unit, 'right'),
              )}
              {header('duration', t('stats.kpi.duration'), 'right')}
              <TableCell align="right">{t('stats.driverTable.vehicles')}</TableCell>
              {header('lastEntry', t('stats.driverTable.lastTrip'), 'right')}
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((driver) => {
              const duration = splitDuration(driver.durationMinutes);
              return (
                <TableRow
                  key={driver.key}
                  hover={!!onDriverClick}
                  selected={driver.key === selectedKey}
                  onClick={onDriverClick ? () => onDriverClick(driver.key) : undefined}
                  sx={onDriverClick ? { cursor: 'pointer' } : undefined}
                >
                  <TableCell>{driver.name}</TableCell>
                  <TableCell align="right">{format.number(driver.trips)}</TableCell>
                  {units.map((unit) => (
                    <TableCell align="right" key={unit}>
                      {format.number(driver.counterTotals[unit] ?? 0, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    {t('stats.hoursMinutes', {
                      hours: duration.hours,
                      minutes: duration.minutes,
                    })}
                  </TableCell>
                  <TableCell align="right">{driver.vehicleCount}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {driver.lastEntryAt
                      ? format.dateTime(new Date(driver.lastEntryAt), {
                          dateStyle: 'short',
                        })
                      : ''}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {sorted.length > shown.length && (
        <Typography variant="caption" color="text.secondary">
          {t('stats.driverTable.truncated', {
            shown: shown.length,
            total: sorted.length,
          })}
        </Typography>
      )}
    </>
  );
}
