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
import { LayerGroup, LayersControl, useMap, useMapEvent } from 'react-leaflet';
import {
  GefahrObjekt,
  GeohashCluster,
  HydrantenRecord,
  Loeschteich,
  PegelstandRecord,
  RisikoObjekt,
  Saugstelle,
  WetterstationRecord,
} from '../../common/gis-objects';
import { defaultPosition } from '../../hooks/constants';
import { db } from '../firebase/firebase';
import GefahrObjekteLayer from './layers/GefahrObjekteLayer';
import HydrantenLabelsLayer from './layers/HydrantenLabelsLayer';
import HydrantenLayer from './layers/HydrantenLayer';
import LoeschteicheLayer from './layers/LoeschteichLayer';
import RisikoObjekteLayer from './layers/RisikoObjekteLayer';
import PegelstandLayer from './layers/PegelstandLayer';
import SaugstellenLayer from './layers/SaugstellenLayer';
import WetterstationLayer from './layers/WetterstationLayer';
import L from 'leaflet';

export async function queryClusters(center: L.LatLng, radiusInM: number) {
  const bounds = geohashQueryBounds([center.lat, center.lng], radiusInM);
  // console.info(`bounds: ${JSON.stringify(bounds)}`);

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

  // console.info(
  //   `got ${snapshots
  //     .map((snap) => snap.docs.length)
  //     .reduce((p, c) => p + c, 0)} clusters`
  // );

  const clusters: GeohashCluster[] = snapshots
    .map((snap) => snap.docs)
    .flat()
    .map((doc) => doc.data() as GeohashCluster);
  return clusters;
}

function filterRecords<T>(
  matchingDocs: GeohashCluster[],
  clusterField: string,
  center: L.LatLng,
  radiusInM: number
): T[] {
  return Object.values(
    matchingDocs
      .map((doc) => doc[clusterField] || [])
      .flat()
      .filter(
        (hydrant) =>
          center.distanceTo([hydrant.lat || 0, hydrant.lng || 0]) <= radiusInM
      )
      .reduce((p, c) => {
        p[c.name] = c;
        return p;
      }, {} as { [name: string]: T })
  );
}

interface ClusterData {
  clusters: GeohashCluster[];
  hydranten: HydrantenRecord[];
  risikoobjekte: RisikoObjekt[];
  gefahrObjekte: GefahrObjekt[];
  loeschteiche: Loeschteich[];
  saugstellen: Saugstelle[];
  wetterstationen: WetterstationRecord[];
  pegelstaende: PegelstandRecord[];
}

/**
 * @param center - Map center
 * @param radiusInM - Capped radius for dense objects (hydrants etc.)
 * @param queryRadiusInM - Uncapped radius for the Firestore query and sparse objects (weather/pegel)
 */
export function useClusters(
  center: L.LatLng,
  radiusInM: number,
  queryRadiusInM: number
): ClusterData {
  const [clusterData, setClusterData] = useState<ClusterData>({
    clusters: [],
    hydranten: [],
    risikoobjekte: [],
    gefahrObjekte: [],
    loeschteiche: [],
    saugstellen: [],
    wetterstationen: [],
    pegelstaende: [],
  });

  useEffect(() => {
    if (queryRadiusInM > 0) {
      (async () => {
        // Query with the full visible radius
        const matchingDocs = await queryClusters(center, queryRadiusInM);

        // Dense objects: filter with capped radius
        const matchingHydranten = filterRecords<HydrantenRecord>(
          matchingDocs,
          'hydranten',
          center,
          radiusInM
        );
        const matchingRisiko = filterRecords<RisikoObjekt>(
          matchingDocs,
          'risikoobjekt',
          center,
          radiusInM
        );
        const gefahr = filterRecords<GefahrObjekt>(
          matchingDocs,
          'gefahrobjekt',
          center,
          radiusInM
        );
        const loeschteiche = filterRecords<Loeschteich>(
          matchingDocs,
          'loeschteich',
          center,
          radiusInM
        );
        const saugstellen = filterRecords<Saugstelle>(
          matchingDocs,
          'saugstelle',
          center,
          radiusInM
        );

        // Sparse objects: filter with full visible radius
        const wetterstationen = filterRecords<WetterstationRecord>(
          matchingDocs,
          'wetterstationen',
          center,
          queryRadiusInM
        );
        const pegelstaende = filterRecords<PegelstandRecord>(
          matchingDocs,
          'pegelstaende',
          center,
          queryRadiusInM
        );

        setClusterData({
          clusters: matchingDocs,
          hydranten: matchingHydranten,
          risikoobjekte: matchingRisiko,
          gefahrObjekte: gefahr,
          loeschteiche: loeschteiche,
          saugstellen: saugstellen,
          wetterstationen,
          pegelstaende,
        });
      })();
    }
  }, [center, radiusInM, queryRadiusInM]);

  return clusterData;
}

export default function Clusters({
  clustered = true,
  defaultChecked,
}: {
  clustered?: boolean;
  defaultChecked?: { [name: string]: boolean };
}) {
  const map = useMap();
  const [center, setCenter] = useState(map.getCenter() || defaultPosition);
  const [radius, setRadius] = useState(1000);
  const [queryRadius, setQueryRadius] = useState(1000);

  useMapEvent('moveend', (event: L.LeafletEvent) => {
    (async () => {
      const b = map.getBounds();

      const rawRadius = Math.max(
        b.getNorthWest().distanceTo(b.getSouthEast()) / 2,
        250
      );
      // Capped radius for dense objects (hydrants etc.)
      const newRadius = Math.min(rawRadius, 2500);
      if (Math.abs(radius - newRadius) > 50) {
        setRadius(newRadius);
      }
      // Query radius: grows with zoom level, capped at 50km
      const newQueryRadius = Math.min(rawRadius, 50000);
      if (Math.abs(queryRadius - newQueryRadius) > 50) {
        setQueryRadius(newQueryRadius);
      }

      if (
        map.getCenter().lat &&
        map.getCenter().lng &&
        center &&
        center.distanceTo(map.getCenter()) > queryRadius
      ) {
        console.info(
          `center changed, new center: ${map.getCenter()}, distance to last center: ${
            center.distanceTo(map.getCenter()) > queryRadius
          }`
        );
        setCenter(map.getCenter());
      }
    })();
  });

  const { hydranten, gefahrObjekte, risikoobjekte, loeschteiche, saugstellen, wetterstationen, pegelstaende } =
    useClusters(center, radius * 2, queryRadius * 2);
  return (
    <>
      <LayersControl.Overlay name="Hydranten" checked={defaultChecked?.hydranten ?? true}>
        <HydrantenLayer hydranten={hydranten} clustered={clustered} summaryPosition="hover" />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Hydranten Infos" checked={false}>
        <HydrantenLabelsLayer hydranten={hydranten} />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Saugstellen" checked={defaultChecked?.saugstellen ?? true}>
        <LayerGroup>
          <LoeschteicheLayer loeschteiche={loeschteiche} />
          <SaugstellenLayer saugstellen={saugstellen} />
        </LayerGroup>
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Risiko Objekte" checked={defaultChecked?.risikoobjekte ?? true}>
        <LayerGroup>
          <RisikoObjekteLayer risikoObjekte={risikoobjekte} />
          <GefahrObjekteLayer gefahrObjekte={gefahrObjekte} />
        </LayerGroup>
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Pegelstände">
        <PegelstandLayer pegelstaende={pegelstaende} />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Wetterstationen">
        <WetterstationLayer wetterstationen={wetterstationen} />
      </LayersControl.Overlay>
    </>
  );
}
