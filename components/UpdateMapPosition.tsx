import { useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import { updateMapPosition } from '../hooks/useMapPosition';

export default function UpdateMapPosition() {
  useMapEvent('moveend', (event) => {
    const center = (event.target as L.Map).getCenter();
    // console.info(`move end ${center}`);
    updateMapPosition(center.lat, center.lng);
  });
  return null;
}
