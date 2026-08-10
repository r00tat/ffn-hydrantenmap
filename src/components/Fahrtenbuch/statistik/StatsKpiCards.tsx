'use client';

import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import type { StatsSummary } from '../../../common/fahrtenbuchStatsSeries';
import { splitDuration } from './statsPresentation';

export interface StatsKpiCardsProps {
  summary: StatsSummary;
}

interface Kpi {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/**
 * Die Kennzahlen des gewählten Ausschnitts.
 *
 * Darunter steht ein Hinweis, wenn Fahrten ohne Zählerstand oder mit
 * geschätzten Ständen im Zeitraum liegen. Ein Fahrtenbuch ist ein
 * Nachweisdokument — eine Summe darüber darf nicht vollständiger aussehen, als
 * die Einträge sind.
 */
export default function StatsKpiCards({ summary }: StatsKpiCardsProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();

  const number = (value: number, digits = 1) =>
    format.number(value, { maximumFractionDigits: digits });

  const duration = splitDuration(summary.durationMinutes);

  const kpis: Kpi[] = [
    {
      key: 'trips',
      label: t('stats.kpi.trips'),
      value: format.number(summary.trips),
    },
    ...summary.counterTotals.map((total) => ({
      key: `unit-${total.unit}`,
      label: t('stats.kpi.counterTotal', { unit: total.unit }),
      value: `${number(total.value)} ${total.unit}`,
      hint: t('stats.kpi.counterTotalHint', { count: total.trips }),
    })),
    {
      key: 'duration',
      label: t('stats.kpi.duration'),
      value: t('stats.hoursMinutes', {
        hours: duration.hours,
        minutes: duration.minutes,
      }),
    },
    ...(summary.distancePerTrip !== undefined
      ? [
          {
            key: 'perTrip',
            label: t('stats.kpi.distancePerTrip'),
            value: `${number(summary.distancePerTrip)} km`,
          },
        ]
      : []),
    ...(summary.fuelLiters > 0
      ? [
          {
            key: 'fuel',
            label: t('stats.kpi.fuel'),
            value: `${number(summary.fuelLiters)} ${t('fuelUnit')}`,
            hint: summary.fuelTotals
              .map(
                (total) =>
                  `${t(`fuel.${total.fuel}` as 'fuel.diesel')}: ${number(
                    total.liters,
                  )} ${t('fuelUnit')}`,
              )
              .join(' · '),
          },
        ]
      : []),
    ...(summary.consumptionPer100Km !== undefined
      ? [
          {
            key: 'consumption',
            label: t('stats.kpi.consumption'),
            value: `${number(summary.consumptionPer100Km)} ${t(
              'stats.consumptionUnit',
            )}`,
            hint: t('stats.consumptionHint'),
          },
        ]
      : []),
    {
      key: 'defects',
      label: t('stats.kpi.defects'),
      value: format.number(summary.defects),
    },
  ];

  const quality: string[] = [];
  if (summary.tripsWithoutCounter > 0) {
    quality.push(
      t('stats.quality.missingCounters', { count: summary.tripsWithoutCounter }),
    );
  }
  if (summary.estimatedTrips > 0) {
    quality.push(
      t('stats.quality.estimated', { count: summary.estimatedTrips }),
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        {kpis.map((kpi) => (
          <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={kpi.key}>
            <Tooltip title={kpi.hint ?? ''}>
              <Paper sx={{ p: 1.5, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">
                  {kpi.label}
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                  {kpi.value}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
        ))}
      </Grid>
      {quality.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {quality.join(' ')}
        </Alert>
      )}
    </>
  );
}
