import { LayerGroup } from 'react-leaflet';
import { Saugstelle } from '../../../common/gis-objects';
import SaugstelleMarker from '../markers/SaugstelleMarker';

export interface SaugstellenLayerProps {
  saugstellen: Saugstelle[];
}

export default function SaugstellenLayer({
  saugstellen,
}: SaugstellenLayerProps) {
  return (
    <LayerGroup>
      {saugstellen.map((objekt) => (
        <SaugstelleMarker objekt={objekt} key={objekt.id || objekt.name} />
      ))}
    </LayerGroup>
  );
}
