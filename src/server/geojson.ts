import { geohashQueryBounds } from 'geofire-common';
import { Feature, FeatureCollection, Geometry, Point, Position } from 'geojson';
import { GeohashCluster } from '../common/gis-objects';
import firebaseAdmin from './firebase/admin';

export interface GeoProperties {
  title: string;
  description?: string;
  icon?: {
    // see L.IconOptions
    iconUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  };
}

export type GeoJsonFeatureColleaction = FeatureCollection<
  Geometry,
  GeoProperties
>;

export async function getClusters(center: Position, radiusInM: number) {
  const bounds = geohashQueryBounds(center, radiusInM);
  // console.info(`bounds: ${JSON.stringify(bounds)}`);
  const firestore = firebaseAdmin.firestore();

  const docs: GeohashCluster[] = (
    await Promise.all(
      bounds.map(([startHash, endHash]) =>
        firestore
          .collection('clusters6')
          .orderBy('geohash')
          .startAt(startHash)
          .endAt(endHash)
          .get()
      )
    )
  )
    .map((snap) => snap.docs || [])
    .flat()
    .map((doc) => ({ id: doc.id, ...doc.data() } as unknown as GeohashCluster));

  return docs;
}

export default async function exportGeoJson(
  center: Position,
  radiusInM: number
): Promise<GeoJsonFeatureColleaction> {
  const radius = Math.max(200, Math.min(radiusInM, 10000)); // limit to 200 m to 10k radius
  console.info(`generating geojson for ${center} with radius ${radius}`);
  const clusters = await getClusters(center, radius);
  // console.info(`got ${clusters.length} clusters`);
  // console.info(JSON.stringify(clusters));

  const hydranten = clusters.map((cluster) => cluster.hydranten || []).flat();

  console.info(`found ${hydranten.length} hydranten`);

  const collection: GeoJsonFeatureColleaction = {
    type: 'FeatureCollection',
    features: [],
  };

  collection.features.push(
    ...hydranten.map(
      (h) =>
        ({
          type: 'Feature',
          geometry: {
            coordinates: [h.lng, h.lat, h.meereshoehe].filter((v) => v),
            type: 'Point',
          },
          properties: {
            title: h.name,
            description: `<b>${h.typ} ${h.ortschaft} ${
              h.hydranten_nummer
            }</b><br />${
              h.leistung ? h.leistung + 'l/min<br/>' : ''
            } statisch ${h.statischer_druck} bar<br/>dynamisch ${
              h.dynamischer_druck
            } bar`,
            dynamischerDruck: h.dynamischer_druck,
            statischerDruck: h.statischer_druck,
            leistung: h.leistung,
            dimension: h.dimension,
            ortschaft: h.ortschaft,
            typ: h.typ,
            hydrantenNummer: h.hydranten_nummer,
            leitungsart: h.leitungsart,
            icon: {
              iconUrl: `https://hydranten.ffnd.at/icons/${
                h.fuellhydrant?.toLowerCase() === 'ja'
                  ? 'hydrant-icon-fuellen.png'
                  : h.typ === 'Unterflurhydrant'
                  ? 'unterflur-hydrant-icon.png'
                  : 'hydrant.png'
              }`,
              iconSize: [26, 31],
              iconAnchor: [13, 28],
              popupAnchor: [1, -22],
            },
          },
        } as Feature<Point, GeoProperties>)
    )
  );

  collection.features.push(
    ...clusters
      .map((cluster) => cluster.risikoobjekt || [])
      .flat()
      .map(
        (r) =>
          ({
            type: 'Feature',
            geometry: { coordinates: [r.lng, r.lat], type: 'Point' },
            properties: {
              title: r.name,
              description: `<b>${r.ortschaft} ${r.name}</b><br />${r.risikogruppe}<br />${r.adresse}`,
              ortschaft: r.ortschaft,
              risikogruppe: r.risikogruppe,
              adresse: r.adresse,
              einsatzplanummer: r.einsatzplanummer,
              typ: 'Risikoobjekt',
              icon: {
                iconUrl: 'https://hydranten.ffnd.at/icons/risiko.svg',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, 0],
              },
            },
          } as Feature<Point, GeoProperties>)
      )
  );

  collection.features.push(
    ...clusters
      .map((cluster) => cluster.gefahrobjekt || [])
      .flat()
      .map(
        (r) =>
          ({
            type: 'Feature',
            geometry: { coordinates: [r.lng, r.lat], type: 'Point' },
            properties: {
              title: r.name,
              description: `<b>${r.ortschaft} ${r.name}</b><br />${r.risikogruppe}<br />${r.adresse}`,
              ortschaft: r.ortschaft,
              risikogruppe: r.risikogruppe,
              adresse: r.adresse,
              einsatzplanummer: r.einsatzplanummer,
              typ: 'Gefaehrdetes Objekt',
              icon: {
                iconUrl: 'https://hydranten.ffnd.at/icons/gefahr.svg',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, 0],
              },
            },
          } as Feature<Point, GeoProperties>)
      )
  );

  collection.features.push(
    ...clusters
      .map((cluster) => cluster.loeschteich || [])
      .flat()
      .map(
        (l) =>
          ({
            type: 'Feature',
            geometry: { coordinates: [l.lng, l.lat], type: 'Point' },
            properties: {
              title: l.name,
              description: `<b>Löschteich ${l.ortschaft} ${l.bezeichnung_adresse}</b><br/>Fassungsvermögen: ${l.fassungsverm_gen_m3_}<br />Zufluss: ${l.zufluss_l_min_}`,
              ortschaft: l.ortschaft,
              adresse: l.bezeichnung_adresse,
              fassungsvermoegen: l.fassungsverm_gen_m3_,
              zufluss: l.zufluss_l_min_,
              typ: 'Loeschteich',
              icon: {
                iconUrl: 'https://hydranten.ffnd.at/icons/loeschteich-icon.png',
                iconSize: [26, 31],
                iconAnchor: [13, 15],
                popupAnchor: [0, 0],
              },
            },
          } as Feature<Point, GeoProperties>)
      )
  );
  collection.features.push(
    ...clusters
      .map((cluster) => cluster.saugstelle || [])
      .flat()
      .map(
        (s) =>
          ({
            type: 'Feature',
            geometry: { coordinates: [s.lng, s.lat], type: 'Point' },
            properties: {
              title: s.name,
              description: `<b>Saugstelle ${s.ortschaft} ${
                s.bezeichnung_adresse
              }</b><br /> ${s.wasserentnahme_l_min_} l/min<br />${
                s.geod_tische_saugh_he_m_
                  ? s.geod_tische_saugh_he_m_ + 'm Saughöhe <br />'
                  : ''
              } ${
                s.saugleitungsl_nge_m_
                  ? s.saugleitungsl_nge_m_ + 'm Saugleitung <br />'
                  : ''
              }`,
              ortschaft: s.ortschaft,
              adresse: s.bezeichnung_adresse,
              saughoehe: s.geod_tische_saugh_he_m_,
              saugleitungslaenge: s.saugleitungsl_nge_m_,
              leistung: s.wasserentnahme_l_min_,
              typ: 'Saugstelle',
              icon: {
                iconUrl: 'https://hydranten.ffnd.at/icons/saugstelle-icon.png',
                iconSize: [26, 31],
                iconAnchor: [13, 15],
                popupAnchor: [0, 0],
              },
            },
          } as Feature<Point, GeoProperties>)
      )
  );

  console.info(
    `returning ${collection.features.length} features for ${center} radius ${radius}m`
  );

  return collection;
}
