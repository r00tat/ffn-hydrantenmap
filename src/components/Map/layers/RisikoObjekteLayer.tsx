import { RisikoObjekt } from '../../../common/gis-objects';
import RisikoObjektMarker from '../markers/RisikoObjektMarker';

export interface RisikoObjekteLayerProps {
  risikoObjekte: RisikoObjekt[];
}

export default function RisikoObjekteLayer({
  risikoObjekte,
}: RisikoObjekteLayerProps) {
  return (
    <>
      {risikoObjekte.map((risikoObjekt) => (
        <RisikoObjektMarker
          risikoobjekt={risikoObjekt}
          key={risikoObjekt.id || risikoObjekt.name}
        />
      ))}
    </>
  );
}
