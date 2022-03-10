import { LayerGroup, useMap } from 'react-leaflet';
import useFirecall from '../../../hooks/useFirecall';
import FirecallItems from './FirecallItems';
import FirecallMarker from './FirecallMarker';

export default function FirecallLayer() {
  const firecall = useFirecall();

  return (
    <LayerGroup>
      {firecall.id && firecall.id !== 'unknown' && (
        <>
          <FirecallMarker firecall={firecall} />
          <FirecallItems />
        </>
      )}
    </LayerGroup>
  );
}
