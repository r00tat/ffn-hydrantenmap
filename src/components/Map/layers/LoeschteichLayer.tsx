import { LayerGroup } from 'react-leaflet';
import { Loeschteich } from '../../../common/gis-objects';
import LoeschteichMarker from '../markers/LoeschteichMarker';

export interface LoeschteicheLayerProps {
  loeschteiche: Loeschteich[];
}

export default function LoeschteicheLayer({
  loeschteiche,
}: LoeschteicheLayerProps) {
  return (
    <LayerGroup>
      {loeschteiche.map((objekt) => (
        <LoeschteichMarker objekt={objekt} key={objekt.id || objekt.name} />
      ))}
    </LayerGroup>
  );
}
