import { GefahrObjekt } from '../../../common/gis-objects';
import GefahrObjektMarker from '../markers/GefahrObjektMarker';

export interface GefahrObjekteLayerProps {
  gefahrObjekte: GefahrObjekt[];
}

export default function GefahrObjekteLayer({
  gefahrObjekte,
}: GefahrObjekteLayerProps) {
  return (
    <>
      {gefahrObjekte.map((objekt) => (
        <GefahrObjektMarker objekt={objekt} key={objekt.id || objekt.name} />
      ))}
    </>
  );
}
