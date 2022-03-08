import {
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore';
import {
  BITS_PER_CHAR,
  boundingBoxBits,
  boundingBoxCoordinates,
  geohashForLocation,
  geohashQuery,
} from 'geofire-common';
import { useEffect, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import { db } from '../components/firebase';
import { defaultPosition } from '../hooks/constants';
import { GeohashCluster, HydrantenRecord } from '../server/gis-objects';
import MarkerClusterLayer from './markers/MarkerClusterLayer';
import HydratenLayer from './markers/HydrantenLayer';
import HydrantMarker from './markers/HydrantMarker';

export type Geopoint = [number, number];
export type Geohash = string;
export type GeohashRange = [Geohash, Geohash];

export function geohashQueryBounds(
  center: Geopoint,
  radius: number
): GeohashRange[] {
  const queryBits = Math.max(1, boundingBoxBits(center, radius));
  const geohashPrecision = Math.ceil(queryBits / BITS_PER_CHAR);
  const coordinates = boundingBoxCoordinates(center, radius);
  console.info(`bb coordinates: ${JSON.stringify(coordinates)}`);
  const queries = coordinates.map((coordinate) => {
    return geohashQuery(
      geohashForLocation(coordinate, geohashPrecision),
      queryBits
    );
  });
  // remove duplicates
  return queries.filter((query, index) => {
    return !queries.some((other, otherIndex) => {
      return (
        index > otherIndex && query[0] === other[0] && query[1] === other[1]
      );
    });
  }) as GeohashRange[];
}

export async function queryClusters(center: L.LatLng, radiusInM: number) {
  const bounds = geohashQueryBounds([center.lat, center.lng], radiusInM);
  console.info(`bounds: ${JSON.stringify(bounds)}`);

  const snapshots = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(
          collection(db, 'clusters6'),
          orderBy('geohash'),
          startAt(b[0]),
          endAt(b[1])
        )
      )
    )
  );

  // Collect all the query results together into a single list

  console.info(
    `got ${snapshots
      .map((snap) => snap.docs.length)
      .reduce((p, c) => p + c, 0)} clusters`
  );

  const clusters: GeohashCluster[] = snapshots
    .map((snap) => snap.docs)
    .flat()
    .map((doc) => doc.data() as GeohashCluster);
  return clusters;
}

export function useClusters(center: L.LatLng, radiusInM: number) {
  const [clusters, setClusters] = useState<GeohashCluster[]>([]);
  const [hydranten, setHydranten] = useState<HydrantenRecord[]>([]);

  useEffect(() => {
    if (radiusInM > 0) {
      (async () => {
        const matchingDocs = await queryClusters(center, radiusInM);
        setClusters(matchingDocs);
        const matchingHydranten = Object.values(
          matchingDocs
            .map((doc) => doc.hydranten || [])
            .flat()
            .filter(
              (hydrant) =>
                center.distanceTo([hydrant.lat || 0, hydrant.lng || 0]) <=
                radiusInM
            )
            .reduce((p, c) => {
              p[c.name] = c;
              return p;
            }, {} as { [name: string]: HydrantenRecord })
        );
        console.info(`cluster hydranten: ${matchingHydranten.length}`);
        setHydranten(matchingHydranten);
      })();
    }
  }, [center, radiusInM]);

  return { clusters, hydranten };
}

export default function Clusters() {
  const map = useMap();
  const [center, setCenter] = useState(defaultPosition);
  const [radius, setRadius] = useState(1000);

  useMapEvent('moveend', (event: L.LeafletEvent) => {
    const b = map.getBounds();

    const newRadius = Math.min(
      Math.max(b.getNorthWest().distanceTo(b.getSouthEast()) / 2, 250),
      2500
    );
    if (Math.abs(radius - newRadius) > 50) {
      console.info(
        `new radius: ${newRadius} (raw: ${
          b.getNorthWest().distanceTo(b.getSouthEast()) / 2
        })`
      );
      setRadius(newRadius);
    }

    if (
      map.getCenter().lat &&
      map.getCenter().lng &&
      center &&
      center.distanceTo(map.getCenter()) > radius
    ) {
      console.info(
        `center changed, new center: ${map.getCenter()}, distance to last center: ${
          center.distanceTo(map.getCenter()) > radius
        }`
      );
      setCenter(map.getCenter());
    }
  });

  const { hydranten } = useClusters(center, radius * 2);
  return <HydratenLayer hydranten={hydranten} />;
}
