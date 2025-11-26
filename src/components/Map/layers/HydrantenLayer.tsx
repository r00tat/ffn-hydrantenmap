import { HydrantenRecord } from '../../../common/gis-objects';
import MarkerClusterLayer from './MarkerClusterLayer';
import HydrantMarker from '../markers/HydrantMarker';
import { LayerGroup } from 'react-leaflet';

export interface HydrantenLayerProps {
  hydranten: HydrantenRecord[];
  clustered?: boolean;
}

export default function HydrantenLayer({
  hydranten,
  clustered = true,
}: HydrantenLayerProps) {
  if (clustered) {
    return (
      <MarkerClusterLayer>
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
