import { LayerGroup, LayersControl, Pane } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayersSorted } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';

const PANE_BASE_Z_INDEX = 400;
const DEFAULT_PANE_NAME = 'firecall-default';

export default function FirecallLayer({
  defaultChecked = true,
}: {
  defaultChecked?: boolean;
}) {
  const firecallId = useFirecallId();
  const sortedLayers = useFirecallLayersSorted();

  return (
    <>
      <Pane
        name={DEFAULT_PANE_NAME}
        style={{ zIndex: PANE_BASE_Z_INDEX }}
      >
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
      </Pane>

      {firecallId !== 'unknown' &&
        sortedLayers.map((layer) => {
          const paneName = `firecall-layer-${layer.id}`;
          const paneZIndex =
            PANE_BASE_Z_INDEX + (layer.zIndex ?? 0) + 1;

          return (
            <Pane
              name={paneName}
              style={{ zIndex: paneZIndex }}
              key={layer.id}
            >
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
            </Pane>
          );
        })}
    </>
  );
}
