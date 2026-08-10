'use client';

import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import type { FahrtZweck, FahrtenbuchVehicle } from '../../../common/fahrtenbuch';
import type { StatsFilter } from '../../../common/fahrtenbuchStats';
import {
  STATS_RANGE_PRESETS,
  type StatsRangePreset,
} from '../../../common/fahrtenbuchStatsRange';

export interface StatsFilterBarProps {
  filter: StatsFilter;
  preset: StatsRangePreset;
  onPresetChange: (preset: StatsRangePreset) => void;
  onRangeChange: (range: { from?: string; to?: string }) => void;
  onRemoveVehicle: (vehicleId: string) => void;
  onRemoveZweck: (zweck: FahrtZweck) => void;
  onRemoveDriver: () => void;
  onToggleDefects: (value: boolean) => void;
  onReset: () => void;
  vehiclesById: Map<string, FahrtenbuchVehicle>;
  /** Anzeigename des gefilterten Fahrers. */
  driverName?: string;
}

/**
 * Zeitraum-Auswahl und die aktiven Filter als entfernbare Chips.
 *
 * Die Filter entstehen im Regelfall durch einen Klick im Diagramm — ohne diese
 * Zeile wäre nach zwei Klicks nicht mehr erkennbar, welcher Ausschnitt gerade
 * gezeigt wird und wie man ihn verlässt.
 */
export default function StatsFilterBar({
  filter,
  preset,
  onPresetChange,
  onRangeChange,
  onRemoveVehicle,
  onRemoveZweck,
  onRemoveDriver,
  onToggleDefects,
  onReset,
  vehiclesById,
  driverName,
}: StatsFilterBarProps) {
  const t = useTranslations('fahrtenbuch');

  const hasFilters =
    filter.vehicleIds.length > 0 ||
    filter.zwecke.length > 0 ||
    !!filter.driverKey ||
    !!filter.onlyDefects;

  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center' }}
      >
        <TextField
          select
          size="small"
          label={t('stats.range')}
          value={preset}
          onChange={(event) =>
            onPresetChange(event.target.value as StatsRangePreset)
          }
          sx={{ minWidth: 180 }}
        >
          {STATS_RANGE_PRESETS.map((option) => (
            <MenuItem key={option} value={option}>
              {t(`stats.ranges.${option}` as 'stats.ranges.thisMonth')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          size="small"
          label={t('filters.from')}
          value={filter.from}
          onChange={(event) => onRangeChange({ from: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          size="small"
          label={t('filters.to')}
          value={filter.to}
          onChange={(event) => onRangeChange({ to: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={!!filter.onlyDefects}
              onChange={(event) => onToggleDefects(event.target.checked)}
            />
          }
          label={t('filters.onlyDefects')}
        />
      </Stack>

      {hasFilters && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: 'center' }}
        >
          {filter.vehicleIds.map((vehicleId) => (
            <Chip
              key={vehicleId}
              size="small"
              label={`${t('vehicle')}: ${
                vehiclesById.get(vehicleId)?.name ?? vehicleId
              }`}
              onDelete={() => onRemoveVehicle(vehicleId)}
            />
          ))}
          {filter.zwecke.map((zweck) => (
            <Chip
              key={zweck}
              size="small"
              label={`${t('zweck')}: ${t(
                `zwecke.${zweck}` as 'zwecke.einsatz',
              )}`}
              onDelete={() => onRemoveZweck(zweck)}
            />
          ))}
          {filter.driverKey && (
            <Chip
              size="small"
              label={`${t('driver')}: ${driverName ?? filter.driverKey}`}
              onDelete={onRemoveDriver}
            />
          )}
          {filter.onlyDefects && (
            <Chip
              size="small"
              color="warning"
              label={t('filters.onlyDefects')}
              onDelete={() => onToggleDefects(false)}
            />
          )}
          <Button size="small" onClick={onReset}>
            {t('filters.reset')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
