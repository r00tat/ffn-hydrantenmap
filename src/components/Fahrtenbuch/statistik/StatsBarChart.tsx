'use client';

import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { StatsSeries } from '../../../common/fahrtenbuchStatsSeries';
import { stackColor } from './statsPresentation';

export interface StatsBarChartProps {
  series: StatsSeries;
  /** Beschriftung eines Abschnitts auf der Achse. */
  labelOf: (key: string) => string;
  /** Beschriftung einer gestapelten Reihe in Legende und Tooltip. */
  stackLabelOf: (key: string, fallback: string) => string;
  /** Wonach gestapelt wurde — bestimmt die Farbwahl. */
  stackBy: string;
  valueFormatter: (value: number | null) => string;
  /** Klick auf einen Balken; ohne den ist das Diagramm nur Anzeige. */
  onBucketClick?: (bucketKey: string) => void;
  height?: number;
  yAxisLabel?: string;
}

/**
 * Gestapeltes Balkendiagramm über eine `StatsSeries` — die gemeinsame
 * Darstellung für Zeitreihe und Wochentage.
 *
 * Bei einer Reihe ohne Stapelung (`stackBy: 'none'`) trägt die einzige Reihe
 * keine Legende: „total" wäre kein Erkenntnisgewinn.
 */
export default function StatsBarChart({
  series,
  labelOf,
  stackLabelOf,
  stackBy,
  valueFormatter,
  onBucketClick,
  height = 300,
  yAxisLabel,
}: StatsBarChartProps) {
  const t = useTranslations('fahrtenbuch');
  const theme = useTheme();

  const labels = useMemo(
    () => series.points.map((point) => labelOf(point.key)),
    [series.points, labelOf],
  );

  const chartSeries = useMemo(
    () =>
      series.stacks.map((stack, index) => ({
        id: stack.key,
        // Alle Reihen im selben Stapel — sonst stünden die Zwecke eines Monats
        // nebeneinander und die Balkenhöhe wäre nicht mehr die Monatssumme.
        stack: 'total',
        label: stackLabelOf(stack.key, stack.label),
        color: stackColor(theme, stackBy, stack.key, index),
        data: series.points.map((point) => point.values[stack.key] ?? 0),
        valueFormatter,
      })),
    [series, stackBy, stackLabelOf, theme, valueFormatter],
  );

  if (series.points.length === 0 || series.stacks.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        {t('stats.noData')}
      </Typography>
    );
  }

  return (
    <BarChart
      height={height}
      xAxis={[
        { scaleType: 'band', data: labels, tickLabelStyle: { fontSize: 11 } },
      ]}
      yAxis={[{ label: yAxisLabel, width: 64 }]}
      series={chartSeries}
      hideLegend={stackBy === 'none'}
      onItemClick={
        onBucketClick
          ? (_event, item) => {
              const point = series.points[item.dataIndex];
              if (point) onBucketClick(point.key);
            }
          : undefined
      }
      sx={onBucketClick ? { '& .MuiBarElement-root': { cursor: 'pointer' } } : undefined}
    />
  );
}
