import Typography from '@mui/material/Typography';
import { CircleMarker, LayerGroup, Tooltip } from 'react-leaflet';
import { HydrantenRecord } from '../../../common/gis-objects';

export interface HydrantenLabelsLayerProps {
  hydranten: HydrantenRecord[];
}

export function formatLabel(h: HydrantenRecord): string[] {
  const lines: string[] = [h.name];
  const leistung = h.leistung ? `${h.leistung} l/min` : '';
  const dimension = h.dimension ? `(${h.dimension}mm)` : '';
  const flow = [leistung, dimension].filter(Boolean).join(' ');
  if (flow) lines.push(flow);
  if (h.dynamischer_druck) lines.push(`${h.dynamischer_druck} bar dyn.`);
  if (h.leitungsart) lines.push(h.leitungsart);
  return lines;
}

export default function HydrantenLabelsLayer({
  hydranten,
}: HydrantenLabelsLayerProps) {
  return (
    <LayerGroup>
      {hydranten.map((h) => (
        <CircleMarker
          key={h.name}
          center={[h.lat, h.lng]}
          radius={0}
          interactive={false}
          stroke={false}
          fill={false}
        >
          <Tooltip
            direction="bottom"
            permanent
            offset={[0, 10]}
            opacity={0.8}
            className="nopadding"
          >
            <Typography variant="caption" component="div">
              {formatLabel(h).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </Typography>
          </Tooltip>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
