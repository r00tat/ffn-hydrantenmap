import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { LatLng } from '../../common/roadEvents';
import {
  asfinagFeedsFromEnv,
  createRoadEventsSource,
  evisFeedsFromEnv,
  FeedConfig,
} from './roadEventsSource';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const UNPLANNED = fixture('asfinag-unplanned.xml');
const PLANNED = fixture('asfinag-planned.xml');

/** Zeitpunkt, an dem in beiden Fixtures Meldungen gültig sind. */
const NOW = new Date('2026-04-27T22:00:00+02:00');

type SourceOptions = Parameters<typeof createRoadEventsSource>[0];

function setup(
  overrides: Partial<SourceOptions> & {
    fetchXml?: (resourceKey: string) => Promise<string>;
  } = {}
) {
  let now = NOW.getTime();
  const fetchXml = vi.fn(
    overrides.fetchXml ??
      (async (resourceKey: string) =>
        resourceKey === 'key-u' ? UNPLANNED : PLANNED)
  );
  const feeds: FeedConfig[] = asfinagFeedsFromEnv(
    {
      ASFINAG_UNPLANNED_RESOURCE_KEY: 'key-u',
      ASFINAG_PLANNED_RESOURCE_KEY: 'key-p',
    },
    fetchXml
  );
  const findPath = vi.fn((_graph: unknown, from: LatLng, to: LatLng) => ({
    path: [from, to],
    approximate: false,
  }));
  const { fetchXml: _ignored, ...rest } = overrides;
  void _ignored;
  const source = createRoadEventsSource({
    feeds,
    loadGraph: async () => ({}) as never,
    findPath,
    now: () => new Date(now),
    ttlMs: 60_000,
    ...rest,
  });
  return {
    source,
    fetchXml,
    findPath,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('asfinagFeedsFromEnv', () => {
  it('nimmt nur Pakete mit hinterlegtem Schlüssel', async () => {
    const fetchXml = vi.fn(async () => '');
    const feeds = asfinagFeedsFromEnv(
      { ASFINAG_UNPLANNED_RESOURCE_KEY: ' abc ' },
      fetchXml
    );
    expect(feeds.map((f) => [f.name, f.source])).toEqual([
      ['unplanned', 'asfinag'],
    ]);
    await feeds[0].fetchXml();
    expect(fetchXml).toHaveBeenCalledWith('abc');
    expect(asfinagFeedsFromEnv({}, fetchXml)).toEqual([]);
  });
});

describe('evisFeedsFromEnv', () => {
  const client = {
    fetchData: vi.fn(async () => ''),
    fetchChecksum: vi.fn(async () => 'c'),
  };

  it('ist ohne Schlüssel leer', () => {
    expect(evisFeedsFromEnv({}, client)).toEqual([]);
  });

  it('ruft beide Pakete für Burgenland und Niederösterreich ab', async () => {
    const feeds = evisFeedsFromEnv({ EVIS_API_KEY: 'k' }, client);
    expect(feeds.map((f) => f.name)).toEqual([
      'evis-unplanned-AT-1',
      'evis-planned-AT-1',
      'evis-unplanned-AT-3',
      'evis-planned-AT-3',
    ]);
    expect(feeds.every((f) => f.source === 'evis')).toBe(true);

    await feeds[1].fetchXml();
    expect(client.fetchData).toHaveBeenCalledWith('EventsPlanned', 'AT-1', 'k');
    await feeds[1].fetchChecksum?.();
    expect(client.fetchChecksum).toHaveBeenCalledWith(
      'EventsPlanned',
      'AT-1',
      'k'
    );
  });

  it('nimmt die Regionen aus EVIS_REGIONS und übergeht unbekannte', () => {
    const feeds = evisFeedsFromEnv(
      { EVIS_API_KEY: 'k', EVIS_REGIONS: 'AT-6, AT-ASF ,Wien,AT-10' },
      client
    );
    expect(feeds.map((f) => f.name)).toEqual([
      'evis-unplanned-AT-6',
      'evis-planned-AT-6',
      'evis-unplanned-AT-ASF',
      'evis-planned-AT-ASF',
    ]);
  });
});

describe('createRoadEventsSource', () => {
  it('meldet „nicht eingerichtet“ ohne Pakete und ruft nichts ab', async () => {
    const { source, fetchXml } = setup({ feeds: [] });

    expect(await source.get()).toEqual({
      configured: false,
      events: [],
      failedFeeds: [],
    });
    expect(fetchXml).not.toHaveBeenCalled();
  });

  it('führt beide Pakete zusammen, Sperren zuerst, mit Verlauf', async () => {
    const { source } = setup();

    const result = await source.get();

    expect(result.configured).toBe(true);
    expect(result.failedFeeds).toEqual([]);
    expect(result.events.length).toBeGreaterThan(1);
    expect(result.events[0].kind).toBe('closure');
    expect(result.events.some((e) => e.id === '2358304_1')).toBe(true);
    for (const event of result.events) {
      expect(event.path).toEqual([event.from, event.to]);
    }
  });

  it('liefert bei Ausfall eines Pakets die übrigen und nennt das fehlende', async () => {
    const { source } = setup({
      fetchXml: async (key) => {
        if (key === 'key-p') throw new Error('503');
        return UNPLANNED;
      },
      // Zeitpunkt der aktiven A11-Sperre in der Fixture
      now: () => new Date('2026-02-18T22:00:00Z'),
    });

    const result = await source.get();

    expect(result.failedFeeds).toEqual(['planned']);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('ruft innerhalb der Cache-Zeit nicht erneut ab', async () => {
    const { source, fetchXml, advance } = setup();

    await source.get();
    advance(30_000);
    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(2);

    advance(31_000);
    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(4);
  });

  it('teilt gleichzeitige Abrufe', async () => {
    const { source, fetchXml } = setup();

    await Promise.all([source.get(), source.get(), source.get()]);

    expect(fetchXml).toHaveBeenCalledTimes(2);
  });

  it('berechnet den Verlauf je Meldung und Version nur einmal', async () => {
    const { source, findPath, advance } = setup();

    const first = await source.get();
    const calls = findPath.mock.calls.length;
    expect(calls).toBe(first.events.length);

    advance(61_000);
    await source.get();
    expect(findPath.mock.calls.length).toBe(calls);
  });

  it('behält nach einem fehlgeschlagenen Abruf den letzten Stand', async () => {
    let fail = false;
    const { source, advance } = setup({
      fetchXml: async (key) => {
        if (fail) throw new Error('timeout');
        return key === 'key-u' ? UNPLANNED : PLANNED;
      },
    });

    const before = await source.get();
    fail = true;
    advance(61_000);
    const after = await source.get();

    expect(after.failedFeeds).toEqual(['unplanned', 'planned']);
    expect(after.events.map((e) => e.key)).toEqual(
      before.events.map((e) => e.key)
    );
  });

  it('zeichnet gerade Linien, wenn das Netz nicht geladen werden kann', async () => {
    const { source } = setup({
      loadGraph: async () => {
        throw new Error('fehlt');
      },
    });

    const result = await source.get();

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => e.approximate)).toBe(true);
  });
});

describe('createRoadEventsSource mit EVIS', () => {
  const EVIS_PLANNED = fixture('evis-planned.xml');
  // Mittwoch, 25.11.2026, 16:59 Ortszeit — eine Minute vor Ende des
  // Zeitfensters der B50-Baustelle (07:30–17:00).
  const BEFORE_FIVE = new Date('2026-11-25T15:59:00Z').getTime();

  function evisSetup(checksum: () => string) {
    let now = BEFORE_FIVE;
    const fetchXml = vi.fn(async () => EVIS_PLANNED);
    const fetchChecksum = vi.fn(async () => checksum());
    const findPath = vi.fn();
    const source = createRoadEventsSource({
      feeds: [
        { name: 'evis-planned-AT-1', source: 'evis', fetchXml, fetchChecksum },
      ],
      loadGraph: async () => ({}) as never,
      findPath,
      now: () => new Date(now),
      ttlMs: 60_000,
    });
    return {
      source,
      fetchXml,
      fetchChecksum,
      findPath,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('zeichnet den mitgelieferten Verlauf, ohne das Autobahnnetz zu fragen', async () => {
    const { source, findPath } = evisSetup(() => 'a');

    const { events } = await source.get();

    const b50 = events.filter((e) => e.road === 'B50');
    expect(b50).toHaveLength(2);
    expect(b50[0].path).toHaveLength(4);
    expect(b50[0].approximate).toBe(false);
    expect(findPath).not.toHaveBeenCalled();
  });

  it('lädt die Daten erst wieder, wenn sich die Prüfsumme ändert', async () => {
    let checksum = 'a';
    const { source, fetchXml, fetchChecksum, advance } = evisSetup(
      () => checksum
    );

    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(1);

    advance(61_000);
    await source.get();
    expect(fetchChecksum).toHaveBeenCalledTimes(2);
    expect(fetchXml).toHaveBeenCalledTimes(1);

    checksum = 'b';
    advance(61_000);
    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(2);
  });

  it('wertet Zeitfenster auch bei unveränderter Prüfsumme neu aus', async () => {
    const { source, advance } = evisSetup(() => 'a');

    const before = await source.get();
    expect(before.events.some((e) => e.road === 'B50')).toBe(true);

    advance(2 * 60_000);
    const after = await source.get();
    expect(after.events.some((e) => e.road === 'B50')).toBe(false);
  });

  it('lädt die Daten trotzdem, wenn die Prüfsumme nicht abrufbar ist', async () => {
    const { source, fetchXml } = evisSetup(() => {
      throw new Error('503');
    });

    const result = await source.get();

    expect(fetchXml).toHaveBeenCalledTimes(1);
    expect(result.failedFeeds).toEqual([]);
    expect(result.events.length).toBeGreaterThan(0);
  });
});

describe('createRoadEventsSource über mehrere Regionen', () => {
  it('zeigt eine Meldung über die Landesgrenze nur einmal', async () => {
    // Eine Baustelle zwischen Sommerein (NÖ) und Bruckneudorf (Bgld) steht
    // in den Paketen beider Länder.
    const xml = fixture('evis-planned.xml');
    const feed = (region: string): FeedConfig => ({
      name: `evis-planned-${region}`,
      source: 'evis',
      fetchXml: async () => xml,
    });
    const source = createRoadEventsSource({
      feeds: [feed('AT-1'), feed('AT-3')],
      loadGraph: async () => ({}) as never,
      findPath: vi.fn(),
      now: () => new Date('2026-11-25T09:00:00Z'),
    });

    const { events } = await source.get();

    const keys = events.map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
