import type {
  DrawingStroke,
  FirecallItem,
  Wasserstand,
} from '../../components/firebase/firestore';
import type { GeoJsonFeatureColleaction } from '../../server/geojson';
import { defaultLatLngPosition, LatLngPosition } from '../geo';
import { parseWasserBaender } from '../terrain/wasserstand';
import {
  buildCouplingCollection,
  hoseOffsetFor,
  lineTypeFor,
} from './couplingMarkers';
import { closeRing, itemPositions, positionsToGeoJson } from './geometry';
import { iconUrlFor, itemIconTarget } from './iconMap';
import {
  itemFields,
  type LagekarteCouplingCollection,
  type LagekarteFeature,
  type LagekarteFeatureType,
  type LagekarteFile,
  type LagekarteGroup,
  type LagekarteGroupEntry,
  type LagekarteMessage,
  type LagekarteOptions,
  type LagekarteSource,
} from './types';
import { toFfndMapLayers, toLagekarteWmsLayers } from './wmsLayers';

/** Zuordnung Ebenen-Id → lagekarte-Gruppenname (`'eg_0'`, …). */
export type GroupIdByLayer = Record<string, string>;

function optionsFor(
  item: FirecallItem,
  groupByLayer: GroupIdByLayer,
): LagekarteOptions {
  const rec = itemFields(item);
  const options: LagekarteOptions = {};
  if (typeof rec.color === 'string') options.color = rec.color;
  const group = item.layer ? groupByLayer[item.layer] : undefined;
  if (group) options.g = [group];
  return options;
}

function lineStringFeature(
  item: FirecallItem,
  positions: LatLngPosition[],
  options: LagekarteOptions,
  strokes?: DrawingStroke[],
): LagekarteFeature {
  return {
    type: 'Feature',
    properties: {
      type: 'polyline',
      options,
      infoData: {
        bezeichnung: item.name,
        ...withInformationen(item),
      },
      ffnd: { v: 1, item, ...(strokes ? { strokes } : {}) },
    },
    geometry: { type: 'LineString', coordinates: positionsToGeoJson(positions) },
  };
}

function polygonFeature(
  item: FirecallItem,
  rings: LatLngPosition[][],
  options: LagekarteOptions,
  featureType: LagekarteFeatureType = 'polygon',
): LagekarteFeature {
  return {
    type: 'Feature',
    properties: {
      type: featureType,
      options,
      infoData: {
        bezeichnung: item.name,
        ...withInformationen(item),
      },
      ffnd: { v: 1, item },
    },
    geometry: {
      type: 'Polygon',
      coordinates: rings.map((r) => closeRing(positionsToGeoJson(r))),
    },
  };
}

function withInformationen(item: FirecallItem) {
  const informationen = readableExtras(item);
  return informationen ? { informationen } : {};
}

/**
 * Die `zeichnungen`-Gruppe: alles, was keine Punktsignatur ist.
 *
 * @param items alle Items des Einsatzes
 * @param strokes Strokes je `drawing`-Item, Schlüssel = Item-Id
 * @param groupByLayer Ebenen-Id → lagekarte-Gruppenname
 */
export function buildZeichnungenGroup(
  items: FirecallItem[],
  strokes: Record<string, DrawingStroke[]>,
  groupByLayer: GroupIdByLayer,
): LagekarteGroup {
  const features: (LagekarteFeature | LagekarteCouplingCollection)[] = [];

  for (const item of items) {
    const rec = itemFields(item);
    const options = optionsFor(item, groupByLayer);

    switch (item.type) {
      case 'connection': {
        const positions = itemPositions(item);
        if (positions.length < 2) break;
        const dimension = rec.dimension as string | undefined;
        const lineType = lineTypeFor(dimension);
        const offset =
          typeof rec.oneHozeLength === 'number' && rec.oneHozeLength > 0
            ? rec.oneHozeLength
            : hoseOffsetFor(dimension);
        if (lineType && offset) {
          features.push(buildCouplingCollection(positions, offset));
          Object.assign(options, {
            lineType,
            offset,
            distanceMarkers: true,
            weight: 3,
          });
        }
        features.push(lineStringFeature(item, positions, options));
        break;
      }

      case 'line': {
        const positions = itemPositions(item);
        if (positions.length < 2) break;
        if (rec.dammbau === 'true') options.dashArray = [5, 5];
        features.push(lineStringFeature(item, positions, options));
        break;
      }

      case 'area': {
        const positions = itemPositions(item);
        if (positions.length < 3) break;
        features.push(polygonFeature(item, [positions], options));
        break;
      }

      case 'circle': {
        const { lat, lng } = item;
        if (typeof lat !== 'number' || typeof lng !== 'number') break;
        const radius = typeof rec.radius === 'number' ? rec.radius : 50;
        options.radius = `${radius}`;
        if (rec.fill === 'false') options.filltype = 'border';
        features.push({
          type: 'Feature',
          properties: {
            type: 'circle',
            options,
            infoData: { bezeichnung: item.name, ...withInformationen(item) },
            ffnd: { v: 1, item },
          },
          geometry: { type: 'Point', coordinates: [lng, lat] },
        });
        break;
      }

      case 'drawing': {
        const itemStrokes = (item.id && strokes[item.id]) || [];
        const ordered = [...itemStrokes].sort((a, b) => a.order - b.order);
        ordered.forEach((stroke, index) => {
          const positions = (stroke.points ?? []).filter(
            (p): p is LatLngPosition => Array.isArray(p) && p.length >= 2,
          );
          if (positions.length < 2) return;
          features.push(
            lineStringFeature(
              { ...item, name: `${item.name} (${index + 1})` },
              positions,
              { ...options, color: stroke.color, weight: stroke.width },
              // Die Strokes hängen nur am ersten Teilstück; sonst stünde die
              // ganze Zeichnung so oft in der Datei, wie sie Striche hat.
              index === 0 ? ordered : undefined,
            ),
          );
        });
        break;
      }

      case 'wasserstand': {
        // parseWasserBaender dekodiert die Polylines schon und liefert FloodBand[]
        const baender = parseWasserBaender(item as Wasserstand);
        for (const band of baender) {
          if (!band.ringe.length) continue;
          features.push(
            polygonFeature(
              { ...item, name: `${item.name} (${band.tiefeM} m)` },
              band.ringe,
              options,
            ),
          );
        }
        break;
      }

      default:
        break;
    }
  }

  return { type: 'FeatureCollection', name: 'zeichnungen', features };
}

/** Ordner → `icon.options.type`, wie lagekarte.info es selbst schreibt. */
const ICON_TYPE_BY_FOLDER: Record<string, string> = {
  oebfv: 'fahrzeug',
  fahrzeuge: 'fahrzeug',
  oenorm: 'taktischezeichen',
  geraete: 'geraete',
  sonstiges: 'sonstiges',
};

const DECIMAL = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

const DAMM_BAUWEISE_LABELS: Record<string, string> = {
  pyramide: 'Pyramidenstapel',
  notdamm: 'Notdamm',
  einfach: 'einreihiger Wall',
  dammbalken: 'Dammbalken-Ersatz',
};

/**
 * Die Kennzahlen, für die lagekarte kein Feld hat, als lesbarer Text für
 * `infoData.informationen`. Maschinenlesbar liegen sie zusätzlich im
 * `ffnd`-Block — beide Wege, damit auch ein lagekarte-Nutzer ohne unsere App
 * sieht, was gerechnet wurde.
 *
 * Nur **gespeicherte** Felder. Der Sandsackbedarf zum Beispiel steht nicht am
 * Item, sondern wird aus Höhe, Bauweise und Sackformat gerechnet — hier stehen
 * daher die Planungsvorgaben und nicht das Ergebnis.
 */
export function readableExtras(item: FirecallItem): string {
  const rec = itemFields(item);
  const parts: string[] = [];
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? DECIMAL.format(v) : undefined;

  if (item.type === 'connection') {
    if (rec.dimension) parts.push(`Schlauch ${rec.dimension}`);
    const menge = num(rec.foerderMenge);
    if (menge) parts.push(`Fördermenge ${menge} l/min`);
    const ziel = num(rec.zielDruck);
    if (ziel) parts.push(`Zieldruck ${ziel} bar`);
    const aus = num(rec.pumpenAusgangsdruck);
    if (aus) parts.push(`Pumpenausgangsdruck ${aus} bar`);
    const hoehe = num(rec.hoehenunterschied);
    if (hoehe) parts.push(`Höhenunterschied ${hoehe} m`);
    if (rec.versorgungsart === 'pendel' || rec.versorgungsart === 'vergleich') {
      const fz = num(rec.pendelFahrzeuge);
      if (fz) parts.push(`Pendelverkehr ${fz} Fahrzeuge`);
    }
  }

  if (item.type === 'line' && rec.dammbau === 'true') {
    const h = num(rec.dammHoehe);
    if (h) parts.push(`Dammhöhe ${h} m`);
    const fb = num(rec.freibord);
    if (fb) parts.push(`Freibord ${fb} m`);
    const bauweise =
      typeof rec.dammBauweise === 'string'
        ? DAMM_BAUWEISE_LABELS[rec.dammBauweise]
        : undefined;
    if (bauweise) parts.push(`Bauweise ${bauweise}`);
  }

  if (item.type === 'vehicle' || item.type === 'tacticalUnit') {
    if (rec.fw) parts.push(`${rec.fw}`);
    if (rec.eintreffen) parts.push(`Eintreffen ${rec.eintreffen}`);
    if (rec.abruecken) parts.push(`Abrücken ${rec.abruecken}`);
  }

  if (item.beschreibung) parts.unshift(item.beschreibung);

  const fieldData = rec.fieldData as Record<string, unknown> | undefined;
  if (fieldData) {
    for (const [key, value] of Object.entries(fieldData)) {
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${key}: ${value}`);
      }
    }
  }

  return parts.join(' · ');
}

function markerFeature(
  item: FirecallItem,
  groupByLayer: GroupIdByLayer,
): LagekarteFeature | undefined {
  const { lat, lng } = item;
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;

  const rec = itemFields(item);
  const target = itemIconTarget(item);
  const iconUrl =
    (target ? iconUrlFor(target) : undefined) ??
    (typeof rec.iconUrl === 'string' ? rec.iconUrl : undefined);
  if (!iconUrl) return undefined;

  const options = optionsFor(item, groupByLayer);
  options.iconMarker = true;
  options.icon = {
    options: {
      iconUrl,
      type: target
        ? (ICON_TYPE_BY_FOLDER[target.folder] ?? 'taktischezeichen')
        : 'taktischezeichen',
    },
  };

  const informationen = readableExtras(item);
  return {
    type: 'Feature',
    properties: {
      type: 'marker',
      options,
      infoData: {
        bezeichnung: item.name,
        ...(item.type === 'vehicle' ? { label: item.name } : {}),
        ...(informationen ? { informationen } : {}),
        ...(typeof rec.besatzung === 'string' && rec.besatzung
          ? { mannschaftAnz: rec.besatzung, mannschaft: [] }
          : {}),
      },
      ffnd: { v: 1, item },
    },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

/** Die `fahrzeuge`-Gruppe. */
export function buildFahrzeugeGroup(
  items: FirecallItem[],
  groupByLayer: GroupIdByLayer,
): LagekarteGroup & { features: LagekarteFeature[] } {
  const features = items
    .filter((i) => i.type === 'vehicle')
    .map((i) => markerFeature(i, groupByLayer))
    .filter((f): f is LagekarteFeature => !!f);
  return { type: 'FeatureCollection', name: 'fahrzeuge', features };
}

/** Item-Typen, die als Punktsignatur nach `taktischezeichen` gehen. */
const TAKTISCHE_ZEICHEN_TYPES = new Set([
  'marker',
  'tacticalUnit',
  'rohr',
  'hydrant',
  'assp',
  'el',
  'location',
]);

export interface GisOptions {
  gis: GeoJsonFeatureColleaction;
  /** lagekarte-Gruppenname für die GIS-Daten */
  groupName: string;
}

/**
 * Die `taktischezeichen`-Gruppe. Die statischen GIS-Daten landen hier mit —
 * im Referenz-Export stehen `geraete/ueberflurhydrant.svg` und Verwandte genau
 * hier. Getrennt schaltbar bleiben sie über ihre eigene `options.g`.
 */
export function buildTaktischeZeichenGroup(
  items: FirecallItem[],
  groupByLayer: GroupIdByLayer,
  gisOptions?: GisOptions,
): LagekarteGroup & { features: LagekarteFeature[] } {
  const features = items
    .filter((i) => TAKTISCHE_ZEICHEN_TYPES.has(i.type))
    .map((i) => markerFeature(i, groupByLayer))
    .filter((f): f is LagekarteFeature => !!f);

  if (gisOptions) {
    for (const feature of gisOptions.gis.features) {
      if (feature.geometry?.type !== 'Point') continue;
      const coordinates = feature.geometry.coordinates as number[];
      features.push({
        type: 'Feature',
        properties: {
          type: 'marker',
          options: {
            iconMarker: true,
            g: [gisOptions.groupName],
            icon: {
              options: {
                iconUrl: feature.properties.icon?.iconUrl,
                type: 'geraete',
              },
            },
          },
          infoData: {
            bezeichnung: feature.properties.description ?? feature.properties.id,
          },
        },
        geometry: { type: 'Point', coordinates },
      });
    }
  }

  return { type: 'FeatureCollection', name: 'taktischezeichen', features };
}

const GIS_GROUP_NAME = 'GIS-Daten';
const DEFAULT_ZOOM = 17;

function viewFor(source: LagekarteSource): [string, string] {
  const { firecall, items } = source;
  if (typeof firecall.lat === 'number' && typeof firecall.lng === 'number') {
    return [firecall.lat.toFixed(6), firecall.lng.toFixed(6)];
  }
  const withPosition = items.find(
    (i) => typeof i.lat === 'number' && typeof i.lng === 'number',
  );
  if (withPosition) {
    return [withPosition.lat!.toFixed(6), withPosition.lng!.toFixed(6)];
  }
  return [
    defaultLatLngPosition[0].toFixed(6),
    defaultLatLngPosition[1].toFixed(6),
  ];
}

const DIARY_TYPES = new Set(['diary', 'gb']);

function messagesFor(items: FirecallItem[]): LagekarteMessage[] {
  return items
    .filter((i) => DIARY_TYPES.has(i.type))
    .sort((a, b) => `${a.datum ?? ''}`.localeCompare(`${b.datum ?? ''}`))
    .map((item, index) => ({
      id: index + 1,
      date: item.datum ?? new Date(0).toISOString(),
      text: item.name,
      textorg: item.name,
      coords: [],
    }));
}

/** Baut die vollständige Lagekarte-Datei. Reine Funktion. */
export function buildLagekarteFile(source: LagekarteSource): LagekarteFile {
  const { firecall, items, layers, strokes, gis, mapLayers } = source;

  const groups: LagekarteGroupEntry[] = layers.map((layer, index) => ({
    name: `eg_${index}`,
    g_name: layer.name,
    disabled: (layer as { defaultVisible?: string }).defaultVisible === 'false',
  }));
  const groupByLayer: GroupIdByLayer = Object.fromEntries(
    layers
      .map((layer, index) => [layer.id ?? '', `eg_${index}`])
      .filter(([id]) => id),
  );

  let gisOptions: GisOptions | undefined;
  if (gis) {
    const groupName = `eg_${groups.length}`;
    groups.push({ name: groupName, g_name: GIS_GROUP_NAME, disabled: false });
    gisOptions = { gis, groupName };
  }

  const features = [
    buildZeichnungenGroup(items, strokes, groupByLayer),
    buildFahrzeugeGroup(items, groupByLayer),
    buildTaktischeZeichenGroup(items, groupByLayer, gisOptions),
  ];

  const ffndMapLayers = toFfndMapLayers(mapLayers);
  const messages = messagesFor(items);
  const notes = messages.map((m) => `${m.date} — ${m.text}`).join('\n');

  // lagekarte.info schreibt selbst genau einen Snapshot mit dem aktuellen
  // Stand. Unsere History-Snapshots mitzuexportieren würde die Datei
  // vervielfachen — jeder Snapshot ist eine vollständige Item-Kopie.
  const timestamp = Math.floor(Date.parse(firecall.date ?? '') / 1000) || 0;
  const history = [
    {
      name: firecall.name,
      timestamp,
      sp: {
        data: {
          type: 'FeatureCollection' as const,
          name: 'map',
          features,
          groups,
          notes,
        },
        timestamp,
      },
    },
  ];

  return {
    type: 'FeatureCollection',
    name: firecall.name,
    view: viewFor(source),
    zoom: DEFAULT_ZOOM,
    groups,
    notes,
    messages,
    history,
    colors: [],
    // Eigene Kartenebenen in dem Schema, das lagekarte.info selbst schreibt.
    wmslayers: toLagekarteWmsLayers(mapLayers),
    features,
    // Kachel-Ebenen, Deckkraft, Format, Zoomgrenzen: alles, was `wmslayers`
    // nicht führt. lagekarte.info ignoriert den Block, unser Import bevorzugt
    // ihn.
    ...(ffndMapLayers.length ? { ffnd: { v: 1 as const, mapLayers: ffndMapLayers } } : {}),
  };
}
