import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { LatLng } from '../../common/roadEvents';
import network from './data/gip-motorways.json';
import { parseDatexEvents } from './datex';
import {
  buildMotorwayGraph,
  findMotorwayPath,
  MotorwayNetworkFile,
} from './motorwayPath';

/**
 * Gegenprobe am echten GIP-Netz: Die Meldungen der Fixtures sollen entlang
 * der Autobahn gezeichnet werden und nicht als gerade Linie.
 */
const graph = buildMotorwayGraph(network as unknown as MotorwayNetworkFile);

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

function meters(a: LatLng, b: LatLng): number {
  const cos = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[1] - a[1]) * 111320 * cos, (b[0] - a[0]) * 110540);
}

function length(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += meters(path[i - 1], path[i]);
  return total;
}

const events = [
  ...parseDatexEvents(fixture('asfinag-unplanned.xml'), {
    now: new Date('2026-02-18T22:00:00Z'),
  }),
  ...parseDatexEvents(fixture('asfinag-planned.xml'), {
    now: new Date('2026-04-27T22:00:00+02:00'),
  }),
];

describe('Autobahnnetz aus GIP', () => {
  it('enthält das ganze A/S-Netz', () => {
    expect(graph.links.length).toBeGreaterThan(20_000);
  });

  it('zeichnet die Meldungen der Fixtures entlang der Straße', () => {
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const event of events) {
      const result = findMotorwayPath(graph, event.from, event.to);
      const direct = meters(event.from, event.to);

      expect(result.approximate, `${event.id} ${event.road}`).toBe(false);
      expect(meters(result.path[0], event.from)).toBeLessThan(150);
      expect(meters(result.path.at(-1)!, event.to)).toBeLessThan(150);
      expect(length(result.path)).toBeLessThanOrEqual(direct * 1.5 + 1000);
    }
  });
});
