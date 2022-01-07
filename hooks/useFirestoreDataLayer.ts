import { QueryConstraint } from 'firebase/firestore';
import L, { LayerGroup, LeafletEvent } from 'leaflet';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { useEffect, useState } from 'react';
import { WgsObject } from '../server/gis-objects';
import useFirebaseCollection from './useFirebaseCollection';

export interface FirestoreDataLayerOptions<T = WgsObject> {
  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: T) => L.Icon);
  /**
   * firestore collection name
   */
  collectionName: string;

  queryConstraints?: QueryConstraint[];
  pathSegments?: string[];
  /**
   * render marker title as text
   */
  titleFn?: (gisObject: T) => string;
  /**
   * render popup html
   */
  popupFn?: (gisObject: T) => string;

  /**
   * automatically add to the map, once data has been loaded
   */
  autoAdd?: boolean;

  /**
   * cluster objects automatically together
   * default: false
   */
  cluster?: boolean;

  markerOptions?: L.MarkerOptions;

  events?: {
    [eventname: string]: (event: LeafletEvent, gisObject: T) => Promise<void>;
  };

  filterFn?: (element: T) => boolean;

  additionalLayers?: L.Layer[];
}

export default function useFirestoreDataLayer<T = WgsObject>(
  map: L.Map,
  options: FirestoreDataLayerOptions<T>
) {
  const { autoAdd = true, cluster = false, additionalLayers = [] } = options;
  // const [layer, setLayer] = useState(defaultTiles);
  const records = useFirebaseCollection<T>({
    collectionName: options.collectionName,
    queryConstraints: options.queryConstraints,
    pathSegments: options.pathSegments,
    filterFn: options.filterFn,
  });
  const [layerGroup, setLayerGroup] = useState<L.LayerGroup>();

  useEffect(() => {
    setLayerGroup(
      cluster ? (new MarkerClusterGroup() as LayerGroup) : L.layerGroup()
    );
  }, [cluster]);

  useEffect(() => {
    if (map && layerGroup && autoAdd) {
      // console.info(`adding firestore data to map`);
      layerGroup.addTo(map);
    }
  }, [layerGroup, map, autoAdd]);

  useEffect(() => {
    if (map && layerGroup) {
      // window.setTimeout(() => {
      // console.info(`setting up markers`);
      layerGroup.clearLayers();
      // only add hydranten if we got the map
      const markerIcon =
        typeof options.icon === 'object' ? L.icon(options.icon) : undefined;
      if (records && records.length > 0) {
        records
          .filter((r) => (r as any)?.lat && (r as any)?.lng)
          .forEach((r: T) => {
            const marker = L.marker([(r as any)?.lat, (r as any).lng], {
              ...(options.markerOptions || {}),
              icon:
                typeof options.icon === 'function'
                  ? options.icon(r)
                  : markerIcon,
              title: options.titleFn ? options.titleFn(r) : '',
            })
              .bindPopup(options.popupFn ? options.popupFn(r) : '')
              .addTo(layerGroup);
            Object.entries(options.events || {}).map(([key, f]) =>
              marker.on(key, (event) => f(event, r))
            );
          });
      }

      if (additionalLayers.length > 0) {
        additionalLayers.forEach((layer) => layer.addTo(layerGroup));
      }
      // }, 2000);
    }
  }, [map, records, layerGroup, options, additionalLayers]);

  return layerGroup;
}
