import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

export default function RadiacodeLiveWidget({
  visible = true,
}: RadiacodeLiveWidgetProps) {
  const { measurement } = useRadiacode();
  if (!visible || !measurement) return null;
  const level = classifyDose(measurement.dosisleistung);
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
    </Box>
  );
}
