'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  FAHRT_ZWECKE,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';

export interface FahrtenbuchListProps {
  entries: FahrtenbuchEntry[];
  /**
   * Alle Fahrzeuge der Gruppe — auch stillgelegte, damit deren alte Fahrten
   * noch eine Zählerbeschriftung bekommen. Der Filter zeigt nur aktive.
   */
  vehicles: FahrtenbuchVehicle[];
  /** Blendet den Fahrzeugfilter aus — in der Fahrzeug-Ansicht überflüssig. */
  hideVehicleFilter?: boolean;
  onEdit: (entry: FahrtenbuchEntry) => void;
  onDelete: (entry: FahrtenbuchEntry) => void;
}

export default function FahrtenbuchList({
  entries,
  vehicles,
  hideVehicleFilter,
  onEdit,
  onDelete,
}: FahrtenbuchListProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [zweckFilter, setZweckFilter] = useState('');
  const [onlyDefects, setOnlyDefects] = useState(false);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (vehicleFilter && e.vehicleId !== vehicleFilter) return false;
        if (zweckFilter && e.zweck !== zweckFilter) return false;
        if (onlyDefects && !e.defekt) return false;
        return true;
      }),
    [entries, vehicleFilter, zweckFilter, onlyDefects],
  );

  /**
   * Zählerzusammenfassung einer Fahrt. `startEnd`-Zähler zeigen die Differenz,
   * `reading`-Zähler den abgelesenen Stand. Ohne passende Definition (Fahrzeug
   * noch nicht geladen) bleibt die Zelle leer.
   */
  const counterSummary = (entry: FahrtenbuchEntry) =>
    Object.entries(entry.counters ?? {})
      .map(([id, reading]) => {
        const def = vehicles
          .find((v) => v.id === entry.vehicleId)
          ?.counters?.find((c) => c.id === id);
        if (!def) return undefined;
        if (def.mode === 'startEnd' && reading.diff !== undefined) {
          return `${reading.diff} ${def.unit}`;
        }
        return reading.end !== undefined
          ? `${reading.end} ${def.unit}`
          : undefined;
      })
      .filter(Boolean)
      .join(' · ');

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {!hideVehicleFilter && (
          <TextField
            select
            size="small"
            label={t('filters.vehicle')}
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{t('filters.all')}</MenuItem>
            {vehicles
              .filter((v) => v.active !== false)
              .map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label={t('filters.zweck')}
          value={zweckFilter}
          onChange={(e) => setZweckFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t('filters.all')}</MenuItem>
          {FAHRT_ZWECKE.map((z) => (
            <MenuItem key={z} value={z}>
              {t(`zwecke.${z}` as 'zwecke.einsatz')}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={onlyDefects}
              onChange={(e) => setOnlyDefects(e.target.checked)}
            />
          }
          label={t('filters.onlyDefects')}
        />
      </Stack>

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{t('noEntries')}</Typography>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('abfahrt')}</TableCell>
                {!hideVehicleFilter && <TableCell>{t('vehicle')}</TableCell>}
                <TableCell>{t('driver')}</TableCell>
                <TableCell>{t('zweck')}</TableCell>
                <TableCell>{t('ziel')}</TableCell>
                <TableCell>{t('counterDiff')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {format.dateTime(new Date(entry.abfahrt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  {!hideVehicleFilter && (
                    <TableCell>{entry.vehicleName}</TableCell>
                  )}
                  <TableCell>{entry.driverName}</TableCell>
                  <TableCell>
                    {t(`zwecke.${entry.zweck}` as 'zwecke.einsatz')}
                  </TableCell>
                  <TableCell>{entry.ziel}</TableCell>
                  <TableCell>{counterSummary(entry)}</TableCell>
                  <TableCell align="right">
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
                    >
                      {entry.defekt && (
                        <Tooltip title={t('defectReported')}>
                          <WarningAmberIcon color="warning" fontSize="small" />
                        </Tooltip>
                      )}
                      <Tooltip title={t('editEntry')}>
                        <span>
                          <IconButton size="small" onClick={() => onEdit(entry)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={t('deleteEntry')}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onDelete(entry)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
