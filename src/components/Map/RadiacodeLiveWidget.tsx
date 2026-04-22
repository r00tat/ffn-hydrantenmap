import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useRadiacode } from '../providers/RadiacodeProvider';

export interface RadiacodeLiveWidgetProps {
  visible?: boolean;
}

type DoseLevel = 'low' | 'medium' | 'high';

function classifyDose(dose: number): DoseLevel {
  if (dose < 1) return 'low';
  if (dose < 10) return 'medium';
  return 'high';
}

const DOSE_COLOR: Record<DoseLevel, string> = {
  low: '#2e7d32',
  medium: '#ed6c02',
  high: '#d32f2f',
};

const STALE_THRESHOLD_SEC = 5;

// Re-rendert sekündlich, damit der Age-Indikator live mitläuft — ohne erneuten
// Render würde „Letzte Messung vor Xs" erst beim nächsten externen State-Update
// aktualisiert.
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function RadiacodeLiveWidget({
  visible = true,
}: RadiacodeLiveWidgetProps) {
  const { measurement, lastSampleTimestamp } = useRadiacode();
  const now = useNow();
  if (!visible || !measurement) return null;
  const level = classifyDose(measurement.dosisleistung);
  const ageSec =
    lastSampleTimestamp != null
      ? Math.round((now - lastSampleTimestamp) / 1000)
      : null;
  const isStale = ageSec != null && ageSec >= STALE_THRESHOLD_SEC;
  return (
    <Box
      data-dose-level={level}
      sx={{
        position: 'absolute',
        bottom: 120,
        left: 80,
        bgcolor: DOSE_COLOR[level],
        color: '#fff',
        borderRadius: 1,
        px: 1.5,
        py: 0.75,
        boxShadow: 3,
        minWidth: 120,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {measurement.dosisleistung.toFixed(2)} µSv/h
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', opacity: 0.9 }}>
        {measurement.cps} cps
      </Typography>
      {isStale && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.25,
            fontWeight: 600,
            color: 'warning.light',
          }}
        >
          Letzte Messung vor {ageSec}s
        </Typography>
      )}
    </Box>
  );
}
