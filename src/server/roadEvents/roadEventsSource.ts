/**
 * Verkehrsmeldungen der ASFINAG: Abruf je Paket, kurzer Cache, Verlauf
 * entlang der Autobahn. Siehe docs/verkehrsmeldungen.md.
 *
 * Fetch, Netz und Uhr werden übergeben, damit sich Cache und Teilausfälle
 * ohne Netz prüfen lassen; die Server Action setzt die echten ein.
 */
import {
  LatLng,
  ROAD_EVENT_KIND_ORDER,
  RoadEvent,
  RoadEventsResult,
  RoadEventWithPath,
} from '../../common/roadEvents';
import { parseDatexEvents } from './datex';
import type { MotorwayGraph, PathResult } from './motorwayPath';

export interface FeedConfig {
  /** Paketname für Meldungen und Log, z. B. `unplanned`. */
  name: string;
  resourceKey: string;
}

const FEED_ENV: [string, string][] = [
  ['unplanned', 'ASFINAG_UNPLANNED_RESOURCE_KEY'],
  ['planned', 'ASFINAG_PLANNED_RESOURCE_KEY'],
];

/** Pakete, für die ein Zugriffsschlüssel hinterlegt ist. */
export function asfinagFeedsFromEnv(
  env: Record<string, string | undefined>
): FeedConfig[] {
  return FEED_ENV.flatMap(([name, variable]) => {
    const resourceKey = env[variable]?.trim();
    return resourceKey ? [{ name, resourceKey }] : [];
  });
}

export interface RoadEventsSourceOptions {
  feeds: FeedConfig[];
  fetchXml: (resourceKey: string) => Promise<string>;
  loadGraph: () => Promise<MotorwayGraph>;
  findPath: (graph: MotorwayGraph, from: LatLng, to: LatLng) => PathResult;
  now?: () => Date;
  /** Wie lange ein Paket als frisch gilt. */
  ttlMs?: number;
}

interface FeedState {
  fetchedAt: number;
  events: RoadEvent[];
  failed: boolean;
}

/** Obergrenze des Verlaufs-Caches; darüber wird er geleert (alte Versionen). */
const PATH_CACHE_MAX = 5000;

export function createRoadEventsSource({
  feeds,
  fetchXml,
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
      const xml = await fetchXml(feed.resourceKey);
      states.set(feed.name, {
        fetchedAt: time.getTime(),
        events: parseDatexEvents(xml, { now: time }),
        failed: false,
      });
    } catch (err) {
      console.error(`ASFINAG-Paket ${feed.name} nicht abrufbar`, err);
      states.set(feed.name, {
        fetchedAt: time.getTime(),
        events: previous?.events ?? [],
        failed: true,
      });
    }
  }

  async function withPath(event: RoadEvent): Promise<RoadEventWithPath> {
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
    const events = feeds.flatMap((feed) => states.get(feed.name)?.events ?? []);
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
