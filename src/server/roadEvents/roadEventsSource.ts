/**
 * Verkehrsmeldungen aus mehreren Quellen (ASFINAG-Content-Portal, EVIS.AT):
 * Abruf je Paket, kurzer Cache, Verlauf entlang der Straße. Siehe
 * docs/verkehrsmeldungen.md.
 *
 * Abruf, Netz und Uhr werden übergeben, damit sich Cache und Teilausfälle
 * ohne Netz prüfen lassen; die Server Action setzt die echten ein.
 */
import {
  LatLng,
  ROAD_EVENT_KIND_ORDER,
  RoadEvent,
  RoadEventSource,
  RoadEventsResult,
  RoadEventWithPath,
} from '../../common/roadEvents';
import { parseDatexEvents } from './datex';
import type { MotorwayGraph, PathResult } from './motorwayPath';

export interface FeedConfig {
  /** Paketname für Meldungen und Log, z. B. `unplanned`. */
  name: string;
  source: RoadEventSource;
  /** DATEX-II-XML des Pakets; leer, wenn es nichts zu melden gibt. */
  fetchXml: () => Promise<string>;
  /**
   * Prüfsumme des Pakets (EVIS). Ist sie unverändert, wird das Paket nicht
   * erneut geladen.
   */
  fetchChecksum?: () => Promise<string>;
}

type Env = Record<string, string | undefined>;

const ASFINAG_FEED_ENV: [string, string][] = [
  ['unplanned', 'ASFINAG_UNPLANNED_RESOURCE_KEY'],
  ['planned', 'ASFINAG_PLANNED_RESOURCE_KEY'],
];

/** Pakete des ASFINAG-Content-Portals, für die ein Schlüssel hinterlegt ist. */
export function asfinagFeedsFromEnv(
  env: Env,
  fetchXml: (resourceKey: string) => Promise<string>
): FeedConfig[] {
  return ASFINAG_FEED_ENV.flatMap(([name, variable]): FeedConfig[] => {
    const resourceKey = env[variable]?.trim();
    return resourceKey
      ? [{ name, source: 'asfinag', fetchXml: () => fetchXml(resourceKey) }]
      : [];
  });
}

export type EvisPackage = 'EventsUnplanned' | 'EventsPlanned';

export interface EvisClient {
  fetchData(pkg: EvisPackage, region: string, apiKey: string): Promise<string>;
  fetchChecksum(
    pkg: EvisPackage,
    region: string,
    apiKey: string
  ): Promise<string>;
}

/** Burgenland und Niederösterreich; ohne ASFINAG-Strecken, die kommen vom Portal. */
export const EVIS_DEFAULT_REGIONS = ['AT-1', 'AT-3'];
const EVIS_REGION = /^AT(-[1-9]|-ASF)?$/;
const EVIS_PACKAGES: [string, EvisPackage][] = [
  ['unplanned', 'EventsUnplanned'],
  ['planned', 'EventsPlanned'],
];

/**
 * Pakete von EVIS.AT je Region (`EVIS_REGIONS`, kommagetrennt, Vorgabe
 * Burgenland und Niederösterreich). Ohne `EVIS_API_KEY` keine.
 */
export function evisFeedsFromEnv(env: Env, client: EvisClient): FeedConfig[] {
  const apiKey = env.EVIS_API_KEY?.trim();
  if (!apiKey) return [];
  const configured = env.EVIS_REGIONS?.split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const regions = (
    configured?.length ? configured : EVIS_DEFAULT_REGIONS
  ).filter((region) => {
    const valid = EVIS_REGION.test(region);
    if (!valid) console.warn(`EVIS_REGIONS: unbekannte Region ${region}`);
    return valid;
  });
  return regions.flatMap((region) =>
    EVIS_PACKAGES.map(([name, pkg]): FeedConfig => ({
      name: `evis-${name}-${region}`,
      source: 'evis',
      fetchXml: () => client.fetchData(pkg, region, apiKey),
      fetchChecksum: () => client.fetchChecksum(pkg, region, apiKey),
    }))
  );
}

export interface RoadEventsSourceOptions {
  feeds: FeedConfig[];
  loadGraph: () => Promise<MotorwayGraph>;
  findPath: (graph: MotorwayGraph, from: LatLng, to: LatLng) => PathResult;
  now?: () => Date;
  /** Wie lange ein Paket als frisch gilt. */
  ttlMs?: number;
}

interface FeedState {
  fetchedAt: number;
  /** Zuletzt geladenes XML; bei gleicher Prüfsumme wird es neu ausgewertet. */
  xml?: string;
  checksum?: string;
  events: RoadEvent[];
  failed: boolean;
}

/** Obergrenze des Verlaufs-Caches; darüber wird er geleert (alte Versionen). */
const PATH_CACHE_MAX = 5000;

export function createRoadEventsSource({
  feeds,
  loadGraph,
  findPath,
  now = () => new Date(),
  ttlMs = 60_000,
}: RoadEventsSourceOptions) {
  const states = new Map<string, FeedState>();
  const pathCache = new Map<string, PathResult>();
  let graphPromise: Promise<MotorwayGraph | undefined> | undefined;
  let pending: Promise<RoadEventsResult> | undefined;

  function graph(): Promise<MotorwayGraph | undefined> {
    graphPromise ??= loadGraph().catch((err) => {
      console.error('Autobahnnetz für Verkehrsmeldungen nicht geladen', err);
      return undefined;
    });
    return graphPromise;
  }

  async function refreshFeed(feed: FeedConfig, time: Date): Promise<void> {
    const previous = states.get(feed.name);
    // Auch nach einem Fehler erst nach Ablauf erneut: die ASFINAG behält
    // sich Lastgrenzen vor, ein Ausfall soll nicht zu Dauerabrufen führen.
    if (previous && time.getTime() - previous.fetchedAt < ttlMs) return;
    try {
      // Die Prüfsumme kommt vor den Daten: Ändern sie sich dazwischen, passt
      // die gespeicherte Prüfsumme nicht mehr und der nächste Abruf lädt neu.
      const checksum = await feed.fetchChecksum?.().catch((err) => {
        console.warn(`Prüfsumme für ${feed.name} nicht abrufbar`, err);
        return undefined;
      });
      const unchanged =
        checksum !== undefined &&
        previous?.xml !== undefined &&
        previous.checksum === checksum;
      const xml = unchanged ? previous.xml! : await feed.fetchXml();
      states.set(feed.name, {
        fetchedAt: time.getTime(),
        xml: feed.fetchChecksum ? xml : undefined,
        checksum,
        // Auch bei gleicher Prüfsumme neu auswerten: Zeitfenster wie
        // „werktags 07:30–17:00“ hängen an der Uhrzeit, nicht an den Daten.
        events: parseDatexEvents(xml, { now: time, source: feed.source }),
        failed: false,
      });
    } catch (err) {
      console.error(
        `Verkehrsmeldungen: Paket ${feed.name} nicht abrufbar`,
        err
      );
      states.set(feed.name, {
        ...previous,
        fetchedAt: time.getTime(),
        events: previous?.events ?? [],
        failed: true,
      });
    }
  }

  async function withPath(event: RoadEvent): Promise<RoadEventWithPath> {
    // Liefert die Quelle den Verlauf mit (EVIS), gilt er so.
    if (event.path && event.path.length >= 2) {
      return { ...event, path: event.path, approximate: false };
    }
    // Das Netz kennt nur Autobahnen und Schnellstraßen; eine Landesstraße
    // ohne Verlauf würde auf die nächste Autobahn geschnappt.
    if (event.source !== 'asfinag') {
      const point = event.from.join() === event.to.join();
      return {
        ...event,
        path: point ? [event.from] : [event.from, event.to],
        approximate: !point,
      };
    }
    const cacheKey = `${event.key}@${event.version}`;
    let result = pathCache.get(cacheKey);
    if (!result) {
      const g = await graph();
      result = g
        ? findPath(g, event.from, event.to)
        : { path: [event.from, event.to], approximate: true };
      if (g) {
        if (pathCache.size >= PATH_CACHE_MAX) pathCache.clear();
        pathCache.set(cacheKey, result);
      }
    }
    return { ...event, ...result };
  }

  async function load(): Promise<RoadEventsResult> {
    const time = now();
    await Promise.all(feeds.map((feed) => refreshFeed(feed, time)));

    const failedFeeds = feeds
      .filter((feed) => states.get(feed.name)?.failed)
      .map((feed) => feed.name);
    // Eine Situation über eine Landesgrenze steht in den Paketen beider
    // Länder. Je Situation und Ort bleibt die neueste Version.
    const unique = new Map<string, RoadEvent>();
    for (const event of feeds.flatMap(
      (feed) => states.get(feed.name)?.events ?? []
    )) {
      const known = unique.get(event.key);
      if (!known || Number(event.version) > Number(known.version)) {
        unique.set(event.key, event);
      }
    }
    const events = [...unique.values()];
    const withPaths = await Promise.all(events.map(withPath));
    withPaths.sort(
      (a, b) =>
        ROAD_EVENT_KIND_ORDER.indexOf(a.kind) -
        ROAD_EVENT_KIND_ORDER.indexOf(b.kind)
    );
    return { configured: true, events: withPaths, failedFeeds };
  }

  return {
    async get(): Promise<RoadEventsResult> {
      if (feeds.length === 0) {
        return { configured: false, events: [], failedFeeds: [] };
      }
      pending ??= load().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}
