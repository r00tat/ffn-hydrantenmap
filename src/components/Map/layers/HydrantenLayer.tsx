import { HydrantenRecord } from '../../../common/gis-objects';
import MarkerClusterLayer from './MarkerClusterLayer';
import HydrantMarker from '../markers/HydrantMarker';
import { LayerGroup } from 'react-leaflet';

export interface HydrantenLayerProps {
  hydranten: HydrantenRecord[];
  clustered?: boolean;
  showSummary?: boolean;
}

export default function HydrantenLayer({
  hydranten,
  clustered = true,
  showSummary = true,
}: HydrantenLayerProps) {
  if (clustered) {
    return (
      <MarkerClusterLayer showSummary={showSummary}>
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
