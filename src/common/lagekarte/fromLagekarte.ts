import type { FirecallItem } from '../../components/firebase/firestore';
import { LatLngPosition } from '../geo';
import { HOSE_LINE_TYPES, isCouplingCollection } from './couplingMarkers';
import { geoJsonToPositions, openRing } from './geometry';
import { lagekarteIconToItem, splitIconUrl } from './iconMap';
import {
  LAGEKARTE_ICON_BASE,
  type LagekarteFeature,
  type LagekarteFile,
  type LagekarteGroup,
  type LagekarteParseResult,
} from './types';

/**
 * Erkennt eine Lagekarte-Datei. `groups` und benannte Untergruppen sind das
 * Unterscheidungsmerkmal gegenüber einem gewöhnlichen GeoJSON — ohne sie würde
 * jedes GeoJSON als Lagekarte-Datei durchgehen.
 */
export function isLagekarteFile(raw: unknown): raw is LagekarteFile {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Partial<LagekarteFile>;
  if (candidate.type !== 'FeatureCollection') return false;
  if (!Array.isArray(candidate.groups)) return false;
  if (!Array.isArray(candidate.features)) return false;
  return candidate.features.some(
    (g) =>
      g && typeof g === 'object' && typeof (g as LagekarteGroup).name === 'string',
  );
}

/** `lineType` → Schlauchdimension, invers zu HOSE_LINE_TYPES. */
const DIMENSION_BY_LINE_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(HOSE_LINE_TYPES).map(([dimension, { lineType }]) => [
    lineType,
    dimension,
  ]),
);

/**
 * Felder, die beim Übernehmen aus dem `ffnd`-Block wegfallen: die Identität und
 * die Herkunft gehören zum alten Dokument, nicht zum importierten Element. Ein
 * mitgeschlepptes `source: 'mcp'` würde eine falsche Herkunft behaupten.
 */
const FFND_DROPPED_FIELDS = [
  'id',
  'layer',
  'created',
  'creator',
  'updatedAt',
  'updatedBy',
  'source',
  'mcpClientId',
  'mcpClientName',
];

function positionsJson(positions: LatLngPosition[]): string {
  return JSON.stringify(positions);
}

function absoluteIconUrl(iconUrl: string): string {
  if (/^https?:\/\//.test(iconUrl)) return iconUrl;
  const split = splitIconUrl(iconUrl);
  return split ? `${LAGEKARTE_ICON_BASE}/${split.folder}/${split.file}` : iconUrl;
}

function itemFromFeature(feature: LagekarteFeature): FirecallItem | undefined {
  const { properties, geometry } = feature;
  const options = properties?.options ?? {};
  const name =
    properties?.infoData?.bezeichnung ||
    properties?.infoData?.label ||
    'Import';
  const beschreibung = properties?.infoData?.informationen;
  const color = options.color;

  if (!geometry) return undefined;

  switch (properties?.type) {
    case 'polyline': {
      const positions = geoJsonToPositions(geometry.coordinates as number[][]);
      if (positions.length < 2) return undefined;
      const dimension = options.lineType
        ? DIMENSION_BY_LINE_TYPE[options.lineType]
        : undefined;
      const last = positions[positions.length - 1];
      const base = {
        name,
        beschreibung,
        color,
        positions: positionsJson(positions),
        lat: positions[0][0],
        lng: positions[0][1],
        destLat: last[0],
        destLng: last[1],
      };
      return dimension
        ? ({
            ...base,
            type: 'connection',
            dimension,
            oneHozeLength: options.offset ?? HOSE_LINE_TYPES[dimension].offset,
          } as unknown as FirecallItem)
        : ({ ...base, type: 'line' } as unknown as FirecallItem);
    }

    case 'polygon':
    case 'rectangle': {
      const rings = geometry.coordinates as number[][][];
      const positions = openRing(geoJsonToPositions(rings?.[0] ?? []));
      if (positions.length < 3) return undefined;
      const last = positions[positions.length - 1];
      return {
        type: 'area',
        name,
        beschreibung,
        color,
        positions: positionsJson(positions),
        lat: positions[0][0],
        lng: positions[0][1],
        destLat: last[0],
        destLng: last[1],
      } as unknown as FirecallItem;
    }

    case 'circle': {
      const [lng, lat] = geometry.coordinates as number[];
      if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
      const radius = Number.parseFloat(options.radius ?? '');
      return {
        type: 'circle',
        name,
        beschreibung,
        color,
        lat,
        lng,
        radius: Number.isFinite(radius) ? radius : 50,
      } as unknown as FirecallItem;
    }

    case 'marker':
    default: {
      if (geometry.type !== 'Point') return undefined;
      const [lng, lat] = geometry.coordinates as number[];
      if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
      const iconUrl = options.icon?.options?.iconUrl;
      const mapped = iconUrl ? lagekarteIconToItem(iconUrl) : undefined;
      if (mapped) {
        return { ...mapped, name, beschreibung, lat, lng } as unknown as FirecallItem;
      }
      return {
        type: 'marker',
        name,
        beschreibung,
        lat,
        lng,
        ...(iconUrl ? { iconUrl: absoluteIconUrl(iconUrl) } : {}),
      } as unknown as FirecallItem;
    }
  }
}

/**
 * Liest eine Lagekarte-Datei.
 *
 * Tolerant: nur ein fehlendes `type: 'FeatureCollection'` wirft. Ein einzelnes
 * unlesbares Feature wird zur Warnung und übersprungen — an einem kaputten
 * Element soll nicht der ganze Import scheitern.
 *
 * @param raw das geparste JSON
 * @param fallbackLayerName Name der Sammelebene für Features ohne `options.g`
 */
export function parseLagekarteFile(
  raw: unknown,
  fallbackLayerName: string,
): LagekarteParseResult {
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as { type?: string }).type !== 'FeatureCollection'
  ) {
    throw new Error('Keine Lagekarte-Datei: type ist nicht FeatureCollection');
  }
  const file = raw as Partial<LagekarteFile>;
  const warnings: string[] = [];

  const groupEntries = Array.isArray(file.groups) ? file.groups : [];
  const layers: FirecallItem[] = groupEntries.map(
    (g) =>
      ({
        type: 'layer',
        name: g.g_name || g.name,
        defaultVisible: g.disabled ? 'false' : 'true',
      }) as unknown as FirecallItem,
  );
  const fallbackIndex = layers.length;
  layers.push({
    type: 'layer',
    name: fallbackLayerName,
  } as unknown as FirecallItem);

  const indexByGroupName = new Map(groupEntries.map((g, index) => [g.name, index]));

  const items: { item: FirecallItem; layerIndex: number }[] = [];

  for (const group of Array.isArray(file.features) ? file.features : []) {
    const groupName = (group as LagekarteGroup)?.name ?? 'unbenannt';
    for (const entry of (group as LagekarteGroup)?.features ?? []) {
      if (isCouplingCollection(entry)) continue;
      const feature = entry as LagekarteFeature;

      const ffnd = feature.properties?.ffnd;
      let item: FirecallItem | undefined;
      if (ffnd?.item) {
        // Verlustfreier Rückweg: das eigene Item gewinnt. Identität und
        // Herkunft fallen weg — die setzt der Schreibpfad neu.
        const clean = { ...(ffnd.item as unknown as Record<string, unknown>) };
        for (const key of FFND_DROPPED_FIELDS) delete clean[key];
        item = clean as unknown as FirecallItem;
      } else {
        try {
          item = itemFromFeature(feature);
        } catch (err) {
          warnings.push(
            `${groupName}: Element konnte nicht gelesen werden (${err})`,
          );
          continue;
        }
      }

      if (!item) {
        warnings.push(`${groupName}: Element ohne verwertbare Geometrie übersprungen`);
        continue;
      }

      const groupRef = feature.properties?.options?.g?.[0];
      const layerIndex = groupRef
        ? (indexByGroupName.get(groupRef) ?? fallbackIndex)
        : fallbackIndex;
      items.push({ item, layerIndex });
    }
  }

  const diaries: FirecallItem[] = (
    Array.isArray(file.messages) ? file.messages : []
  ).map(
    (m, index) =>
      ({
        type: 'diary',
        nummer: index + 1,
        name: m.text ?? m.textorg ?? '',
        datum: m.date,
        art: 'M',
      }) as unknown as FirecallItem,
  );

  return { layers, items, diaries, warnings };
}
