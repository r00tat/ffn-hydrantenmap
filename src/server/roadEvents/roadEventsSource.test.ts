import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { LatLng } from '../../common/roadEvents';
import { asfinagFeedsFromEnv, createRoadEventsSource } from './roadEventsSource';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const UNPLANNED = fixture('asfinag-unplanned.xml');
const PLANNED = fixture('asfinag-planned.xml');

/** Zeitpunkt, an dem in beiden Fixtures Meldungen gültig sind. */
const NOW = new Date('2026-04-27T22:00:00+02:00');

const FEEDS = [
  { name: 'unplanned', resourceKey: 'key-u' },
  { name: 'planned', resourceKey: 'key-p' },
];

function setup(overrides: Partial<Parameters<typeof createRoadEventsSource>[0]> = {}) {
  let now = NOW.getTime();
  const fetchXml = vi.fn(async (resourceKey: string) =>
    resourceKey === 'key-u' ? UNPLANNED : PLANNED
  );
  const findPath = vi.fn((_graph: unknown, from: LatLng, to: LatLng) => ({
    path: [from, to],
    approximate: false,
  }));
  const source = createRoadEventsSource({
    feeds: FEEDS,
    fetchXml,
    loadGraph: async () => ({}) as never,
    findPath,
    now: () => new Date(now),
    ttlMs: 60_000,
    ...overrides,
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
  it('nimmt nur Pakete mit hinterlegtem Schlüssel', () => {
    expect(
      asfinagFeedsFromEnv({ ASFINAG_UNPLANNED_RESOURCE_KEY: 'abc' })
    ).toEqual([{ name: 'unplanned', resourceKey: 'abc' }]);
    expect(asfinagFeedsFromEnv({})).toEqual([]);
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
