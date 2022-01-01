import { QueryConstraint } from 'firebase/firestore';
import L, { LayerGroup, LeafletEvent } from 'leaflet';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { useEffect, useState } from 'react';
import { WgsObject } from '../server/gis-objects';
import useFirebaseCollection from './useFirebaseCollection';

export interface FirestoreDataLayerOptions {
  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: WgsObject) => L.Icon);
  /**
   * firestore collection name
   */
  collectionName: string;

  queryConstraints?: QueryConstraint[];
  pathSegments?: string[];
  /**
   * render marker title as text
   */
  titleFn?: (gisObject: WgsObject) => string;
  /**
   * render popup html
   */
  popupFn?: (gisObject: WgsObject) => string;

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
    [eventname: string]: (
      event: LeafletEvent,
      gisObject: WgsObject
    ) => Promise<void>;
  };
}

export default function useFirestoreDataLayer(
  map: L.Map,
  options: FirestoreDataLayerOptions
) {
  // const [layer, setLayer] = useState(defaultTiles);
  const records = useFirebaseCollection<WgsObject>({
    collectionName: options.collectionName,
    queryConstraints: options.queryConstraints,
    pathSegments: options.pathSegments,
  });
  const [layerGroup, setLayerGroup] = useState<L.LayerGroup>();
  const { autoAdd = true, cluster = false } = options;

  useEffect(() => {
    setLayerGroup(
      cluster ? (new MarkerClusterGroup() as LayerGroup) : L.layerGroup()
    );
  }, [cluster]);

  useEffect(() => {
    if (map && layerGroup && autoAdd) {
      console.info(`adding firestore data to map`);
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
          .filter((r) => r?.lat && r?.lng)
          .forEach((gisObject: WgsObject) => {
            const marker = L.marker([gisObject.lat, gisObject.lng], {
              ...(options.markerOptions || {}),
              icon:
                typeof options.icon === 'function'
                  ? options.icon(gisObject)
                  : markerIcon,
              title: options.titleFn ? options.titleFn(gisObject) : '',
            })
              .bindPopup(options.popupFn ? options.popupFn(gisObject) : '')
              .addTo(layerGroup);
            Object.entries(options.events || {}).map(([key, f]) =>
              marker.on(key, (event) => f(event, gisObject))
            );
          });
      }
      // }, 2000);
    }
  }, [map, records, layerGroup, options]);

  return layerGroup;
}
