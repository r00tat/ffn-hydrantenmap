import haversine from 'haversine-distance';
import {
  FirecallItemDto,
  projectFirecallItem,
} from '../../common/mcp/itemDto';
import type {
  DataSchemaField,
  FirecallItem,
  FirecallLayer,
} from '../../components/firebase/firestore';
import { convertUnit, findLayer } from './layerFields';

/**
 * Elemente des Einsatzes abfragen, statt sie alle in den Kontext zu legen.
 *
 * Der Kontext trägt nur noch den Überblick (`buildAiContext`): benannte
 * Elemente ohne Koordinaten, Messebenen nur als Zusammenfassung. Details —
 * Koordinaten, Zeiten, Messwerte, Tagebuchtext — holt das Modell hier.
 */

export interface FindItemsQuery {
  type?: string;
  name?: string;
  layer?: string;
  /** Datenfeld der Ebene, auf das `min`/`max`/`sort` sich beziehen. */
  field?: string;
  min?: number;
  max?: number;
  /** Einheit von `min`/`max`, wird in die des Felds umgerechnet. */
  unit?: string;
  /** Umkreis in Metern um `center`. */
  radius?: number;
  sort?: 'newest' | 'nearest' | 'highest' | 'lowest';
  limit?: number;
}

export interface FoundItem extends FirecallItemDto {
  /** Abstand zum Mittelpunkt in Metern, nur bei einer Umkreissuche. */
  distance?: number;
}

export interface FindItemsResult {
  total: number;
  items: FoundItem[];
  /** Fehlersatz, wenn die Abfrage nicht aufgeht — Ebene oder Feld fehlt. */
  error?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Ebene mit Datenfeldern oder eine Radiacode-Aufzeichnung: ihre Elemente sind Messpunkte. */
export function isMeasurementLayer(layer: FirecallLayer | undefined): boolean {
  return !!layer && (!!layer.dataSchema?.length || layer.layerType === 'radiacode');
}

/** Zeitpunkt eines Elements für „neueste zuerst". */
export function itemTime(item: FirecallItem): number {
  const value = (item as { created?: string }).created ?? item.datum;
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

function schemaField(
  schema: DataSchemaField[] | undefined,
  name: string,
): DataSchemaField | undefined {
  const needle = name.trim().toLocaleLowerCase('de');
  return schema?.find(
    (f) =>
      f.key.toLocaleLowerCase('de') === needle ||
      f.label.toLocaleLowerCase('de') === needle,
  );
}

export function findItems(
  items: FirecallItem[],
  layers: FirecallLayer[],
  query: FindItemsQuery,
  center?: { lat: number; lng: number },
): FindItemsResult {
  const layerById = new Map(layers.map((l) => [l.id, l]));

  let layer: FirecallLayer | undefined;
  if (query.layer) {
    layer = findLayer(layers, query.layer);
    if (!layer) {
      return {
        total: 0,
        items: [],
        error:
          `Ebene "${query.layer}" nicht gefunden` +
          (layers.length ? ` (Ebenen: ${layers.map((l) => `"${l.name}"`).join(', ')})` : ''),
      };
    }
  }

  const needle = query.name?.trim().toLocaleLowerCase('de');
  const type = query.type?.trim();

  let candidates = items.filter((item) => {
    if (item.deleted) return false;
    if (type && item.type !== type) return false;
    if (layer && item.layer !== layer.id) return false;
    if (needle) {
      const haystack = [item.name, (item as { fw?: string }).fw, item.beschreibung]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('de');
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  // Wert des Felds je Element, in der Einheit des Felds. Die Grenzen werden je
  // Ebene umgerechnet, weil zwei Ebenen dasselbe Feld in verschiedenen
  // Einheiten führen können.
  const fieldValue = new Map<FirecallItem, number>();
  if (query.field) {
    const withField: FirecallItem[] = [];
    let unconvertible: string | undefined;
    for (const item of candidates) {
      const field = schemaField(layerById.get(item.layer ?? '')?.dataSchema, query.field);
      const raw = field ? item.fieldData?.[field.key] : undefined;
      if (typeof raw !== 'number') continue;
      const min = query.min !== undefined ? convertUnit(query.min, query.unit, field!.unit) : undefined;
      const max = query.max !== undefined ? convertUnit(query.max, query.unit, field!.unit) : undefined;
      if ((query.min !== undefined && min === undefined) || (query.max !== undefined && max === undefined)) {
        unconvertible = `${query.unit} lässt sich nicht in ${field!.unit} umrechnen`;
        continue;
      }
      if (min !== undefined && raw < min) continue;
      if (max !== undefined && raw > max) continue;
      fieldValue.set(item, raw);
      withField.push(item);
    }
    if (withField.length === 0 && unconvertible) {
      return { total: 0, items: [], error: unconvertible };
    }
    candidates = withField;
  }

  const distance = new Map<FirecallItem, number>();
  if (center) {
    for (const item of candidates) {
      if (item.lat !== undefined && item.lng !== undefined) {
        distance.set(
          item,
          Math.round(haversine(center, { lat: item.lat, lng: item.lng })),
        );
      }
    }
    if (query.radius) {
      candidates = candidates.filter(
        (item) => (distance.get(item) ?? Infinity) <= query.radius!,
      );
    }
  }

  const sort = query.sort ?? (center && query.radius ? 'nearest' : 'newest');
  const sorted = [...candidates].sort((a, b) => {
    switch (sort) {
      case 'nearest':
        return (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity);
      case 'highest':
        return (fieldValue.get(b) ?? -Infinity) - (fieldValue.get(a) ?? -Infinity);
      case 'lowest':
        return (fieldValue.get(a) ?? Infinity) - (fieldValue.get(b) ?? Infinity);
      default:
        return itemTime(b) - itemTime(a);
    }
  });

  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return {
    total: sorted.length,
    items: sorted.slice(0, limit).map((item) => {
      const dto: FoundItem = projectFirecallItem(item, { includeDescription: true });
      const d = distance.get(item);
      if (d !== undefined) dto.distance = d;
      return dto;
    }),
  };
}
