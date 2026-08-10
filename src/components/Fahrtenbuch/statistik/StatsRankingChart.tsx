'use client';

import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { StatsSlice } from '../../../common/fahrtenbuchStatsSeries';
import { seriesColor } from './statsPresentation';

export interface StatsRankingChartProps {
  slices: StatsSlice[];
  valueFormatter: (value: number | null) => string;
  /** Klick auf einen Balken — der Einstieg in den Filter dieses Eintrags. */
  onSliceClick?: (key: string) => void;
  /** Hebt den aktuell gefilterten Eintrag hervor. */
  selectedKey?: string;
  maxBars?: number;
  xAxisLabel?: string;
}

/**
 * Waagrechte Rangliste — Fahrzeuge oder Fahrer nach der gewählten Kennzahl.
 *
 * Waagrecht, weil die Namen sonst nicht lesbar wären: „RLFA 2000" quer unter
 * einem senkrechten Balken ist auf dem Handy nicht zu entziffern.
 */
export default function StatsRankingChart({
  slices,
  valueFormatter,
  onSliceClick,
  selectedKey,
  maxBars = 12,
  xAxisLabel,
}: StatsRankingChartProps) {
  const t = useTranslations('fahrtenbuch');
  const theme = useTheme();

  // Von unten nach oben gelesen: Das Diagramm zeichnet den ersten Datenpunkt
  // unten, der größte Wert gehört aber nach oben.
  const shown = useMemo(
    () => slices.slice(0, maxBars).reverse(),
    [slices, maxBars],
  );

  if (shown.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        {t('stats.noData')}
      </Typography>
    );
  }

  return (
    <BarChart
      layout="horizontal"
      height={Math.max(160, shown.length * 32 + 80)}
      yAxis={[
        {
          scaleType: 'band',
          data: shown.map((slice) => slice.label),
          width: 120,
          tickLabelStyle: { fontSize: 11 },
          // Der gefilterte Eintrag bleibt hervorgehoben; ohne das wäre nach
          // einem Klick nicht mehr zu sehen, worauf gefiltert wurde.
          colorMap: {
            type: 'ordinal',
            values: shown.map((slice) => slice.label),
            colors: shown.map((slice) =>
              slice.key === selectedKey
                ? theme.palette.secondary.main
                : theme.palette.primary.main,
            ),
          },
        },
      ]}
      xAxis={[{ label: xAxisLabel }]}
      series={[{ data: shown.map((slice) => slice.value), valueFormatter }]}
      hideLegend
      onItemClick={
        onSliceClick
          ? (_event, item) => {
              const slice = shown[item.dataIndex];
              if (slice) onSliceClick(slice.key);
            }
          : undefined
      }
      sx={
        onSliceClick
          ? { '& .MuiBarElement-root': { cursor: 'pointer' } }
          : undefined
      }
    />
  );
}
