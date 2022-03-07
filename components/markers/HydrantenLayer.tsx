import { HydrantenRecord } from '../../server/gis-objects';
import MarkerClusterLayer from './MarkerClusterLayer';
import HydrantMarker from './HydrantMarker';

export interface HydrantenLayerProps {
  hydranten: HydrantenRecord[];
}

export default function HydratenLayer({ hydranten }: HydrantenLayerProps) {
  return (
    <MarkerClusterLayer>
      {hydranten.map((hydrant) => (
        <HydrantMarker hydrant={hydrant} key={hydrant.name} />
      ))}
    </MarkerClusterLayer>
  );
}
