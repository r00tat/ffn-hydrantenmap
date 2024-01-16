import turfBbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';
import within from '@turf/boolean-within';
import center from '@turf/center';
import { lineString, point, points } from '@turf/helpers';
import circleToPolygon from 'circle-to-polygon';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';
import { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import { GeoPosition, GeoPositionObject } from '../common/geo';
import { GeohashCluster } from '../common/gis-objects';
import { firestore } from './firebase/admin';

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

export interface GeoFilterProperties {
  bbox?: GeoJSON.BBox;
  center: GeoPosition;
  radius: number;
}

export interface ErrorMessage {
  error: string;
}

const asNumber = (value?: string | string[]) => {
  if (!value) {
    return 0;
  }
  const x = Number.parseFloat(value instanceof Array ? value[0] : value);
  return Number.isNaN(x) ? 0 : x;
};

export function createFilterProps(query: {
  lat?: string | string[];
  lng?: string | string[];
  radius?: string | string[];
  bbox?: string | string[];
}): GeoFilterProperties {
  if (query.lat && query.lng) {
    const filterProps: GeoFilterProperties = {
      center: new GeoPosition(asNumber(query.lat), asNumber(query.lng)),
      radius: asNumber(query.radius),
    };
    console.info(
      `filter props(lat,lng,radius): ${JSON.stringify(filterProps)}`
    );
    return filterProps;
  }

  if (query.bbox) {
    try {
      const bbox: GeoJSON.BBox = (
        query.bbox instanceof Array
          ? query.bbox
          : `${query.bbox}`.replace(/[^0-9,.]+/g, '').split(',')
      ).map((s) => asNumber(s)) as GeoJSON.BBox;

      // console.info(`bbox: ${JSON.stringify(bbox)}`);
      if (
        !(bbox instanceof Array) ||
        !(bbox.length == 4 || bbox.length == 6) ||
        bbox.filter((s) => Number.isNaN(Number.parseFloat(`${s}`))).length > 0
      ) {
        throw { error: 'Bounding box array items must be of type number' };
      }

      // bbox is southwest x and y then northeast x and y
      // x = lng
      // y = lat
      const [swX, swY, neX, neY] =
        bbox.length == 6 ? [bbox[0], bbox[1], bbox[3], bbox[4]] : bbox;
      // bbox should be valid
      // radius = (distanceBetween([swY, swX], [neY, neX]) * 1000) / 2;
      // quick hack
      // pos = [(neY + swY) / 2, (swX + neX) / 2];

      const centerPos = center(
        points([
          [swX, swY],
          [neX, neY],
        ])
      );
      const filterProps: GeoFilterProperties = {
        bbox: [swX, swY, neX, neY],
        radius: (distanceBetween([swY, swX], [neY, neX]) * 1000) / 2,
        center: GeoPosition.fromGeoJsonPosition(centerPos.geometry.coordinates),
      };
      console.info(`filter props(bbox): ${JSON.stringify(filterProps)}`);
      return filterProps;
    } catch (err) {
      console.warn(`invalid bbox supplied: ${err} ${(err as Error).stack}`);
      throw { error: `Bounding Box is invalid` };
    }
  }

  throw { error: 'bbox or lat,lng and radius need to be specified' };
}

export function geoFilterFactory(filter?: {
  bbox?: GeoJSON.BBox;
  center?: GeoPosition;
  radius?: number;
}) {
  const { bbox, center, radius } = filter || {};
  let filterFunc: (o: GeoPositionObject) => boolean = (h: GeoPositionObject) =>
    true;
  if (bbox) {
    console.info(`filtering for bbox`);
    const bboxFeature = bboxPolygon(
      turfBbox(
        lineString([
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ])
      )
    );

    // console.info(`bbox polygon: ${JSON.stringify(bboxFeature)}`);

    filterFunc = (h: GeoPositionObject) =>
      within(point([h.lng, h.lat]), bboxFeature);
  } else if (center && radius) {
    filterFunc = (h: GeoPositionObject) =>
      distanceBetween(center.toLatLngPosition(), [h.lat, h.lng]) * 1000 <
      radius;
  }

  return filterFunc;
}

export async function getClusters(
  center: GeoPosition,
  radiusInM: number,
  bbox?: GeoJSON.BBox
): Promise<GeohashCluster> {
  const bounds = geohashQueryBounds(center.toLatLngPosition(), radiusInM);
  // console.info(`bounds: ${JSON.stringify(bounds)}`);

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

  console.info(`got ${docs.length} geoclusters`);

  // console.info(`bbox polygon: ${JSON.stringify(bboxFeature)}`);

  const filterFunc = geoFilterFactory({ bbox, center, radius: radiusInM });

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
  center: GeoPosition,
  radiusInM: number,
  bbox?: GeoJSON.BBox,
  debug = false
): Promise<GeoJsonFeatureColleaction> {
  const radius = Math.max(200, Math.min(radiusInM, 10000)); // limit to 200 m to 10k radius
  console.info(
    `generating geojson for ${center} with radius ${radius} bbox: ${JSON.stringify(
      bbox
    )}`
  );
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
            description: `<b>${r.ortschaft} ${r.name}</b><br />${
              r.risikogruppe
            }<br />${r.adresse}${
              r.link
                ? `<br/><a href="${encodeURI(
                    r.link
                  )}" target="_blank">Einsatzunterlagen</a>`
                : ''
            }`,
            ortschaft: r.ortschaft,
            risikogruppe: r.risikogruppe,
            adresse: r.adresse,
            einsatzplanummer: r.einsatzplanummer,
            typ: 'Risikoobjekt',
            link: r.link,
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
            description: `<b>${r.ortschaft} ${r.name}</b><br />${r.adresse}${
              r.link
                ? `<br/><a href="${encodeURI(
                    r.link
                  )}" target="_blank">Einsatzunterlagen</a>`
                : ''
            }`,
            ortschaft: r.ortschaft,
            adresse: r.adresse,
            einsatzplanummer: r.einsatzplanummer,
            typ: 'Gefaehrdetes Objekt',
            link: r.link,
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
    const geoCenter = center.toGeoJson();

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
