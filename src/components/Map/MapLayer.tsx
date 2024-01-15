import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useEffect, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallLayer } from '../../hooks/useFirecallLayer';
import MapActionButtons from './MapActionButtons';
import { availableLayers, createLayers, overlayLayers } from './tiles';

const defaultTiles = 'basemap_ortofoto';

interface MapLayerOptions {
  map: L.Map;
}

export default function MapLayer({ map }: MapLayerOptions) {
  const { isAuthorized } = useFirebaseLogin();
  const [initialized, setInitialized] = useState(false);
  // const hydrantenLayer = useHydrantenLayer(map);
  // const saugstellenLayer = useSaugstellenLayer(map);
  // const distanceLayer = useDistanceLayer(map);
  // const loeschteichLayer = useLoeschteicheLayer(map);
  // const risikoLayer = useRisikoObjekteLayer(map);
  // const gefahrLayer = useGefahrObjekteLayer(map);
  const firecallLayer = useFirecallLayer(map);
  // usePositionMarker(map);

  useEffect(() => {
    if (
      !initialized &&
      map &&
      // hydrantenLayer &&
      // saugstellenLayer &&
      // loeschteichLayer &&
      // risikoLayer &&
      // gefahrLayer &&
      firecallLayer
    ) {
      const overlayLayersForMap = createLayers(overlayLayers);
      // distanceLayer.addTo(map);
      const overlayMaps = {
        Einsatz: firecallLayer,
        // Hydranten: hydrantenLayer,
        // Saugstellen: saugstellenLayer,
        // Loeschteiche: loeschteichLayer,
        // 'Risiko Objekte': risikoLayer,
        // 'Gefährliche Objekte': gefahrLayer,
        // 'Umkreis 50m': distanceLayer,
        ...overlayLayersForMap,
      };
      const baseMaps = createLayers(availableLayers);
      // baseMaps[defaultTiles].addTo(map);
      L.control.layers(baseMaps, overlayMaps).addTo(map);
      setInitialized(true);
    }
  }, [initialized, map, firecallLayer]);

  return <>{isAuthorized && <MapActionButtons map={map} />}</>;
}
