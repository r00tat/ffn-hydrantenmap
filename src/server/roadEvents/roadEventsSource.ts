/**
 * Verkehrsmeldungen von EVIS.AT: Abruf je Paket, Prüfsumme vor den Daten,
 * Auswertung der Zeitfenster je Minute. Siehe docs/verkehrsmeldungen.md.
 *
 * Abruf und Uhr werden übergeben, damit sich Cache und Teilausfälle ohne
 * Netz prüfen lassen; die Server Action setzt die echten ein.
 */
import {
  ROAD_EVENT_KIND_ORDER,
  RoadEvent,
  RoadEventSource,
  RoadEventsResult,
  RoadEventWithPath,
} from '../../common/roadEvents';
import { currentEvents, DatexRecord, parseDatexRecords } from './datex';

export interface FeedConfig {
  /** Paketname für Meldungen und Log, z. B. `evis-planned-AT`. */
  name: string;
  source: RoadEventSource;
  /** DATEX-II-XML des Pakets; leer, wenn es nichts zu melden gibt. */
  fetchXml: () => Promise<string>;
  /**
   * Prüfsumme des Pakets. Ist sie unverändert, wird das Paket weder geladen
   * noch neu gelesen.
   */
  fetchChecksum?: () => Promise<string>;
}

type Env = Record<string, string | undefined>;

export type EvisPackage = 'EventsUnplanned' | 'EventsPlanned';

export interface EvisClient {
  fetchData(pkg: EvisPackage, region: string, apiKey: string): Promise<string>;
  fetchChecksum(
    pkg: EvisPackage,
    region: string,
    apiKey: string
  ): Promise<string>;
}

/** Ganz Österreich, Landesstraßen und ASFINAG-Strecken. */
export const EVIS_DEFAULT_REGIONS = ['AT'];
const EVIS_REGION = /^AT(-[1-9]|-ASF)?$/;
const EVIS_PACKAGES: [string, EvisPackage][] = [
  ['unplanned', 'EventsUnplanned'],
  ['planned', 'EventsPlanned'],
];

/**
 * Pakete von EVIS.AT je Region (`EVIS_REGIONS`, kommagetrennt, Vorgabe
 * ganz Österreich). Ohne `EVIS_API_KEY` keine.
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
  now?: () => Date;
  /** Wie lange ein Paket und das Ergebnis als frisch gelten. */
  ttlMs?: number;
}

interface FeedState {
  fetchedAt: number;
  checksum?: string;
  /**
   * Gelesene Einträge des Pakets. Das XML selbst wird nicht behalten: ganz
   * Österreich sind über 50 MB.
   */
  records: DatexRecord[];
  failed: boolean;
}

/**
 * Eine Meldung ohne mitgelieferten Verlauf wird als Gerade gezeichnet und
 * als ungefähr gekennzeichnet (gestrichelt).
 */
function withPath(event: RoadEvent): RoadEventWithPath {
  if (event.path && event.path.length >= 2) {
    return { ...event, path: event.path, approximate: false };
  }
  const point = event.from.join() === event.to.join();
  return {
    ...event,
    path: point ? [event.from] : [event.from, event.to],
    approximate: !point,
  };
}

export function createRoadEventsSource({
  feeds,
  now = () => new Date(),
  ttlMs = 60_000,
}: RoadEventsSourceOptions) {
  const states = new Map<string, FeedState>();
  let cached: { at: number; result: RoadEventsResult } | undefined;
  let pending: Promise<RoadEventsResult> | undefined;

  async function refreshFeed(feed: FeedConfig, time: number): Promise<void> {
    const previous = states.get(feed.name);
    // Auch nach einem Fehler erst nach Ablauf erneut: die ASFINAG behält
    // sich Lastgrenzen vor, ein Ausfall soll nicht zu Dauerabrufen führen.
    if (previous && time - previous.fetchedAt < ttlMs) return;
    try {
      // Die Prüfsumme kommt vor den Daten: Ändern sie sich dazwischen, passt
      // die gespeicherte Prüfsumme nicht mehr und der nächste Abruf lädt neu.
      const checksum = await feed.fetchChecksum?.().catch((err) => {
        console.warn(`Prüfsumme für ${feed.name} nicht abrufbar`, err);
        return undefined;
      });
      if (checksum !== undefined && previous?.checksum === checksum) {
        states.set(feed.name, { ...previous, fetchedAt: time });
        return;
      }
      const records = parseDatexRecords(await feed.fetchXml());
      states.set(feed.name, {
        fetchedAt: time,
        checksum,
        records,
        failed: false,
      });
    } catch (err) {
      console.error(
        `Verkehrsmeldungen: Paket ${feed.name} nicht abrufbar`,
        err
      );
      states.set(feed.name, {
        fetchedAt: time,
        // Ohne Prüfsumme lädt der nächste Abruf sicher neu.
        checksum: undefined,
        records: previous?.records ?? [],
        failed: true,
      });
    }
  }

  async function load(time: Date): Promise<RoadEventsResult> {
    await Promise.all(feeds.map((feed) => refreshFeed(feed, time.getTime())));

    const failedFeeds = feeds
      .filter((feed) => states.get(feed.name)?.failed)
      .map((feed) => feed.name);
    // Eine Situation über eine Landesgrenze steht in den Paketen beider
    // Länder, falls mehrere Regionen eingestellt sind. Je Situation und Ort
    // bleibt die neueste Version.
    const unique = new Map<string, RoadEvent>();
    for (const feed of feeds) {
      const records = states.get(feed.name)?.records ?? [];
      for (const event of currentEvents(records, time, feed.source)) {
        const known = unique.get(event.key);
        if (!known || Number(event.version) > Number(known.version)) {
          unique.set(event.key, event);
        }
      }
    }
    const events = [...unique.values()].map(withPath);
    events.sort(
      (a, b) =>
        ROAD_EVENT_KIND_ORDER.indexOf(a.kind) -
        ROAD_EVENT_KIND_ORDER.indexOf(b.kind)
    );
    return { configured: true, events, failedFeeds };
  }

  return {
    async get(): Promise<RoadEventsResult> {
      if (feeds.length === 0) {
        return { configured: false, events: [], failedFeeds: [] };
      }
      const time = now();
      // Ein Ergebnis gilt eine Minute; so werden die Zeitfenster je Minute
      // neu ausgewertet, nicht bei jedem Kartenausschnitt.
      if (cached && time.getTime() - cached.at < ttlMs) return cached.result;
      pending ??= load(time)
        .then((result) => {
          cached = { at: time.getTime(), result };
          return result;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
