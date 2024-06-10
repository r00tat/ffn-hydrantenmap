import { Saugstelle } from '../../../common/gis-objects';
import SaugstelleMarker from '../markers/SaugstelleMarker';

export interface SaugstellenLayerProps {
  saugstellen: Saugstelle[];
}

export default function SaugstellenLayer({
  saugstellen,
}: SaugstellenLayerProps) {
  return (
    <>
      {saugstellen.map((objekt) => (
        <SaugstelleMarker objekt={objekt} key={objekt.id || objekt.name} />
      ))}
    </>
  );
}
