import React from 'react';
import { LayerGroup, LayersControl } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayers } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';
import HeatmapOverlayLayer from './HeatmapOverlayLayer';

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
          <React.Fragment key={layerId}>
            <LayersControl.Overlay
              name={`Einsatz ${layer.name}`}
              checked={defaultChecked}
            >
              {layer.grouped === 'true' && (
                <MarkerClusterLayer
                  summaryPosition={(layer.summaryPosition || (layer.showSummary !== 'false' ? 'right' : '')) as any}
                  clusterMode={(layer.clusterMode || '') as any}
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
            {layer.heatmapConfig?.enabled && (
              <LayersControl.Overlay
                name={`${layer.name} Heatmap`}
                checked={false}
              >
                <LayerGroup>
                  <HeatmapOverlayLayer layer={layer} />
                </LayerGroup>
              </LayersControl.Overlay>
            )}
          </React.Fragment>
        ))}
    </>
  );
}
