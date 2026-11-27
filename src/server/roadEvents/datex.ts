/**
 * Liest DATEX-II-2.3-Situationen von EVIS.AT und macht daraus
 * Verkehrsmeldungen für die Karte. Siehe docs/verkehrsmeldungen.md.
 *
 * Zwei Schritte: `parseDatexRecords` liest ein Paket einmal in kompakte
 * Datensätze (nur bei geänderter Prüfsumme), `currentEvents` wählt daraus
 * zu jedem Zeitpunkt die gültigen Meldungen. Zeitfenster wie „werktags
 * 07:30–17:00“ hängen an der Uhr, nicht an den Daten.
 *
 * Ausgewertet werden nur die direkten `situationRecord` einer Situation. Die
 * `situationExtension` der geplanten Ereignisse enthält eine Übersicht über
 * das ganze Bauvorhaben und würde Abschnitte doppelt zeigen; sie fällt schon
 * vor dem Parsen weg.
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

/** Ein Zeitraum aus `validPeriod`/`exceptionPeriod`, vorab ausgewertet. */
interface Period {
  /** Anfang und Ende in ms seit 1970. */
  start?: number;
  end?: number;
  /** Wochentage, englisch klein (`monday`). */
  days?: string[];
  /** Tageszeit in Minuten seit Mitternacht, in der Zeitzone `offset`. */
  from?: number;
  to?: number;
  /** Versatz der Tageszeit gegen UTC in Minuten. */
  offset: number;
}

/**
 * Ein Eintrag einer Situation an einem Ort, ohne Knoten aus dem XML: Ein
 * ganzes Paket bleibt so nur als diese Datensätze im Speicher.
 */
export interface DatexRecord {
  situationId: string;
  situationVersion: string;
  type: string;
  subtype?: string;
  kind: RoadEventKind;
  status?: string;
  start?: string;
  end?: string;
  periods?: Period[];
  exceptions?: Period[];
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
 * Abschnitte eines `groupOfLocations`: ein einzelner (`Linear`) oder eine
 * Route aus mehreren (`ItineraryByIndexedLocations`), z. B. je Fahrtrichtung
 * einen.
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
): DatexRecord[] {
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
  const spec = child(validity, 'validityTimeSpecification');
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
    periods: periods(child(spec, 'validPeriod')),
    exceptions: periods(child(spec, 'exceptionPeriod')),
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

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

/**
 * Zeiträume eines Eintrags. Einer hat optional Anfang und Ende, eine
 * Tageszeit (`recurringTimePeriodOfDay`) und Wochentage
 * (`recurringDayWeekMonthPeriod`). Tageszeit und Wochentag gelten in der
 * Zeitzone, die bei der Uhrzeit steht (EVIS: `+01:00`).
 */
function periods(raw: unknown): Period[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((node): Period => {
    const daily = child(node, 'recurringTimePeriodOfDay');
    const from = timeOfDay(text(child(daily, 'startTimeOfPeriod')));
    const to = timeOfDay(text(child(daily, 'endTimeOfPeriod')));
    const days = child(node, 'recurringDayWeekMonthPeriod', 'applicableDay');
    const dayList = Array.isArray(days)
      ? days.map((day) => text(day)).filter((d): d is string => !!d)
      : [];
    return {
      start: timestamp(text(child(node, 'startOfPeriod'))),
      end: timestamp(text(child(node, 'endOfPeriod'))),
      days: dayList.length > 0 ? dayList : undefined,
      // Nur ein vollständiges Tageszeitfenster schränkt ein.
      from: from && to ? from.minutes : undefined,
      to: from && to ? to.minutes : undefined,
      offset: from?.offset ?? to?.offset ?? 0,
    };
  });
}

function inPeriod(period: Period, now: Date): boolean {
  const time = now.getTime();
  if (period.start !== undefined && period.start > time) return false;
  if (period.end !== undefined && period.end <= time) return false;

  const local = new Date(time + period.offset * 60_000);
  if (period.days && !period.days.includes(WEEKDAYS[local.getUTCDay()])) {
    return false;
  }

  if (period.from !== undefined && period.to !== undefined) {
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const inside =
      period.from <= period.to
        ? minutes >= period.from && minutes < period.to
        : minutes >= period.from || minutes < period.to;
    if (!inside) return false;
  }
  return true;
}

function isCurrent(record: DatexRecord, now: Date): boolean {
  if (record.status === 'suspended') return false;
  if (record.status === 'active') return true;
  const time = now.getTime();
  if (record.start && Date.parse(record.start) > time) return false;
  if (record.end && Date.parse(record.end) <= time) return false;

  if (record.periods && !record.periods.some((p) => inPeriod(p, now))) {
    return false;
  }
  if (record.exceptions?.some((p) => inPeriod(p, now))) return false;
  return true;
}

function severity(kind: RoadEventKind): number {
  return ROAD_EVENT_KIND_ORDER.indexOf(kind);
}

function locationKey(record: DatexRecord): string {
  return `${record.situationId}|${record.from.join(',')}|${record.to.join(',')}`;
}

function merge(records: DatexRecord[], source: RoadEventSource): RoadEvent {
  const sorted = [...records].sort(
    (a, b) => severity(a.kind) - severity(b.kind)
  );
  const lead = sorted[0];
  const first = <K extends keyof DatexRecord>(key: K) =>
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

/** Blöcke, die die Karte nicht braucht; sie machen ein Paket fast halb so groß. */
// Ein leeres Element (`<x/>`) passt nicht, sonst reichte der Treffer bis
// zum nächsten schließenden Tag gleichen Namens.
const UNUSED_BLOCKS =
  /<((?:[\w.-]+:)?(?:situationExtension|extendedLinearForGipLink|alertCLinear))\b(?:\s[^>]*[^/>])?>[\s\S]*?<\/\1>/g;

/**
 * Entfernt vor dem Parsen die Übersicht über das Bauvorhaben
 * (`situationExtension`), die GIP-Kanten (`extendedLinearForGipLink`) und
 * die ALERT-C-Orte (`alertCLinear`). Bei den Autobahnen spart das gut die
 * Hälfte der Parse-Zeit.
 */
export function stripUnusedBlocks(xml: string): string {
  return xml.replace(UNUSED_BLOCKS, '');
}

/** Eine Situation samt Inhalt; Situationen sind nicht verschachtelt. */
const SITUATION = /<((?:[\w.-]+:)?situation)\b(?:\s[^>]*)?>[\s\S]*?<\/\1>/g;

/**
 * Alle Einträge einer DATEX-II-SituationPublication, je Ort einer.
 *
 * Gelesen wird Situation für Situation, nicht das ganze Dokument auf einmal:
 * Ganz Österreich sind über 50 MB, als ein Objektbaum belegt das mehrere
 * hundert MB. So lebt immer nur der Baum einer Situation.
 */
export function parseDatexRecords(xml: string): DatexRecord[] {
  const result: DatexRecord[] = [];
  for (const [chunk] of xml.matchAll(SITUATION)) {
    let situations: unknown;
    try {
      situations = child(parser.parse(stripUnusedBlocks(chunk)), 'situation');
    } catch (err) {
      console.warn('DATEX-II-Situation nicht lesbar, übersprungen', err);
      continue;
    }
    const node = Array.isArray(situations) ? asNode(situations[0]) : undefined;
    if (!node) continue;
    const situationId = String(node['@_id'] ?? '');
    const situationVersion = String(node['@_version'] ?? '');
    const records = node['situationRecord'];
    if (!situationId || !Array.isArray(records)) continue;

    for (const raw of records) {
      const record = asNode(raw);
      if (!record) continue;
      try {
        result.push(...parseRecords(record, situationId, situationVersion));
      } catch (err) {
        console.warn(`DATEX-II-Eintrag in ${situationId} übersprungen`, err);
      }
    }
  }
  // Texte aus dem Parser sind in V8 oft nur Ausschnitte des Dokuments und
  // hielten es ganz im Speicher. Der Umweg über JSON legt eigene Kopien an.
  return JSON.parse(JSON.stringify(result)) as DatexRecord[];
}

/**
 * Zum Zeitpunkt `now` gültige Meldungen. Einträge einer Situation am selben
 * Ort werden zusammengefasst; der schwerste bestimmt die Einstufung.
 */
export function currentEvents(
  records: DatexRecord[],
  now: Date,
  source: RoadEventSource
): RoadEvent[] {
  const groups = new Map<string, DatexRecord[]>();
  for (const record of records) {
    if (!isCurrent(record, now)) continue;
    const key = locationKey(record);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  return [...groups.values()].map((group) => merge(group, source));
}

export interface ParseOptions {
  now: Date;
  /** Herkunft der Meldungen, Vorgabe `evis`. */
  source?: RoadEventSource;
}

/** Beide Schritte auf einmal: aktuell gültige Meldungen eines Pakets. */
export function parseDatexEvents(
  xml: string,
  { now, source = 'evis' }: ParseOptions
): RoadEvent[] {
  return currentEvents(parseDatexRecords(xml), now, source);
}
