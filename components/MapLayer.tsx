import L from 'leaflet';
import { useEffect } from 'react';
import useDistanceLayer from '../hooks/useDistanceLayer';
import useDistanceMarker from '../hooks/useDistanceMarker';
import useGefahrObjekteLayer from '../hooks/useGefahrObjekteLayer';
import useHydrantenLayer from '../hooks/useHydrantenLayer';
import useLoeschteicheLayer from '../hooks/useLoeschteicheLayer';
import usePositionMarker from '../hooks/usePositionMarker';
import useRisikoObjekteLayer from '../hooks/useRisikoObjekteLayer';
import useSaugstellenLayer from '../hooks/useSaugstellenLayer';
import { availableLayers, createLayers, overlayLayers } from './tiles';

const defaultTiles = 'basemap_hdpi';

interface MapLayerOptions {
  map: L.Map;
}

export default function MapLayer({ map }: MapLayerOptions) {
  // const [layer, setLayer] = useState(defaultTiles);
  const hydrantenLayer = useHydrantenLayer(map);
  const saugstellenLayer = useSaugstellenLayer(map);
  const distanceLayer = useDistanceLayer(map);
  const loeschteichLayer = useLoeschteicheLayer(map);
  const risikoLayer = useRisikoObjekteLayer(map);
  const gefahrLayer = useGefahrObjekteLayer(map);
  useDistanceMarker(map);
  usePositionMarker(map);

  useEffect(() => {
    if (
      map &&
      hydrantenLayer &&
      saugstellenLayer &&
      loeschteichLayer &&
      risikoLayer &&
      gefahrLayer
    ) {
      const overlayLayersForMap = createLayers(overlayLayers);
      distanceLayer.addTo(map);
      const overlayMaps = {
        Hydranten: hydrantenLayer,
        Saugstellen: saugstellenLayer,
        Loeschteiche: loeschteichLayer,
        'Risiko Objekte': risikoLayer,
        'Gefährliche Objekte': gefahrLayer,
        'Umkreis 50m': distanceLayer,
        ...overlayLayersForMap,
      };
      const baseMaps = createLayers(availableLayers);
      baseMaps[defaultTiles].addTo(map);
      L.control.layers(baseMaps, overlayMaps).addTo(map);
    }
  }, [
    distanceLayer,
    hydrantenLayer,
    loeschteichLayer,
    map,
    risikoLayer,
    saugstellenLayer,
  ]);

  return <></>;
}
