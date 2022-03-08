import { useMap } from 'react-leaflet';
import { useFirecallLayer } from '../../../hooks/useFirecallLayer';

export default function FirecallLayer() {
  const map = useMap();
  useFirecallLayer(map);

  return <></>;
}
