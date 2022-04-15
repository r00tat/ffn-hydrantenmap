import { distanceBetween, geohashQueryBounds } from 'geofire-common';
import {
  BBox,
  Feature,
  FeatureCollection,
  Geometry,
  Point,
  Position,
} from 'geojson';
import { GeohashCluster, WgsObject } from '../common/gis-objects';
import firebaseAdmin from './firebase/admin';
import circleToPolygon from 'circle-to-polygon';
import within from '@turf/boolean-within';
import turfBbox from '@turf/bbox';
import { lineString, point } from '@turf/helpers';
import bboxPolygon from '@turf/bbox-polygon';

export interface GeoProperties {
  id: string;
  description?: string;
  icon?: {
    // see L.IconOptions
    iconUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  };
  style?: {
    [key: string]: any;
  };
}

export type GeoJsonFeatureColleaction = FeatureCollection<
  Geometry,
  GeoProperties
>;

export async function getClusters(
  center: Position,
  radiusInM: number,
  bbox?: GeoJSON.BBox
): Promise<GeohashCluster> {
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

  let bboxFeature =
    bbox &&
    bboxPolygon(
      turfBbox(
        lineString([
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ])
      )
    );

  // console.info(`bbox polygon: ${JSON.stringify(bboxFeature)}`);

  const filterFunc = (h: WgsObject) =>
    bbox && bboxFeature
      ? within(point([h.lng, h.lat]), bboxFeature)
      : distanceBetween(center, [h.lat, h.lng]) * 1000 < radiusInM;

  return {
    geohash: '',
    hydranten: docs
      .map((doc) => doc.hydranten || [])
      .flat()
      .filter(filterFunc),
    loeschteich: docs
      .map((doc) => doc.loeschteich || [])
      .flat()
      .filter(filterFunc),
    saugstelle: docs
      .map((doc) => doc.saugstelle || [])
      .flat()
      .filter(filterFunc),
    gefahrobjekt: docs
      .map((doc) => doc.gefahrobjekt || [])
      .flat()
      .filter(filterFunc),
    risikoobjekt: docs
      .map((doc) => doc.risikoobjekt || [])
      .flat()
      .filter(filterFunc),
  };
}

export type BBox4 = [number, number, number, number];

export default async function exportGeoJson(
  center: Position,
  radiusInM: number,
  bbox?: GeoJSON.BBox,
  debug = false
): Promise<GeoJsonFeatureColleaction> {
  const radius = Math.max(200, Math.min(radiusInM, 10000)); // limit to 200 m to 10k radius
  console.info(`generating geojson for ${center} with radius ${radius}`);
  const {
    hydranten = [],
    risikoobjekt = [],
    gefahrobjekt = [],
    loeschteich = [],
    saugstelle = [],
  } = await getClusters(center, radius, bbox);
  // console.info(`got ${clusters.length} clusters`);
  // console.info(JSON.stringify(clusters));

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
            id: h.name,
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
    ...risikoobjekt.map(
      (r) =>
        ({
          type: 'Feature',
          geometry: { coordinates: [r.lng, r.lat], type: 'Point' },
          properties: {
            id: r.name,
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
    ...gefahrobjekt.map(
      (r) =>
        ({
          type: 'Feature',
          geometry: { coordinates: [r.lng, r.lat], type: 'Point' },
          properties: {
            id: r.name,
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
    ...loeschteich.map(
      (l) =>
        ({
          type: 'Feature',
          geometry: { coordinates: [l.lng, l.lat], type: 'Point' },
          properties: {
            id: l.name,
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
    ...saugstelle.map(
      (s) =>
        ({
          type: 'Feature',
          geometry: { coordinates: [s.lng, s.lat], type: 'Point' },
          properties: {
            id: s.name,
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
  if (debug) {
    const geoCenter = [center[1], center[0]];

    // add some markers
    const points = (collection as FeatureCollection<Point, GeoProperties>)
      .features;

    let minLat = 0,
      maxLat = 0,
      minLng = 0,
      maxLng = 0;

    points.forEach(
      (
        {
          geometry: {
            coordinates: [lng, lat],
          },
        },
        index
      ) => {
        if (minLat === 0 || lat < minLat) {
          minLat = lat;
        }
        if (maxLat === 0 || lat > maxLat) {
          maxLat = lat;
        }
        if (minLng === 0 || lng < minLng) {
          minLng = lng;
        }
        if (maxLng === 0 || lng > maxLng) {
          maxLng = lng;
        }
      }
    );

    console.info(`bbox: ${minLng},${minLat},${maxLng},${maxLat}`);

    if (points.length > 0)
      collection.features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [minLng, maxLat],
              [maxLng, maxLat],
              [maxLng, minLat],
              [minLng, minLat],
            ],
          ],
        },
        properties: {
          id: 'bbox',
          description: 'Calculated bbox',
          style: {
            color: 'red',
          },
        } as GeoProperties,
      } as Feature<GeoJSON.Polygon, GeoProperties>);

    collection.features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: geoCenter,
      },
      properties: {
        id: 'center',
        description: 'calculated center',
      },
    } as Feature<Point, GeoProperties>);

    collection.features.push({
      type: 'Feature',
      geometry: circleToPolygon(geoCenter, radius),
      properties: {
        id: 'calculated_circle',
        description: 'calculated circle for bbox',
      },
    });
  }

  console.info(
    `returning ${collection.features.length} features for ${center} radius ${radius}m`
  );

  return collection;
}
