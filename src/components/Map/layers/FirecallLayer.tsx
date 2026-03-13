import L from 'leaflet';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import { LayerGroup, LayersControl, useMap } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayersSorted } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';
import HeatmapOverlayLayer from './HeatmapOverlayLayer';
import HeatmapLegendEntry from '../HeatmapLegendEntry';
import { FirecallLayer as FirecallLayerType } from '../../firebase/firestore';

const PANE_BASE_Z_INDEX = 400;
const DEFAULT_PANE_NAME = 'firecall-default';

function getOverlayName(layer: FirecallLayerType): string {
  return `Einsatz ${layer.name} ${layer.heatmapConfig?.visualizationMode === 'interpolation' ? 'Interpolation' : 'Heatmap'}`;
}

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
  const map = useMap();
  const sortedLayers = useFirecallLayersSorted();
  const [visibleOverlays, setVisibleOverlays] = useState<Set<string>>(new Set());

  const onOverlayAdd = useCallback((e: L.LayersControlEvent) => {
    setVisibleOverlays((prev) => {
      const next = new Set(prev);
      next.add(e.name);
      return next;
    });
  }, []);

  const onOverlayRemove = useCallback((e: L.LayersControlEvent) => {
    setVisibleOverlays((prev) => {
      const next = new Set(prev);
      next.delete(e.name);
      return next;
    });
  }, []);

  useEffect(() => {
    map.on('overlayadd', onOverlayAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onOverlayRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('overlayadd', onOverlayAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onOverlayRemove as L.LeafletEventHandlerFn);
    };
  }, [map, onOverlayAdd, onOverlayRemove]);

  useCreatePane(DEFAULT_PANE_NAME, PANE_BASE_Z_INDEX);

  const visibleHeatmapLayers = useMemo(
    () =>
      sortedLayers.filter(
        (layer) =>
          layer.heatmapConfig?.enabled &&
          visibleOverlays.has(getOverlayName(layer)),
      ),
    [sortedLayers, visibleOverlays],
  );

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
          <React.Fragment key={layer.id}>
            <LayerPaneEntry
              layer={layer}
              defaultChecked={defaultChecked}
            />
            {layer.heatmapConfig?.enabled && (
              <LayersControl.Overlay
                name={getOverlayName(layer)}
                checked={false}
              >
                <LayerGroup>
                  <HeatmapOverlayLayer
                    layer={layer}
                    visible={visibleOverlays.has(getOverlayName(layer))}
                  />
                </LayerGroup>
              </LayersControl.Overlay>
            )}
          </React.Fragment>
        ))}

      {visibleHeatmapLayers.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            gap: 1,
            maxWidth: '80vw',
            overflowX: 'auto',
            pointerEvents: 'auto',
          }}
        >
          {visibleHeatmapLayers.map((layer) => (
            <HeatmapLegendEntry key={layer.id} layer={layer} />
          ))}
        </Box>
      )}
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
                : 'off')) as any
          }
          clusterMode={(layer.clusterMode || 'normal') as any}
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
