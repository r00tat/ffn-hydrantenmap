import L from 'leaflet';
import { useEffect } from 'react';
import useDistanceLayer from '../hooks/useDistanceLayer';
import useDistanceMarker from '../hooks/useDistanceMarker';
import useHydrantenLayer from '../hooks/useHydrantenLayer';
import usePositionMarker from '../hooks/usePositionMarker';
import { availableLayers, createLayers, overlayLayers } from './tiles';

const defaultTiles = 'basemap_hdpi';

interface MapLayerOptions {
  map: L.Map;
}

export default function MapLayer({ map }: MapLayerOptions) {
  // const [layer, setLayer] = useState(defaultTiles);
  const hydrantenLayer = useHydrantenLayer(map);

  const distanceLayer = useDistanceLayer(map);
  useDistanceMarker(map);
  usePositionMarker(map);

  useEffect(() => {
    if (map && hydrantenLayer) {
      const overlayLayersForMap = createLayers(overlayLayers);
      distanceLayer.addTo(map);
      const overlayMaps = {
        Hydranten: hydrantenLayer,
        'Umkreis 50m': distanceLayer,
        ...overlayLayersForMap,
      };
      const baseMaps = createLayers(availableLayers);
      baseMaps[defaultTiles].addTo(map);
      L.control.layers(baseMaps, overlayMaps).addTo(map);
    }
  }, [distanceLayer, hydrantenLayer, map]);

  return <></>;
}
