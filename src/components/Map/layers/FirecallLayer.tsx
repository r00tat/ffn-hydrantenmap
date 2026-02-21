import { LayerGroup, LayersControl } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayers } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';

export default function FirecallLayer({
  defaultChecked = true,
}: {
  defaultChecked?: boolean;
}) {
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();

  return (
    <>
      <LayersControl.Overlay name="Einsatz" checked={defaultChecked}>
        <LayerGroup>
          {firecallId !== 'unknown' && (
            <>
              <FirecallMarker />
              <FirecallItemsLayer />
            </>
          )}
        </LayerGroup>
      </LayersControl.Overlay>

      {firecallId !== 'unknown' &&
        Object.entries(layers).map(([layerId, layer]) => (
          <LayersControl.Overlay
            name={`Einsatz ${layer.name}`}
            checked={defaultChecked}
            key={layerId}
          >
            {layer.grouped === 'true' && (
              <MarkerClusterLayer
                showSummary={layer.showSummary !== 'false'}
              >
                <FirecallItemsLayer layer={layer} />
              </MarkerClusterLayer>
            )}
            {layer.grouped !== 'true' && (
              <LayerGroup>
                <FirecallItemsLayer layer={layer} />
              </LayerGroup>
            )}
          </LayersControl.Overlay>
        ))}
    </>
  );
}
