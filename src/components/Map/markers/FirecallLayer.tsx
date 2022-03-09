import { LayerGroup, useMap } from 'react-leaflet';
import useFirecall from '../../../hooks/useFirecall';
import { useFirecallLayer } from '../../../hooks/useFirecallLayer';
import FirecallMarker from './FirecallMarker';

export default function FirecallLayer() {
  const map = useMap();
  const firecall = useFirecall();
  useFirecallLayer(map);
  return (
    <LayerGroup>
      {firecall.id && firecall.id !== 'unknown' && (
        <>
          <FirecallMarker firecall={firecall} />
        </>
      )}
    </LayerGroup>
  );
}
