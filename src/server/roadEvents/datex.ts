/**
 * Liest DATEX-II-2.3-Situationen (ASFINAG-Content-Portal und EVIS.AT) und
 * macht daraus Verkehrsmeldungen für die Karte. Siehe docs/verkehrsmeldungen.md.
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
  RoadEventSource,
} from '../../common/roadEvents';

type XmlNode = Record<string, unknown>;

const ARRAY_TAGS = new Set([
  'situation',
  'situationRecord',
  'value',
  'lane',
  'generalPublicComment',
  'locationContainedInItinerary',
  'intermediate',
  'validPeriod',
  'exceptionPeriod',
  'applicableDay',
]);

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
  if (
    record.trafficConstrictionType === 'roadBlocked' ||
    record.trafficConstrictionType === 'carriagewayBlocked'
  ) {
    return 'closure';
  }
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
  validity: unknown;
  description?: string;
  url?: string;
  road?: string;
  roadName?: string;
  direction?: string;
  from: LatLng;
  to: LatLng;
  path?: LatLng[];
}

interface ParsedLocation {
  from: LatLng;
  to: LatLng;
  /** Verlauf samt Zwischenpunkten, wenn die Quelle ihn mitliefert. */
  path?: LatLng[];
  linear: unknown;
}

/**
 * Abschnitte eines `groupOfLocations`. Das ASFINAG-Portal liefert einen
 * einzelnen Abschnitt (`Linear`), EVIS meist eine Route aus mehreren
 * (`ItineraryByIndexedLocations`), z. B. je Fahrtrichtung einen.
 */
function locationsOf(group: unknown): ParsedLocation[] {
  const itinerary = child(group, 'locationContainedInItinerary');
  const nodes = Array.isArray(itinerary)
    ? [...itinerary]
        .sort(
          (a, b) =>
            Number(asNode(a)?.['@_index']) - Number(asNode(b)?.['@_index'])
        )
        .map((entry) => child(entry, 'location'))
    : [group];

  return nodes.flatMap((node): ParsedLocation[] => {
    const linear = child(
      node,
      'linearExtension',
      'extendedLinear',
      'linearByCoordinates'
    );
    const display = point(child(node, 'locationForDisplay'));
    const from = point(child(linear, 'start')) ?? display;
    const to = point(child(linear, 'end')) ?? from;
    if (!from || !to) return [];

    const raw = child(linear, 'intermediate');
    const intermediates = (Array.isArray(raw) ? [...raw] : [])
      .sort(
        (a, b) =>
          Number(asNode(a)?.['@_index']) - Number(asNode(b)?.['@_index'])
      )
      .map((entry) => point(child(entry, 'pointCoordinates')))
      .filter((p): p is LatLng => p !== undefined);

    return [
      {
        from,
        to,
        path:
          intermediates.length > 0 ? [from, ...intermediates, to] : undefined,
        linear,
      },
    ];
  });
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Eine ID oder zwei, durch Gedanken- oder Bindestrich getrennt. */
const UUID_RUN = new RegExp(`\\s*${UUID}(?:\\s*[–-]\\s*${UUID})?`, 'gi');

/**
 * EVIS schreibt bei manchen Landesstraßen statt der Ortsnamen interne IDs in
 * den Text („B50 - Burgenland Straße 9c0c…-… – 1cac…-…:"). Die IDs samt dem
 * Bindestrich dazwischen fallen weg; am Inhalt der Meldung ändert das nichts.
 */
function cleanDescription(value: string): string {
  return value.replace(UUID_RUN, '').replace(/\s+:/g, ':').trim();
}

/** Alle Kommentare eines Eintrags, die Beschreibung zuerst, ohne Dopplungen. */
function comments(record: XmlNode): string | undefined {
  const raw = record['generalPublicComment'];
  const entries = Array.isArray(raw) ? raw : [];
  const sorted = [...entries].sort(
    (a, b) =>
      Number(text(child(b, 'commentType')) === 'description') -
      Number(text(child(a, 'commentType')) === 'description')
  );
  const texts = sorted
    .map((entry) => multilingual(child(entry, 'comment')))
    .filter((t): t is string => !!t)
    .map(cleanDescription)
    .filter((t) => t.length > 0);
  const unique = [...new Set(texts)];
  return unique.length > 0 ? unique.join('\n') : undefined;
}

function parseRecords(
  record: XmlNode,
  situationId: string,
  situationVersion: string
): ParsedRecord[] {
  const type = stripPrefix(record['@_type']);
  const location = child(record, 'groupOfLocations');
  const locations = locationsOf(location);
  if (locations.length === 0) return [];

  const subtypeTag = SUBTYPE_TAGS.find((tag) => record[tag] !== undefined);
  const subtype = subtypeTag ? text(record[subtypeTag]) : undefined;
  const trafficConstrictionType = text(record['trafficConstrictionType']);

  const extended = child(
    location,
    'groupOfLocationsExtension',
    'groupOfLocationsExtended'
  );
  const validity = child(record, 'validity');
  const common = {
    situationId,
    situationVersion,
    type,
    subtype,
    kind: classifyRecord({ type, subtype, trafficConstrictionType }),
    status: text(child(validity, 'validityStatus')),
    start: text(
      child(validity, 'validityTimeSpecification', 'overallStartTime')
    ),
    end: text(child(validity, 'validityTimeSpecification', 'overallEndTime')),
    validity,
    description: comments(record),
    url: text(child(record, 'urlLink', 'urlLinkAddress')),
    direction: multilingual(child(extended, 'locationInfo', 'locationName')),
  };

  return locations.map(({ from, to, path, linear }) => ({
    ...common,
    road:
      text(child(extended, 'roadInfo', 'roadNumber')) ??
      text(child(linear, 'roadNumber')),
    roadName:
      multilingual(child(extended, 'roadInfo', 'roadName')) ??
      multilingual(child(linear, 'roadName')),
    from,
    to,
    path,
  }));
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** `07:30:00.0000000+01:00` → Minuten seit Mitternacht und Versatz in Minuten. */
function timeOfDay(value: string | undefined) {
  const match = value?.match(
    /^(\d{2}):(\d{2})(?::[\d.]+)?(Z|([+-])(\d{2}):(\d{2}))?$/
  );
  if (!match) return undefined;
  const offset =
    !match[3] || match[3] === 'Z'
      ? 0
      : (match[4] === '-' ? -1 : 1) *
        (Number(match[5]) * 60 + Number(match[6]));
  return { minutes: Number(match[1]) * 60 + Number(match[2]), offset };
}

/**
 * Liegt `now` in diesem Zeitraum? Ein Zeitraum hat optional Anfang und Ende,
 * eine Tageszeit (`recurringTimePeriodOfDay`) und Wochentage
 * (`recurringDayWeekMonthPeriod`). Tageszeit und Wochentag gelten in der
 * Zeitzone, die bei der Uhrzeit steht (EVIS: `+01:00`).
 */
function inPeriod(period: unknown, now: Date): boolean {
  const time = now.getTime();
  const startOf = text(child(period, 'startOfPeriod'));
  const endOf = text(child(period, 'endOfPeriod'));
  if (startOf && Date.parse(startOf) > time) return false;
  if (endOf && Date.parse(endOf) <= time) return false;

  const daily = child(period, 'recurringTimePeriodOfDay');
  const from = timeOfDay(text(child(daily, 'startTimeOfPeriod')));
  const to = timeOfDay(text(child(daily, 'endTimeOfPeriod')));
  const offset = from?.offset ?? to?.offset ?? 0;
  const local = new Date(time + offset * 60_000);

  const days = child(period, 'recurringDayWeekMonthPeriod', 'applicableDay');
  if (Array.isArray(days) && days.length > 0) {
    const today = WEEKDAYS[local.getUTCDay()];
    if (!days.some((day) => text(day) === today)) return false;
  }

  if (from && to) {
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const inside =
      from.minutes <= to.minutes
        ? minutes >= from.minutes && minutes < to.minutes
        : minutes >= from.minutes || minutes < to.minutes;
    if (!inside) return false;
  }
  return true;
}

function isCurrent(record: ParsedRecord, now: Date): boolean {
  if (record.status === 'suspended') return false;
  if (record.status === 'active') return true;
  const time = now.getTime();
  if (record.start && Date.parse(record.start) > time) return false;
  if (record.end && Date.parse(record.end) <= time) return false;

  const spec = child(record.validity, 'validityTimeSpecification');
  const periods = child(spec, 'validPeriod');
  if (Array.isArray(periods) && periods.length > 0) {
    if (!periods.some((period) => inPeriod(period, now))) return false;
  }
  const exceptions = child(spec, 'exceptionPeriod');
  if (Array.isArray(exceptions)) {
    if (exceptions.some((period) => inPeriod(period, now))) return false;
  }
  return true;
}

function severity(kind: RoadEventKind): number {
  return ROAD_EVENT_KIND_ORDER.indexOf(kind);
}

function locationKey(record: ParsedRecord): string {
  return `${record.situationId}|${record.from.join(',')}|${record.to.join(',')}`;
}

function merge(records: ParsedRecord[], source: RoadEventSource): RoadEvent {
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
    source,
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
    ...(lead.path ? { path: lead.path } : {}),
  };
}

export interface ParseOptions {
  now: Date;
  /** Herkunft der Meldungen, Vorgabe `asfinag`. */
  source?: RoadEventSource;
}

/**
 * Aktuell gültige Meldungen einer DATEX-II-SituationPublication. Einträge
 * einer Situation am selben Ort werden zusammengefasst; der schwerste
 * bestimmt die Einstufung.
 */
export function parseDatexEvents(
  xml: string,
  { now, source = 'asfinag' }: ParseOptions
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
        for (const parsed of parseRecords(
          record,
          situationId,
          situationVersion
        )) {
          if (!isCurrent(parsed, now)) continue;
          const key = locationKey(parsed);
          groups.set(key, [...(groups.get(key) ?? []), parsed]);
        }
      } catch (err) {
        console.warn(`DATEX-II-Eintrag in ${situationId} übersprungen`, err);
      }
    }
  }

  return [...groups.values()].map((records) => merge(records, source));
}
