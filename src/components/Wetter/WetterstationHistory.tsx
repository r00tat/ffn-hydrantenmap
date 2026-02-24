'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TawesStation, HistoryDataPoint, TimeRange, AggregationInterval } from './weatherChartConfig';
import { fetchStationInfo, fetchHistory, availableIntervals, INTERVAL_LABELS } from './weatherChartConfig';
import WetterstationHistoryMuiCharts from './WetterstationHistoryMui';

export default function WetterstationHistory({
  stationId,
}: {
  stationId: string;
}) {
  const [station, setStation] = useState<TawesStation | null>(null);
  const [data, setData] = useState<HistoryDataPoint[]>([]);
  const [range, setRange] = useState<TimeRange>('24h');
  const [loading, setLoading] = useState(true);
  const [aggregation, setAggregation] = useState<AggregationInterval>(10);
  const [showMinMax, setShowMinMax] = useState(false);
  const mountedRef = useRef(true);

  const loadData = useCallback(
    async (r: TimeRange) => {
      setLoading(true);
      try {
        const [info, history] = await Promise.all([
          station ? Promise.resolve(station) : fetchStationInfo(stationId),
          fetchHistory(stationId, r),
        ]);
        if (mountedRef.current) {
          if (info) setStation(info);
          setData(history);
        }
      } catch (err) {
        console.error('Failed to fetch weather history', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [stationId, station]
  );

  useEffect(() => {
    mountedRef.current = true;
    loadData(range);
    return () => {
      mountedRef.current = false;
    };
  }, [range, loadData]);

  const handleRangeChange = (r: TimeRange) => {
    setRange(r);
    if (!availableIntervals(r).includes(aggregation)) {
      setAggregation(10);
      setShowMinMax(false);
    }
  };

  const handleAggregationChange = (
    _event: React.MouseEvent<HTMLElement>,
    value: AggregationInterval | null,
  ) => {
    if (value !== null) {
      setAggregation(value);
      if (value === 10) setShowMinMax(false);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 900, mx: 'auto' }}>
      <Link href="/map" style={{ textDecoration: 'none' }}>
        &larr; Zurück zur Karte
      </Link>

      <Typography variant="h5" sx={{ mt: 2, mb: 1 }}>
        {station ? (
          <>
            {station.name}{' '}
            <Typography component="span" variant="body1" color="text.secondary">
              ({station.altitude} m)
            </Typography>
          </>
        ) : (
          `Station ${stationId}`
        )}
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <ButtonGroup>
          {(['12h', '24h', '48h', '7d'] as TimeRange[]).map((r) => (
            <Button
              key={r}
              variant={range === r ? 'contained' : 'outlined'}
              onClick={() => handleRangeChange(r)}
            >
              {r}
            </Button>
          ))}
        </ButtonGroup>

        <ToggleButtonGroup
          value={aggregation}
          exclusive
          onChange={handleAggregationChange}
          size="small"
        >
          {availableIntervals(range).map((iv) => (
            <ToggleButton key={iv} value={iv}>
              {INTERVAL_LABELS[iv]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {aggregation !== 10 && (
          <FormControlLabel
            control={
              <Switch
                checked={showMinMax}
                onChange={(e) => setShowMinMax(e.target.checked)}
                size="small"
              />
            }
            label="Min/Max"
          />
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : data.length === 0 ? (
        <Typography color="text.secondary">
          Keine Daten für den gewählten Zeitraum verfügbar.
        </Typography>
      ) : (
        <WetterstationHistoryMuiCharts
          data={data}
          range={range}
          globalAggregation={aggregation}
          showMinMax={showMinMax}
        />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Datenquelle:{' '}
        <a
          href="https://data.hub.geosphere.at"
          target="_blank"
          rel="noopener noreferrer"
        >
          GeoSphere Austria
        </a>{' '}
        (CC BY)
      </Typography>
    </Box>
  );
}
