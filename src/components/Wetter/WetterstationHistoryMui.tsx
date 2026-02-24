'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import type { SxProps } from '@mui/system/styleFunctionSx';
import type { HistoryDataPoint, ChartConfig, TimeRange, AggregationInterval, AggregatedDataPoint } from './weatherChartConfig';
import { CHARTS, formatXAxisTick, tooltipTimestamp, hasData, aggregateData } from './weatherChartConfig';

// --- Helpers ---

function getEffectiveMinutes(
  config: ChartConfig,
  range: TimeRange,
  globalAggregation: AggregationInterval,
): number {
  const perChart = typeof config.aggregateMinutes === 'function'
    ? config.aggregateMinutes(range)
    : config.aggregateMinutes;
  return Math.max(globalAggregation, perChart ?? 0);
}

// --- Single chart renderer (MUI X Charts) ---

function WeatherChartMui({
  config,
  data,
  range,
  globalAggregation,
  showMinMax,
}: {
  config: ChartConfig;
  data: HistoryDataPoint[];
  range: TimeRange;
  globalAggregation: AggregationInterval;
  showMinMax: boolean;
}) {
  const tickFormatter = formatXAxisTick(range);
  const keys = config.keys.map((k) => k.key);

  // Compute aggregation
  const effectiveMinutes = getEffectiveMinutes(config, range, globalAggregation);
  const isAggregated = effectiveMinutes > 10;
  const wantMinMax = showMinMax && isAggregated && config.type !== 'bar';

  // Build per-key aggregation mode: bar charts sum, line/area average, with per-key overrides
  const defaultMode = config.type === 'bar' ? 'sum' : 'avg';
  const hasOverrides = config.keys.some((k) => k.aggregateMode);
  const mode = hasOverrides
    ? Object.fromEntries(config.keys.map((k) => [k.key, k.aggregateMode ?? defaultMode]))
    : defaultMode;

  const chartData: AggregatedDataPoint[] = isAggregated
    ? aggregateData(data, effectiveMinutes, keys, mode, wantMinMax)
    : data;

  const dates = chartData.map((d) => new Date(d.time));

  const xAxisCommon = {
    scaleType: 'time' as const,
    data: dates,
    valueFormatter: (v: Date, ctx: { location: string }) =>
      ctx.location === 'tick'
        ? tickFormatter(v.getTime())
        : tooltipTimestamp(v.getTime()),
  };

  const yAxisCommon = {
    label: config.unit,
    tickLabelStyle: { fontSize: 12 },
    labelStyle: { fontSize: 12 },
    tickNumber: 8,
  };

  const margin = { top: 5, right: 20, bottom: 5, left: 10 };

  if (config.type === 'line' || config.type === 'area') {
    const series = config.keys.flatMap((k) => {
      const mainSeries = {
        id: k.key,
        data: chartData.map((d) => d[k.key] as number | null),
        label: k.label,
        color: k.color,
        showMark: false,
        connectNulls: true,
        area: config.type === 'area',
        valueFormatter: (v: number | null) =>
          v != null ? `${v.toFixed(1)} ${config.unit}` : '–',
      };

      if (!wantMinMax || k.aggregateMode === 'max') return [mainSeries];

      // Add min/max series
      const minSeries = {
        id: `${k.key}_min`,
        data: chartData.map((d) => (d as AggregatedDataPoint)._min?.[k.key] as number | null ?? null),
        label: `${k.label} Min`,
        color: k.color,
        showMark: false,
        connectNulls: true,
        area: false,
        valueFormatter: (v: number | null) =>
          v != null ? `${v.toFixed(1)} ${config.unit}` : '–',
      };
      const maxSeries = {
        id: `${k.key}_max`,
        data: chartData.map((d) => (d as AggregatedDataPoint)._max?.[k.key] as number | null ?? null),
        label: `${k.label} Max`,
        color: k.color,
        showMark: false,
        connectNulls: true,
        area: false,
        valueFormatter: (v: number | null) =>
          v != null ? `${v.toFixed(1)} ${config.unit}` : '–',
      };
      return [mainSeries, minSeries, maxSeries];
    });

    // Build sx styles: dashed lines by series ID, area opacity
    const sx: SxProps = {};
    if (config.type === 'area') {
      Object.assign(sx, {
        '& .MuiAreaElement-root': { fillOpacity: 0.3 },
      });
    }
    for (const k of config.keys) {
      if (k.dashed) {
        Object.assign(sx, {
          [`.MuiLineElement-series-${k.key}`]: { strokeDasharray: '5 5' },
        });
      }
      if (wantMinMax && k.aggregateMode !== 'max') {
        Object.assign(sx, {
          [`.MuiLineElement-series-${k.key}_min`]: {
            strokeDasharray: '3 3',
            strokeOpacity: 0.4,
          },
          [`.MuiLineElement-series-${k.key}_max`]: {
            strokeDasharray: '3 3',
            strokeOpacity: 0.4,
          },
        });
      }
    }

    // Hide legend when only 1 key and no min/max, or show it when min/max adds series
    const hideLegend = config.keys.length <= 1 && !wantMinMax;

    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
          {config.title}
        </Typography>
        <LineChart
          height={200}
          margin={margin}
          xAxis={[xAxisCommon]}
          yAxis={[yAxisCommon]}
          series={series}
          grid={{ horizontal: true }}
          hideLegend={hideLegend}
          sx={Object.keys(sx).length > 0 ? sx : undefined}
        />
      </Box>
    );
  }

  // Bar chart - needs band scale
  const series = config.keys.map((k) => ({
    dataKey: k.key,
    label: k.label,
    color: k.color,
    valueFormatter: (v: number | null) =>
      v != null ? `${v.toFixed(1)} ${config.unit}` : '–',
  }));

  const dataset = chartData.map((d) => ({
    ...d,
    timeLabel: tickFormatter(d.time),
  }));

  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        {config.title}
      </Typography>
      <BarChart
        height={200}
        margin={margin}
        dataset={dataset}
        xAxis={[
          {
            scaleType: 'band',
            dataKey: 'timeLabel',
            tickLabelStyle: { fontSize: 12 },
            tickLabelInterval: (_value: unknown, index: number) =>
              index % tickInterval === 0,
          },
        ]}
        yAxis={[yAxisCommon]}
        series={series}
        grid={{ horizontal: true }}
        hideLegend
      />
    </Box>
  );
}

// --- Main render function ---

export default function WetterstationHistoryMuiCharts({
  data,
  range,
  globalAggregation,
  showMinMax,
}: {
  data: HistoryDataPoint[];
  range: TimeRange;
  globalAggregation: AggregationInterval;
  showMinMax: boolean;
}) {
  return (
    <>
      {CHARTS.filter((chart) => chart.keys.some((k) => hasData(data, k.key))).map(
        (chart) => (
          <WeatherChartMui
            key={chart.title}
            config={chart}
            data={data}
            range={range}
            globalAggregation={globalAggregation}
            showMinMax={showMinMax}
          />
        )
      )}
    </>
  );
}
