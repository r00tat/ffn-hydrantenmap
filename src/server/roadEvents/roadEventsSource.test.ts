import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  createRoadEventsSource,
  evisFeedsFromEnv,
  FeedConfig,
} from './roadEventsSource';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const EVIS_PLANNED = fixture('evis-planned.xml');
// Die Bergung auf der L221 gilt am 27.11. von 07:45 bis 12:00 (UTC); hier
// ab dem 25.11., damit sie zur selben Zeit gilt wie die Baustellen.
const EVIS_UNPLANNED = fixture('evis-unplanned.xml').replaceAll(
  '2026-11-27T07:45:36Z',
  '2026-11-25T07:45:36Z'
);

// Mittwoch, 25.11.2026, 16:59 Ortszeit — eine Minute vor Ende des
// Zeitfensters der B50-Baustelle (07:30–17:00).
const BEFORE_FIVE = new Date('2026-11-25T15:59:00Z').getTime();

type SourceOptions = Parameters<typeof createRoadEventsSource>[0];

function setup(
  options: {
    fetchXml?: (name: string) => Promise<string>;
    checksum?: () => string;
  } & Partial<SourceOptions> = {}
) {
  let now = BEFORE_FIVE;
  const fetchXml = vi.fn(
    options.fetchXml ??
      (async (name: string) =>
        name === 'evis-unplanned-AT' ? EVIS_UNPLANNED : EVIS_PLANNED)
  );
  const checksum = options.checksum ?? (() => 'a');
  const fetchChecksum = vi.fn(async () => checksum());
  const feeds: FeedConfig[] = ['evis-unplanned-AT', 'evis-planned-AT'].map(
    (name) => ({
      name,
      source: 'evis',
      fetchXml: () => fetchXml(name),
      fetchChecksum,
    })
  );
  const source = createRoadEventsSource({
    feeds,
    now: () => new Date(now),
    ttlMs: 60_000,
    ...options,
  });
  return {
    source,
    fetchXml,
    fetchChecksum,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('evisFeedsFromEnv', () => {
  const client = {
    fetchData: vi.fn(async () => ''),
    fetchChecksum: vi.fn(async () => 'c'),
  };

  it('ist ohne Schlüssel leer', () => {
    expect(evisFeedsFromEnv({}, client)).toEqual([]);
  });

  it('ruft beide Pakete für ganz Österreich ab', async () => {
    const feeds = evisFeedsFromEnv({ EVIS_API_KEY: 'k' }, client);
    expect(feeds.map((f) => f.name)).toEqual([
      'evis-unplanned-AT',
      'evis-planned-AT',
    ]);
    expect(feeds.every((f) => f.source === 'evis')).toBe(true);

    await feeds[1].fetchXml();
    expect(client.fetchData).toHaveBeenCalledWith('EventsPlanned', 'AT', 'k');
    await feeds[1].fetchChecksum?.();
    expect(client.fetchChecksum).toHaveBeenCalledWith(
      'EventsPlanned',
      'AT',
      'k'
    );
  });

  it('nimmt die Regionen aus EVIS_REGIONS und übergeht unbekannte', () => {
    const feeds = evisFeedsFromEnv(
      { EVIS_API_KEY: 'k', EVIS_REGIONS: 'AT-1, AT-ASF ,Wien,AT-10' },
      client
    );
    expect(feeds.map((f) => f.name)).toEqual([
      'evis-unplanned-AT-1',
      'evis-planned-AT-1',
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

  it('führt beide Pakete zusammen, Sperren zuerst', async () => {
    const { source } = setup();

    const result = await source.get();

    expect(result.configured).toBe(true);
    expect(result.failedFeeds).toEqual([]);
    expect(new Set(result.events.map((e) => e.road))).toEqual(
      new Set(['B50', 'B62', 'L219', 'L221'])
    );
    expect(result.events[0].kind).toBe('closure');
  });

  it('zeichnet den mitgelieferten Verlauf', async () => {
    const { source } = setup();

    const { events } = await source.get();

    const b50 = events.filter((e) => e.road === 'B50');
    expect(b50).toHaveLength(2);
    expect(b50[0].path).toHaveLength(4);
    expect(b50[0].approximate).toBe(false);
  });

  it('zeichnet eine gestrichelte Gerade, wenn der Verlauf fehlt', async () => {
    // Nur Anfang und Ende, keine Zwischenpunkte
    const xml = EVIS_UNPLANNED.replace(
      /<intermediate\b[\s\S]*?<\/intermediate>/g,
      ''
    );
    const { source } = setup({ fetchXml: async () => xml });

    const { events } = await source.get();

    const l221 = events.find((e) => e.road === 'L221');
    expect(l221?.path).toEqual([l221?.from, l221?.to]);
    expect(l221?.approximate).toBe(true);
  });

  it('liefert bei Ausfall eines Pakets die übrigen und nennt das fehlende', async () => {
    const { source } = setup({
      fetchXml: async (name) => {
        if (name === 'evis-planned-AT') throw new Error('503');
        return EVIS_UNPLANNED;
      },
    });

    const result = await source.get();

    expect(result.failedFeeds).toEqual(['evis-planned-AT']);
    expect(result.events.map((e) => e.road)).toEqual(['L221']);
  });

  it('ruft innerhalb der Cache-Zeit nicht erneut ab', async () => {
    const { source, fetchChecksum, advance } = setup();

    await source.get();
    advance(30_000);
    await source.get();
    expect(fetchChecksum).toHaveBeenCalledTimes(2);

    advance(31_000);
    await source.get();
    expect(fetchChecksum).toHaveBeenCalledTimes(4);
  });

  it('teilt gleichzeitige Abrufe', async () => {
    const { source, fetchXml } = setup();

    await Promise.all([source.get(), source.get(), source.get()]);

    expect(fetchXml).toHaveBeenCalledTimes(2);
  });

  it('lädt die Daten erst wieder, wenn sich die Prüfsumme ändert', async () => {
    let checksum = 'a';
    const { source, fetchXml, advance } = setup({ checksum: () => checksum });

    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(2);

    advance(61_000);
    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(2);

    checksum = 'b';
    advance(61_000);
    await source.get();
    expect(fetchXml).toHaveBeenCalledTimes(4);
  });

  it('wertet Zeitfenster auch bei unveränderter Prüfsumme neu aus', async () => {
    const { source, advance } = setup();

    const before = await source.get();
    expect(before.events.some((e) => e.road === 'B50')).toBe(true);

    advance(2 * 60_000);
    const after = await source.get();
    expect(after.events.some((e) => e.road === 'B50')).toBe(false);
  });

  it('lädt die Daten trotzdem, wenn die Prüfsumme nicht abrufbar ist', async () => {
    const { source, fetchXml } = setup({
      checksum: () => {
        throw new Error('503');
      },
    });

    const result = await source.get();

    expect(fetchXml).toHaveBeenCalledTimes(2);
    expect(result.failedFeeds).toEqual([]);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('behält nach einem fehlgeschlagenen Abruf den letzten Stand', async () => {
    let fail = false;
    let checksum = 'a';
    const { source, advance } = setup({
      checksum: () => checksum,
      fetchXml: async (name) => {
        if (fail) throw new Error('timeout');
        return name === 'evis-unplanned-AT' ? EVIS_UNPLANNED : EVIS_PLANNED;
      },
    });

    await source.get();
    fail = true;
    checksum = 'b';
    advance(61_000);
    const after = await source.get();

    expect(after.failedFeeds).toEqual(['evis-unplanned-AT', 'evis-planned-AT']);
    // Um 17:00 ist das Fenster der Baustellen zu; die übrigen bleiben.
    expect(new Set(after.events.map((e) => e.road))).toEqual(
      new Set(['L219', 'L221'])
    );
  });

  it('zeigt eine Meldung über die Landesgrenze nur einmal', async () => {
    // Eine Baustelle zwischen Sommerein (NÖ) und Bruckneudorf (Bgld) steht
    // in den Paketen beider Länder.
    const feed = (region: string): FeedConfig => ({
      name: `evis-planned-${region}`,
      source: 'evis',
      fetchXml: async () => EVIS_PLANNED,
    });
    const source = createRoadEventsSource({
      feeds: [feed('AT-1'), feed('AT-3')],
      now: () => new Date('2026-11-25T09:00:00Z'),
    });

    const { events } = await source.get();

    const keys = events.map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
