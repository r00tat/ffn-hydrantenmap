import L from 'leaflet';
import { useEffect, useState } from 'react';
import { GisWgsObject } from '../server/gis-objects';
import useFirebaseCollection from './useFirebaseCollection';

export interface FirestoreDataLayerOptions {
  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: GisWgsObject) => L.Icon);
  /**
   * firestore collection name
   */
  collectionName: string;
  /**
   * render marker title as text
   */
  titleFn: (gisObject: GisWgsObject) => string;
  /**
   * render popup html
   */
  popupFn: (gisObject: GisWgsObject) => string;

  autoAdd?: boolean;
}

export default function useFirestoreDataLayer(
  map: L.Map,
  options: FirestoreDataLayerOptions
) {
  // const [layer, setLayer] = useState(defaultTiles);
  const records = useFirebaseCollection<GisWgsObject>(
    options.collectionName,
    []
  );
  const [layerGroup, setLayerGroup] = useState<L.LayerGroup>();
  const { autoAdd = true } = options;

  useEffect(() => {
    setLayerGroup(L.layerGroup([]));
  }, []);

  useEffect(() => {
    if (map && layerGroup && autoAdd) {
      layerGroup.addTo(map);
    }
  }, [layerGroup, map, autoAdd]);

  useEffect(() => {
    if (map && layerGroup) {
      layerGroup.clearLayers();
      // only add hydranten if we got the map
      const markerIcon =
        typeof options.icon === 'object' ? L.icon(options.icon) : undefined;
      records.forEach((gisObject: GisWgsObject) => {
        L.marker([gisObject.lat, gisObject.lng], {
          icon:
            typeof options.icon === 'function'
              ? options.icon(gisObject)
              : markerIcon,
          title: options.titleFn(gisObject),
        })
          .bindPopup(options.popupFn(gisObject))
          .addTo(layerGroup);
      });
    }
  }, [map, records, layerGroup, options]);

  return layerGroup;
}
