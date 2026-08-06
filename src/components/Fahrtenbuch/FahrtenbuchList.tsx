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
import { counterLines, fuelLines, type CounterLine } from './entrySummary';

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

  const vehiclesById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );

  /**
   * In der Tabelle steht die Kurzform der Beschriftung („km-Stand" statt
   * „Kilometerstand"): Ausgeschrieben war die Zählerspalte breiter als die
   * Fahrstrecke daneben. Nur Preset-Zähler haben eine Kurzform — ein selbst
   * benannter Zähler behält seine Beschriftung.
   */
  const counterLabel = (line: CounterLine) => {
    if (!line.labelKey) return line.label;
    const shortKey = line.labelKey.replace(
      'counters.',
      'countersShort.',
    ) as 'countersShort.km';
    return t.has(shortKey) ? t(shortKey) : t(line.labelKey as 'counters.km');
  };

  /**
   * Die Zählerstände einer Fahrt: je Zähler eine beschriftete Zeile mit Start,
   * Ende und Differenz. Nur die Differenz zu zeigen reichte nicht — bei einem
   * Fahrzeug mit mehreren Zählern war nicht erkennbar, welche Zahl zu welchem
   * Zähler gehört, und der abgelesene Stand fehlte ganz.
   */
  const counterCell = (entry: FahrtenbuchEntry) => (
    <Stack spacing={0.25}>
      {counterLines(entry, vehiclesById.get(entry.vehicleId)).map((line) => (
        <Typography
          key={line.counterId}
          variant="body2"
          sx={{ whiteSpace: 'nowrap' }}
        >
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {counterLabel(line)}
            {': '}
          </Box>
          {line.value}
          {line.diff && (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {` (${line.diff})`}
            </Box>
          )}
        </Typography>
      ))}
    </Stack>
  );

  /**
   * Spaltenbreiten: Alle Spalten außer der Fahrstrecke schrumpfen auf ihren
   * Inhalt (`width: '1%'` plus `nowrap`), die Fahrstrecke bekommt mit
   * `width: '99%'` den ganzen Rest. Ohne das verteilte der Browser die Breite
   * gleichmäßig — auf einem breiten Monitor blieb die Fahrstrecke schmal,
   * während die Zählerspalte mehr Platz hatte als sie braucht.
   */
  const tightCell = { width: '1%', whiteSpace: 'nowrap' } as const;

  const fuelCell = (entry: FahrtenbuchEntry) => (
    <Stack spacing={0.25}>
      {fuelLines(entry).map(({ fuel, amount }) => (
        <Typography key={fuel} variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {t(`fuel.${fuel}` as 'fuel.diesel')}
            {': '}
          </Box>
          {`${amount} ${t('fuelUnit')}`}
        </Typography>
      ))}
    </Stack>
  );

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
                <TableCell sx={tightCell}>{t('abfahrt')}</TableCell>
                {!hideVehicleFilter && (
                  <TableCell sx={tightCell}>{t('vehicle')}</TableCell>
                )}
                <TableCell sx={tightCell}>{t('driver')}</TableCell>
                <TableCell sx={tightCell}>{t('zweck')}</TableCell>
                <TableCell sx={{ width: '99%' }}>{t('ziel')}</TableCell>
                <TableCell sx={tightCell}>{t('counterReadings')}</TableCell>
                <TableCell sx={tightCell}>{t('betriebsmittel')}</TableCell>
                <TableCell sx={tightCell} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={tightCell}>
                    {format.dateTime(new Date(entry.abfahrt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  {!hideVehicleFilter && (
                    <TableCell sx={tightCell}>{entry.vehicleName}</TableCell>
                  )}
                  <TableCell sx={tightCell}>{entry.driverName}</TableCell>
                  <TableCell sx={tightCell}>
                    {t(`zwecke.${entry.zweck}` as 'zwecke.einsatz')}
                  </TableCell>
                  <TableCell>{entry.ziel}</TableCell>
                  <TableCell sx={tightCell}>{counterCell(entry)}</TableCell>
                  <TableCell sx={tightCell}>{fuelCell(entry)}</TableCell>
                  <TableCell align="right" sx={tightCell}>
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
