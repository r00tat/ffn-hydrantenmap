import {
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore';
import { geohashQueryBounds } from 'geofire-common';
import { useEffect, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import { GeohashCluster, HydrantenRecord } from '../../common/gis-objects';
import { defaultPosition } from '../../hooks/constants';
import { db } from '../firebase/firebase';
import HydratenLayer from './markers/HydrantenLayer';

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
