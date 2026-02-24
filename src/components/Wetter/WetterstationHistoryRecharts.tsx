'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryDataPoint, ChartConfig, TimeRange } from './weatherChartConfig';
import { CHARTS, formatXAxisTick, tooltipTimestamp, hasData } from './weatherChartConfig';

// --- Single chart renderer (Recharts) ---

function WeatherChartRecharts({
  config,
  data,
  range,
}: {
  config: ChartConfig;
  data: HistoryDataPoint[];
  range: TimeRange;
}) {
  const tickFormatter = formatXAxisTick(range);

  const commonProps = {
    data,
    margin: { top: 5, right: 20, bottom: 5, left: 10 },
  };

  const xAxis = (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tickFormatter={tickFormatter}
      tick={{ fontSize: 12 }}
    />
  );

  const yAxis = (
    <YAxis
      tick={{ fontSize: 12 }}
      width={50}
      label={{
        value: config.unit,
        angle: -90,
        position: 'insideLeft',
        style: { fontSize: 12 },
      }}
    />
  );

  const tooltip = (
    <Tooltip
      labelFormatter={(v) => tooltipTimestamp(v as number)}
      formatter={(value: number | undefined) => [
        `${value != null ? value.toFixed(1) : '–'} ${config.unit}`,
      ]}
    />
  );

  const grid = <CartesianGrid strokeDasharray="3 3" />;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        {config.title}
      </Typography>
      <ResponsiveContainer width="100%" height={200}>
        {config.type === 'line' ? (
          <LineChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.length > 1 && <Legend />}
            {config.keys.map((k) => (
              <Line
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2}
                strokeDasharray={k.dashed ? '5 5' : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        ) : config.type === 'bar' ? (
          <BarChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.map((k) => (
              <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} />
            ))}
          </BarChart>
        ) : (
          <AreaChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.map((k) => (
              <Area
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                fill={k.color}
                fillOpacity={0.3}
                stroke={k.color}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </Box>
  );
}

// --- Main render function ---

export default function WetterstationHistoryRechartsView({
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
          <WeatherChartRecharts
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
