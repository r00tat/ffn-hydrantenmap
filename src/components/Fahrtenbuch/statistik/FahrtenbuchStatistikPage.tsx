'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { FahrtZweck } from '../../../common/fahrtenbuch';
import {
  browserTimeZone,
  bucketDayRange,
  counterUnitsOf,
  filterStatsEntries,
  suggestGranularity,
  type StatsFilter,
  type StatsGranularity,
  type StatsMetric,
} from '../../../common/fahrtenbuchStats';
import {
  buildBreakdown,
  buildDriverStats,
  buildFuelStats,
  buildStatsSummary,
  buildTimeSeries,
  buildWeekdaySeries,
  NO_DRIVER_STACK_KEY,
  OTHER_STACK_KEY,
  type StatsStackBy,
} from '../../../common/fahrtenbuchStatsSeries';
import {
  presetRange,
  type StatsRangePreset,
} from '../../../common/fahrtenbuchStatsRange';
import { zonedDayRange, zonedParts } from '../../../common/zonedDay';
import useFahrtenbuchEntries from '../../../hooks/useFahrtenbuchEntries';
import useFahrtenbuchGroup from '../../../hooks/useFahrtenbuchGroup';
import useFahrtenbuchVehicles from '../../../hooks/useFahrtenbuchVehicles';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import FahrtenbuchList from '../FahrtenbuchList';
import StatsBarChart from './StatsBarChart';
import StatsDriverTable from './StatsDriverTable';
import StatsFilterBar from './StatsFilterBar';
import StatsFuelSection from './StatsFuelSection';
import StatsKpiCards from './StatsKpiCards';
import StatsRankingChart from './StatsRankingChart';
import StatsZweckChart from './StatsZweckChart';
import {
  bucketLabel,
  metricUnitLabel,
  weekdayLabel,
} from './statsPresentation';

/**
 * Obergrenze der geladenen Fahrten. Ein Jahr einer Feuerwehr liegt bei einigen
 * hundert Einträgen; die Grenze fängt einen versehentlich riesigen Zeitraum ab,
 * bevor der Browser Zehntausende Dokumente hält. Dieselbe Bauweise wie beim
 * PDF-Export, nur kleiner — hier ist keine vollständige Ausgabe das Ziel,
 * sondern eine Auswertung, und der Benutzer bekommt einen Hinweis.
 */
const MAX_ENTRIES = 2000;

const GRANULARITIES: StatsGranularity[] = ['day', 'week', 'month', 'year'];
const STACK_OPTIONS: StatsStackBy[] = ['zweck', 'vehicle', 'driver', 'none'];

export interface FahrtenbuchStatistikPageProps {
  /** Vorauswahl aus dem Link auf der Fahrzeugseite. */
  initialVehicleId?: string;
}

/**
 * Auswertung des Fahrtenbuchs.
 *
 * Ein Filterzustand trägt alles: Zeitraum, Fahrzeuge, Zwecke, Fahrer. Jedes
 * Diagramm rechnet aus derselben gefilterten Menge, und ein Klick in ein
 * Diagramm verengt den Filter. Nur der Zeitraum löst eine neue Abfrage aus —
 * jeder andere Drill-down-Schritt ist ein Neurechnen im Browser.
 */
export default function FahrtenbuchStatistikPage({
  initialVehicleId,
}: FahrtenbuchStatistikPageProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();
  const locale = useLocale();
  const { isAuthorized } = useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();

  const timeZone = useMemo(() => browserTimeZone(), []);
  const today = useMemo(
    () =>
      zonedParts(new Date().toISOString(), timeZone)?.isoDay ??
      new Date().toISOString().slice(0, 10),
    [timeZone],
  );

  const [preset, setPreset] = useState<StatsRangePreset>('thisYear');
  const [filter, setFilter] = useState<StatsFilter>(() => ({
    ...(presetRange('thisYear', today) ?? { from: today, to: today }),
    vehicleIds: initialVehicleId ? [initialVehicleId] : [],
    zwecke: [],
  }));
  const [metricOverride, setMetricOverride] = useState<StatsMetric>();
  const [granularityOverride, setGranularityOverride] =
    useState<StatsGranularity>();
  const [stackBy, setStackBy] = useState<StatsStackBy>('zweck');

  const { vehicles, vehiclesById } = useFahrtenbuchVehicles(groupId);
  const units = useMemo(() => counterUnitsOf(vehicles), [vehicles]);

  /**
   * Ohne eigene Wahl die Strecke, wenn die Gruppe Kilometer zählt — das ist die
   * Frage, mit der man eine Fahrtenbuch-Statistik öffnet. Eine Gruppe mit nur
   * Booten bekommt die Fahrtenzahl.
   */
  const metric: StatsMetric =
    metricOverride ?? (units.includes('km') ? 'unit:km' : 'trips');
  const granularity =
    granularityOverride ?? suggestGranularity(filter.from, filter.to);

  const { fromIso, toIso } = useMemo(
    () => zonedDayRange(filter.from, filter.to, timeZone),
    [filter.from, filter.to, timeZone],
  );
  const entries = useFahrtenbuchEntries(groupId, {
    fromIso,
    toIso,
    pageSize: MAX_ENTRIES,
  });

  const filtered = useMemo(
    () => filterStatsEntries(entries, filter, timeZone),
    [entries, filter, timeZone],
  );

  const summary = useMemo(
    () => buildStatsSummary(filtered, vehiclesById),
    [filtered, vehiclesById],
  );
  const timeSeries = useMemo(
    () =>
      buildTimeSeries(filtered, {
        vehiclesById,
        metric,
        granularity,
        timeZone,
        from: filter.from,
        to: filter.to,
        stackBy,
      }),
    [filtered, vehiclesById, metric, granularity, timeZone, filter.from, filter.to, stackBy],
  );
  const fuelSeries = useMemo(
    () =>
      buildTimeSeries(filtered, {
        vehiclesById,
        metric: 'fuel',
        granularity,
        timeZone,
        from: filter.from,
        to: filter.to,
        stackBy: 'fuel',
      }),
    [filtered, vehiclesById, granularity, timeZone, filter.from, filter.to],
  );
  const weekdaySeries = useMemo(
    () => buildWeekdaySeries(filtered, { vehiclesById, metric, timeZone }),
    [filtered, vehiclesById, metric, timeZone],
  );
  const zweckSlices = useMemo(
    () => buildBreakdown(filtered, { vehiclesById, metric, dimension: 'zweck' }),
    [filtered, vehiclesById, metric],
  );
  const vehicleSlices = useMemo(
    () =>
      buildBreakdown(filtered, { vehiclesById, metric, dimension: 'vehicle' }),
    [filtered, vehiclesById, metric],
  );
  const drivers = useMemo(
    () => buildDriverStats(filtered, vehiclesById),
    [filtered, vehiclesById],
  );
  const fuelStats = useMemo(
    () => buildFuelStats(filtered, vehiclesById),
    [filtered, vehiclesById],
  );

  const unitLabel = metricUnitLabel(metric, {
    trips: t('stats.units.trips'),
    duration: 'h',
    fuel: t('fuelUnit'),
  });

  /** Werte der gewählten Kennzahl — Dauer in Stunden, sonst in ihrer Einheit. */
  const metricFormatter = useCallback(
    (value: number | null) => {
      if (value === null) return '';
      if (metric === 'duration') {
        return `${format.number(value / 60, { maximumFractionDigits: 1 })} h`;
      }
      const digits = metric === 'trips' ? 0 : 1;
      return `${format.number(value, { maximumFractionDigits: digits })} ${unitLabel}`;
    },
    [metric, format, unitLabel],
  );

  const bucketLabelOf = useCallback(
    (key: string) => bucketLabel(locale, key, granularity, t('stats.weekPrefix')),
    [locale, granularity, t],
  );

  const stackLabelOf = useCallback(
    (key: string, fallback: string) => {
      if (key === OTHER_STACK_KEY) return t('stats.otherStack');
      if (key === NO_DRIVER_STACK_KEY) return t('stats.noDriver');
      if (stackBy === 'zweck') return t(`zwecke.${key}` as 'zwecke.einsatz');
      return fallback;
    },
    [stackBy, t],
  );

  /** Klick auf einen Balken der Zeitreihe: Zeitraum auf diesen Abschnitt. */
  const drillIntoBucket = useCallback(
    (bucketKey: string) => {
      const range = bucketDayRange(bucketKey, granularity);
      if (!range) return;
      setPreset('custom');
      // Das Raster bleibt nicht stehen: Für den engeren Zeitraum schlägt
      // `suggestGranularity` von selbst die feinere Stufe vor.
      setGranularityOverride(undefined);
      setFilter((current) => ({ ...current, from: range.from, to: range.to }));
    },
    [granularity],
  );

  const toggleVehicle = useCallback((vehicleId: string) => {
    setFilter((current) => ({
      ...current,
      vehicleIds: current.vehicleIds.includes(vehicleId)
        ? current.vehicleIds.filter((id) => id !== vehicleId)
        : [...current.vehicleIds, vehicleId],
    }));
  }, []);

  const toggleZweck = useCallback((zweck: FahrtZweck) => {
    setFilter((current) => ({
      ...current,
      zwecke: current.zwecke.includes(zweck)
        ? current.zwecke.filter((value) => value !== zweck)
        : [...current.zwecke, zweck],
    }));
  }, []);

  const toggleDriver = useCallback((driverKey: string) => {
    setFilter((current) => ({
      ...current,
      driverKey: current.driverKey === driverKey ? undefined : driverKey,
    }));
  }, []);

  const applyPreset = useCallback(
    (next: StatsRangePreset) => {
      setPreset(next);
      const range = presetRange(next, today);
      if (!range) return;
      setGranularityOverride(undefined);
      setFilter((current) => ({ ...current, ...range }));
    },
    [today],
  );

  const changeRange = useCallback((range: { from?: string; to?: string }) => {
    setPreset('custom');
    setFilter((current) => ({
      ...current,
      from: range.from ?? current.from,
      to: range.to ?? current.to,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilter((current) => ({
      from: current.from,
      to: current.to,
      vehicleIds: [],
      zwecke: [],
    }));
  }, []);

  const driverName = filter.driverKey
    ? drivers.find((driver) => driver.key === filter.driverKey)?.name
    : undefined;

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('loginRequired')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Tooltip title={t('backToOverview')}>
          <IconButton
            component={Link}
            href="/fahrtenbuch"
            aria-label={t('backToOverview')}
          >
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('stats.title')}
        </Typography>
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={t('group')}
            value={groupId ?? ''}
            onChange={(event) => setGroupId(event.target.value)}
            sx={{ minWidth: 180 }}
          >
            {groups.map((group) => (
              <MenuItem key={group.id} value={group.id}>
                {group.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      <StatsFilterBar
        filter={filter}
        preset={preset}
        onPresetChange={applyPreset}
        onRangeChange={changeRange}
        onRemoveVehicle={toggleVehicle}
        onRemoveZweck={toggleZweck}
        onRemoveDriver={() =>
          setFilter((current) => ({ ...current, driverKey: undefined }))
        }
        onToggleDefects={(value) =>
          setFilter((current) => ({ ...current, onlyDefects: value || undefined }))
        }
        onReset={resetFilters}
        vehiclesById={vehiclesById}
        driverName={driverName}
      />

      {entries.length >= MAX_ENTRIES && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('stats.tooManyEntries', { count: MAX_ENTRIES })}
        </Alert>
      )}

      <StatsKpiCards summary={summary} />

      <Paper sx={{ p: 2, mt: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('stats.overTime')}
          </Typography>
          <TextField
            select
            size="small"
            label={t('stats.metric')}
            value={metric}
            onChange={(event) =>
              setMetricOverride(event.target.value as StatsMetric)
            }
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="trips">{t('stats.metrics.trips')}</MenuItem>
            {units.map((unit) => (
              <MenuItem key={unit} value={`unit:${unit}`}>
                {unit === 'km'
                  ? t('stats.metrics.distance')
                  : unit === 'h'
                    ? t('stats.metrics.operatingHours')
                    : unit}
              </MenuItem>
            ))}
            <MenuItem value="duration">{t('stats.metrics.duration')}</MenuItem>
            <MenuItem value="fuel">{t('stats.metrics.fuel')}</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label={t('stats.stackBy')}
            value={stackBy}
            onChange={(event) =>
              setStackBy(event.target.value as StatsStackBy)
            }
            sx={{ minWidth: 160 }}
          >
            {STACK_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {t(`stats.stacks.${option}` as 'stats.stacks.zweck')}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={granularity}
            onChange={(_event, value) =>
              value && setGranularityOverride(value as StatsGranularity)
            }
          >
            {GRANULARITIES.map((option) => (
              <ToggleButton key={option} value={option}>
                {t(`stats.granularities.${option}` as 'stats.granularities.day')}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        <StatsBarChart
          series={timeSeries}
          labelOf={bucketLabelOf}
          stackLabelOf={stackLabelOf}
          stackBy={stackBy}
          valueFormatter={metricFormatter}
          yAxisLabel={unitLabel}
          onBucketClick={granularity === 'day' ? undefined : drillIntoBucket}
        />
        {granularity !== 'day' && (
          <Typography variant="caption" color="text.secondary">
            {t('stats.drillHint')}
          </Typography>
        )}
      </Paper>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('stats.byZweck')}
            </Typography>
            <StatsZweckChart
              slices={zweckSlices}
              valueFormatter={(value) => metricFormatter(value)}
              onZweckClick={toggleZweck}
              activeZwecke={filter.zwecke}
            />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('stats.byVehicle')}
            </Typography>
            <StatsRankingChart
              slices={vehicleSlices}
              valueFormatter={metricFormatter}
              onSliceClick={toggleVehicle}
              selectedKey={filter.vehicleIds[0]}
              xAxisLabel={unitLabel}
            />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('stats.byWeekday')}
            </Typography>
            <StatsBarChart
              series={weekdaySeries}
              labelOf={(key) => weekdayLabel(locale, key)}
              stackLabelOf={(key) => t(`zwecke.${key}` as 'zwecke.einsatz')}
              stackBy="zweck"
              valueFormatter={metricFormatter}
              yAxisLabel={unitLabel}
              height={260}
            />
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('stats.drivers')}
        </Typography>
        <StatsDriverTable
          drivers={drivers}
          units={units}
          onDriverClick={toggleDriver}
          selectedKey={filter.driverKey}
        />
      </Paper>

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('stats.fuel.title')}
        </Typography>
        <StatsFuelSection
          series={fuelSeries}
          fuelStats={fuelStats}
          bucketLabelOf={bucketLabelOf}
          onBucketClick={granularity === 'day' ? undefined : drillIntoBucket}
        />
      </Paper>

      <Divider sx={{ my: 3 }} />

      {/* Der letzte Schritt des Drill-downs: vom Diagramm zum Einzelbeleg.
          Ohne Bearbeiten-Knöpfe — geändert wird eine Fahrt dort, wo sie erfasst
          wurde, und eine Auswertung ist kein Erfassungswerkzeug. */}
      {/* `unmountOnExit`: Die Liste kann tausend Zeilen haben und wird bei
          jedem Filterklick neu gerechnet — solange sie zu ist, soll sie das
          nicht. */}
      <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>
            {t('stats.entriesInSelection', { count: filtered.length })}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FahrtenbuchList entries={filtered} vehicles={vehicles} hideFilters />
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
