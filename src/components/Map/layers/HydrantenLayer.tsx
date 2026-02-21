import { HydrantenRecord } from '../../../common/gis-objects';
import MarkerClusterLayer, { SummaryPosition } from './MarkerClusterLayer';
import HydrantMarker from '../markers/HydrantMarker';
import { LayerGroup } from 'react-leaflet';

export interface HydrantenLayerProps {
  hydranten: HydrantenRecord[];
  clustered?: boolean;
  summaryPosition?: SummaryPosition;
}

export default function HydrantenLayer({
  hydranten,
  clustered = true,
  summaryPosition = 'hover',
}: HydrantenLayerProps) {
  if (clustered) {
    return (
      <MarkerClusterLayer summaryPosition={summaryPosition}>
        {hydranten.map((hydrant) => (
          <HydrantMarker hydrant={hydrant} key={hydrant.name} />
        ))}
      </MarkerClusterLayer>
    );
  } else {
    return (
      <LayerGroup>
        {hydranten.map((hydrant) => (
          <HydrantMarker hydrant={hydrant} key={hydrant.name} />
        ))}
      </LayerGroup>
    );
  }
}
