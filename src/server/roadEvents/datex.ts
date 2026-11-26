/**
 * Liest DATEX-II-2.3-Situationen (ASFINAG-Profil) und macht daraus
 * Verkehrsmeldungen für die Karte. Siehe docs/verkehrsmeldungen.md.
 *
 * Ausgewertet werden nur die direkten `situationRecord` einer Situation. Die
 * `situationExtension` der geplanten Ereignisse enthält eine Übersicht über
 * das ganze Bauvorhaben und würde Abschnitte doppelt zeigen.
 */
import { XMLParser } from 'fast-xml-parser';
import {
  LatLng,
  ROAD_EVENT_KIND_ORDER,
  RoadEvent,
  RoadEventKind,
} from '../../common/roadEvents';

type XmlNode = Record<string, unknown>;

const ARRAY_TAGS = new Set(['situation', 'situationRecord', 'value', 'lane']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Elemente, deren Inhalt die Art eines Eintrags genauer beschreibt. */
const SUBTYPE_TAGS = [
  'roadOrCarriagewayOrLaneManagementType',
  'roadMaintenanceType',
  'constructionWorkType',
  'accidentType',
  'vehicleObstructionType',
  'obstructionType',
  'animalPresenceType',
  'environmentalObstructionType',
  'abnormalTrafficType',
  'poorEnvironmentType',
  'nonWeatherRelatedRoadConditionType',
  'weatherRelatedRoadConditionType',
  'networkManagementType',
  'generalNetworkManagementType',
  'trafficControlType',
];

const CLOSURE_SUBTYPES = new Set([
  'roadClosed',
  'carriagewayClosures',
  'closedPermanentlyForTheWinter',
  'exitClosed',
  'entryClosed',
  'entryAndExitClosed',
  'rampClosures',
]);

const RESTRICTION_TYPES = new Set([
  'RoadOrCarriagewayOrLaneManagement',
  'MaintenanceWorks',
  'ConstructionWorks',
  'SpeedManagement',
  'NetworkManagement',
  'GeneralNetworkManagement',
  'ReroutingManagement',
]);

export interface RecordClassification {
  type: string;
  subtype?: string;
  trafficConstrictionType?: string;
}

export function classifyRecord(record: RecordClassification): RoadEventKind {
  if (record.subtype && CLOSURE_SUBTYPES.has(record.subtype)) return 'closure';
  if (record.trafficConstrictionType === 'roadBlocked') return 'closure';
  if (RESTRICTION_TYPES.has(record.type)) return 'restriction';
  return 'incident';
}

function asNode(value: unknown): XmlNode | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : undefined;
}

function child(node: unknown, ...path: string[]): unknown {
  let current: unknown = node;
  for (const key of path) {
    const n = asNode(current);
    if (!n) return undefined;
    current = n[key];
  }
  return current;
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') {
    const inner = (value as XmlNode)['#text'];
    return inner === undefined ? undefined : text(inner);
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

/** Wert aus `<values><value lang="…">`, bevorzugt deutsch. */
function multilingual(node: unknown): string | undefined {
  const values = child(node, 'values', 'value');
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const german = values.find((v) =>
    String(asNode(v)?.['@_lang'] ?? '').startsWith('de')
  );
  return text(german ?? values[0]);
}

function point(node: unknown): LatLng | undefined {
  const lat = Number(text(child(node, 'latitude')));
  const lng = Number(text(child(node, 'longitude')));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return [lat, lng];
}

function stripPrefix(type: unknown): string {
  return String(type ?? '').replace(/^.*:/, '');
}

interface ParsedRecord {
  situationId: string;
  situationVersion: string;
  type: string;
  subtype?: string;
  kind: RoadEventKind;
  status?: string;
  start?: string;
  end?: string;
  description?: string;
  url?: string;
  road?: string;
  roadName?: string;
  direction?: string;
  from: LatLng;
  to: LatLng;
}

function parseRecord(
  record: XmlNode,
  situationId: string,
  situationVersion: string
): ParsedRecord | undefined {
  const type = stripPrefix(record['@_type']);
  const location = child(record, 'groupOfLocations');
  const linear = child(
    location,
    'linearExtension',
    'extendedLinear',
    'linearByCoordinates'
  );
  const display = point(child(location, 'locationForDisplay'));
  const from = point(child(linear, 'start')) ?? display;
  const to = point(child(linear, 'end')) ?? from;
  if (!from || !to) return undefined;

  const subtypeTag = SUBTYPE_TAGS.find((tag) => record[tag] !== undefined);
  const subtype = subtypeTag ? text(record[subtypeTag]) : undefined;
  const trafficConstrictionType = text(record['trafficConstrictionType']);

  const extended = child(
    location,
    'groupOfLocationsExtension',
    'groupOfLocationsExtended'
  );
  const validity = child(record, 'validity');

  return {
    situationId,
    situationVersion,
    type,
    subtype,
    kind: classifyRecord({ type, subtype, trafficConstrictionType }),
    status: text(child(validity, 'validityStatus')),
    start: text(child(validity, 'validityTimeSpecification', 'overallStartTime')),
    end: text(child(validity, 'validityTimeSpecification', 'overallEndTime')),
    description: multilingual(
      child(record, 'generalPublicComment', 'comment')
    ),
    url: text(child(record, 'urlLink', 'urlLinkAddress')),
    road:
      text(child(extended, 'roadInfo', 'roadNumber')) ??
      text(child(linear, 'roadNumber')),
    roadName:
      multilingual(child(extended, 'roadInfo', 'roadName')) ??
      multilingual(child(linear, 'roadName')),
    direction: multilingual(child(extended, 'locationInfo', 'locationName')),
    from,
    to,
  };
}

function isCurrent(record: ParsedRecord, now: Date): boolean {
  if (record.status === 'suspended') return false;
  if (record.status === 'active') return true;
  const time = now.getTime();
  if (record.start && Date.parse(record.start) > time) return false;
  if (record.end && Date.parse(record.end) <= time) return false;
  return true;
}

function severity(kind: RoadEventKind): number {
  return ROAD_EVENT_KIND_ORDER.indexOf(kind);
}

function locationKey(record: ParsedRecord): string {
  return `${record.situationId}|${record.from.join(',')}|${record.to.join(',')}`;
}

function merge(records: ParsedRecord[]): RoadEvent {
  const sorted = [...records].sort(
    (a, b) => severity(a.kind) - severity(b.kind)
  );
  const lead = sorted[0];
  const first = <K extends keyof ParsedRecord>(key: K) =>
    sorted.find((r) => r[key] !== undefined)?.[key];
  return {
    key: locationKey(lead),
    id: lead.situationId,
    version: lead.situationVersion,
    source: 'asfinag',
    kind: lead.kind,
    recordTypes: [
      ...new Set(
        sorted.map((r) => (r.subtype ? `${r.type}:${r.subtype}` : r.type))
      ),
    ],
    road: first('road') as string | undefined,
    roadName: first('roadName') as string | undefined,
    direction: first('direction') as string | undefined,
    description: first('description') as string | undefined,
    url: first('url') as string | undefined,
    start: first('start') as string | undefined,
    end: first('end') as string | undefined,
    from: lead.from,
    to: lead.to,
  };
}

export interface ParseOptions {
  now: Date;
}

/**
 * Aktuell gültige Meldungen einer DATEX-II-SituationPublication. Einträge
 * einer Situation am selben Ort werden zusammengefasst; der schwerste
 * bestimmt die Einstufung.
 */
export function parseDatexEvents(
  xml: string,
  { now }: ParseOptions
): RoadEvent[] {
  let document: XmlNode;
  try {
    document = parser.parse(xml) as XmlNode;
  } catch (err) {
    console.error('DATEX II konnte nicht gelesen werden', err);
    return [];
  }

  const situations = child(
    document,
    'd2LogicalModel',
    'payloadPublication',
    'situation'
  );
  if (!Array.isArray(situations)) return [];

  const groups = new Map<string, ParsedRecord[]>();
  for (const situation of situations) {
    const node = asNode(situation);
    if (!node) continue;
    const situationId = String(node['@_id'] ?? '');
    const situationVersion = String(node['@_version'] ?? '');
    const records = node['situationRecord'];
    if (!situationId || !Array.isArray(records)) continue;

    for (const raw of records) {
      const record = asNode(raw);
      if (!record) continue;
      try {
        const parsed = parseRecord(record, situationId, situationVersion);
        if (!parsed || !isCurrent(parsed, now)) continue;
        const key = locationKey(parsed);
        groups.set(key, [...(groups.get(key) ?? []), parsed]);
      } catch (err) {
        console.warn(`DATEX-II-Eintrag in ${situationId} übersprungen`, err);
      }
    }
  }

  return [...groups.values()].map(merge);
}
