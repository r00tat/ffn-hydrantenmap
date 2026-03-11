import { useEffect } from 'react';
import { LayerGroup, LayersControl, useMap } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayersSorted } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';
import { FirecallLayer as FirecallLayerType } from '../../firebase/firestore';

const PANE_BASE_Z_INDEX = 400;
const DEFAULT_PANE_NAME = 'firecall-default';

/**
 * Create a Leaflet pane imperatively (not via react-leaflet's <Pane>).
 * This avoids the context propagation issue where <Pane> forces all
 * children (Markers, Popups, Tooltips) into the custom pane, breaking
 * Leaflet's default z-index hierarchy (overlayPane < markerPane < popupPane).
 */
function useCreatePane(name: string, zIndex: number) {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane(name)) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
    } else {
      const pane = map.getPane(name);
      if (pane) {
        pane.style.zIndex = String(zIndex);
      }
    }
  }, [map, name, zIndex]);
}

export default function FirecallLayer({
  defaultChecked = true,
}: {
  defaultChecked?: boolean;
}) {
  const firecallId = useFirecallId();
  const sortedLayers = useFirecallLayersSorted();

  useCreatePane(DEFAULT_PANE_NAME, PANE_BASE_Z_INDEX);

  return (
    <>
      <LayersControl.Overlay name="Einsatz" checked={defaultChecked}>
        <LayerGroup>
          {firecallId !== 'unknown' && (
            <>
              <FirecallMarker />
              <FirecallItemsLayer pane={DEFAULT_PANE_NAME} />
            </>
          )}
        </LayerGroup>
      </LayersControl.Overlay>

      {firecallId !== 'unknown' &&
        sortedLayers.map((layer) => (
          <LayerPaneEntry
            key={layer.id}
            layer={layer}
            defaultChecked={defaultChecked}
          />
        ))}
    </>
  );
}

function LayerPaneEntry({
  layer,
  defaultChecked,
}: {
  layer: FirecallLayerType;
  defaultChecked: boolean;
}) {
  const paneName = `firecall-layer-${layer.id}`;
  const paneZIndex = PANE_BASE_Z_INDEX + (layer.zIndex ?? 0) + 1;

  useCreatePane(paneName, paneZIndex);

  return (
    <LayersControl.Overlay
      name={`Einsatz ${layer.name}`}
      checked={defaultChecked}
    >
      {layer.grouped === 'true' ? (
        <MarkerClusterLayer
          summaryPosition={
            (layer.summaryPosition ||
              (layer.showSummary !== 'false'
                ? 'right'
                : '')) as any
          }
          clusterMode={(layer.clusterMode || '') as any}
        >
          <FirecallItemsLayer layer={layer} pane={paneName} />
        </MarkerClusterLayer>
      ) : (
        <LayerGroup>
          <FirecallItemsLayer layer={layer} pane={paneName} />
        </LayerGroup>
      )}
    </LayersControl.Overlay>
  );
}
