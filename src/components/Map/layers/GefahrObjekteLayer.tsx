import { LayerGroup } from 'react-leaflet';
import { GefahrObjekt } from '../../../common/gis-objects';
import GefahrObjektMarker from '../markers/GefahrObjektMarker';

export interface GefahrObjekteLayerProps {
  gefahrObjekte: GefahrObjekt[];
}

export default function GefahrObjekteLayer({
  gefahrObjekte,
}: GefahrObjekteLayerProps) {
  return (
    <LayerGroup>
      {gefahrObjekte.map((objekt) => (
        <GefahrObjektMarker objekt={objekt} key={objekt.id || objekt.name} />
      ))}
    </LayerGroup>
  );
}
