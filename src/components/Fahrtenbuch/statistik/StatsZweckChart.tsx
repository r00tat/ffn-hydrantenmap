'use client';

import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { FahrtZweck } from '../../../common/fahrtenbuch';
import type { StatsSlice } from '../../../common/fahrtenbuchStatsSeries';
import { zweckColor } from './statsPresentation';

export interface StatsZweckChartProps {
  slices: StatsSlice[];
  valueFormatter: (value: number) => string;
  /** Klick auf ein Segment schaltet den Zweck-Filter um. */
  onZweckClick?: (zweck: FahrtZweck) => void;
  /** Gefilterte Zwecke; die übrigen Segmente treten zurück. */
  activeZwecke?: FahrtZweck[];
}

/**
 * Verteilung über die Fahrtzwecke als Ring.
 *
 * Segmente ohne Wert fallen weg: Bei der Kennzahl „Strecke" hat ein Zweck, in
 * dem nur ein Anhänger unterwegs war, keine Kilometer — ein Segment der Breite
 * null wäre nur ein Strich in der Legende.
 */
export default function StatsZweckChart({
  slices,
  valueFormatter,
  onZweckClick,
  activeZwecke,
}: StatsZweckChartProps) {
  const t = useTranslations('fahrtenbuch');
  const theme = useTheme();

  const data = useMemo(() => {
    const active = new Set(activeZwecke ?? []);
    return slices
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const color = zweckColor(theme, slice.key);
        return {
          id: slice.key,
          value: slice.value,
          label: t(`zwecke.${slice.key}` as 'zwecke.einsatz'),
          // Wird gefiltert, treten die übrigen Segmente zurück — die Farbe
          // selbst wird blasser, statt über eine CSS-Regel auf interne
          // Klassennamen des Diagramms zu greifen.
          color:
            active.size > 0 && !active.has(slice.key as FahrtZweck)
              ? alpha(color, 0.3)
              : color,
        };
      });
  }, [slices, t, theme, activeZwecke]);

  if (data.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4 }}>
        {t('stats.noData')}
      </Typography>
    );
  }

  return (
    <PieChart
      height={260}
      series={[
        {
          data,
          innerRadius: 50,
          paddingAngle: 1,
          cornerRadius: 3,
          highlightScope: { fade: 'global', highlight: 'item' },
          valueFormatter: (item) => valueFormatter(item.value),
        },
      ]}
      onItemClick={
        onZweckClick
          ? (_event, item) => {
              const slice = data[item.dataIndex];
              if (slice) onZweckClick(slice.id as FahrtZweck);
            }
          : undefined
      }
      sx={
        onZweckClick
          ? { '& .MuiPieArc-root': { cursor: 'pointer' } }
          : undefined
      }
    />
  );
}
