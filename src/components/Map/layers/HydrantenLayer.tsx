import { HydrantenRecord } from '../../../common/gis-objects';
import MarkerClusterLayer from './MarkerClusterLayer';
import HydrantMarker from '../markers/HydrantMarker';

export interface HydrantenLayerProps {
  hydranten: HydrantenRecord[];
}

export default function HydrantenLayer({ hydranten }: HydrantenLayerProps) {
  return (
    <MarkerClusterLayer>
      {hydranten.map((hydrant) => (
        <HydrantMarker hydrant={hydrant} key={hydrant.name} />
      ))}
    </MarkerClusterLayer>
  );
}
