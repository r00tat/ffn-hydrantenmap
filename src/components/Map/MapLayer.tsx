import L from 'leaflet';
import { useEffect, useState } from 'react';
import useDistanceLayer from '../../hooks/useDistanceLayer';
import useGefahrObjekteLayer from '../../hooks/useGefahrObjekteLayer';
import useHydrantenLayer from '../../hooks/useHydrantenLayer';
import useLoeschteicheLayer from '../../hooks/useLoeschteicheLayer';
import usePositionMarker from '../../hooks/usePositionMarker';
import useRisikoObjekteLayer from '../../hooks/useRisikoObjekteLayer';
import useSaugstellenLayer from '../../hooks/useSaugstellenLayer';
import { availableLayers, createLayers, overlayLayers } from './tiles';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MapActionButtons from './MapActionButtons';
import { useFirecallLayer } from '../../hooks/useFirecallLayer';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

const defaultTiles = 'basemap_hdpi';

interface MapLayerOptions {
  map: L.Map;
}

export default function MapLayer({ map }: MapLayerOptions) {
  const { isAuthorized } = useFirebaseLogin();
  const [initialized, setInitialized] = useState(false);
  const hydrantenLayer = useHydrantenLayer(map);
  const saugstellenLayer = useSaugstellenLayer(map);
  const distanceLayer = useDistanceLayer(map);
  const loeschteichLayer = useLoeschteicheLayer(map);
  const risikoLayer = useRisikoObjekteLayer(map);
  const gefahrLayer = useGefahrObjekteLayer(map);
  const firecallLayer = useFirecallLayer(map);
  usePositionMarker(map);

  useEffect(() => {
    if (
      !initialized &&
      map &&
      hydrantenLayer &&
      saugstellenLayer &&
      loeschteichLayer &&
      risikoLayer &&
      gefahrLayer &&
      firecallLayer
    ) {
      const overlayLayersForMap = createLayers(overlayLayers);
      distanceLayer.addTo(map);
      const overlayMaps = {
        Einsatz: firecallLayer,
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
      setInitialized(true);
    }
  }, [
    initialized,
    distanceLayer,
    hydrantenLayer,
    loeschteichLayer,
    map,
    risikoLayer,
    saugstellenLayer,
    gefahrLayer,
    firecallLayer,
  ]);

  return <>{isAuthorized && <MapActionButtons map={map} />}</>;
}
