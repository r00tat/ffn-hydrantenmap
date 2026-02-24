'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import type { SxProps } from '@mui/system/styleFunctionSx';
import type { HistoryDataPoint, ChartConfig, TimeRange } from './weatherChartConfig';
import { CHARTS, formatXAxisTick, tooltipTimestamp, hasData } from './weatherChartConfig';

// --- Single chart renderer (MUI X Charts) ---

function WeatherChartMui({
  config,
  data,
  range,
}: {
  config: ChartConfig;
  data: HistoryDataPoint[];
  range: TimeRange;
}) {
  const tickFormatter = formatXAxisTick(range);
  const dates = data.map((d) => new Date(d.time));

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
  };

  const margin = { top: 5, right: 20, bottom: 5, left: 10 };

  if (config.type === 'line' || config.type === 'area') {
    const series = config.keys.map((k) => ({
      id: k.key,
      data: data.map((d) => d[k.key] as number | null),
      label: k.label,
      color: k.color,
      showMark: false,
      connectNulls: true,
      area: config.type === 'area',
      valueFormatter: (v: number | null) =>
        v != null ? `${v.toFixed(1)} ${config.unit}` : '–',
    }));

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
    }

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
          hideLegend={config.keys.length <= 1}
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

  // For BarChart we need dataset + band xAxis
  const dataset = data.map((d) => ({
    ...d,
    timeLabel: tickFormatter(d.time),
  }));

  // Determine tick interval to avoid label clutter
  const tickInterval = Math.max(1, Math.floor(data.length / 12));

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
}: {
  data: HistoryDataPoint[];
  range: TimeRange;
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
          />
        )
      )}
    </>
  );
}
