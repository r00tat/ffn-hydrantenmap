import { describe, expect, it } from 'vitest';
import { LatLng } from './roadEvents';
import { eventsAtPoint } from './roadEventsHit';

/** Gerade Projektion: 1 Grad = 1000 px, y nach unten. */
const project = ([lat, lng]: LatLng) => ({ x: lng * 1000, y: -lat * 1000 });

const event = (key: string, id: string, path: LatLng[]) => ({ key, id, path });

describe('eventsAtPoint', () => {
  const closure = event('c', 'sit-1', [
    [47.13, 10.1],
    [47.13, 10.3],
  ]);
  const roadworks = event('r', 'sit-2', [
    [47.13, 10.12],
    [47.13, 10.31],
  ]);
  const elsewhere = event('e', 'sit-3', [
    [47.2, 10.1],
    [47.2, 10.3],
  ]);

  it('liefert alle übereinanderliegenden Meldungen in der gegebenen Reihenfolge', () => {
    const hits = eventsAtPoint(
      [closure, roadworks, elsewhere],
      project([47.13, 10.2]),
      project,
      8
    );
    expect(hits.map((h) => h.key)).toEqual(['c', 'r']);
  });

  it('berücksichtigt den Abstand in Pixeln', () => {
    // 0,005 Grad = 5 px neben der Linie: innerhalb von 8 px, außerhalb von 4 px.
    const click = project([47.135, 10.2]);
    expect(eventsAtPoint([closure], click, project, 8)).toHaveLength(1);
    expect(eventsAtPoint([closure], click, project, 4)).toHaveLength(0);
  });

  it('misst bis zum Segment, nicht nur bis zu den Stützpunkten', () => {
    const hits = eventsAtPoint([closure], project([47.13, 10.25]), project, 1);
    expect(hits).toHaveLength(1);
  });

  it('zeigt eine Situation mit mehreren Abschnitten nur einmal', () => {
    const part2 = event('c2', 'sit-1', [
      [47.13, 10.15],
      [47.13, 10.2],
    ]);
    const hits = eventsAtPoint(
      [closure, part2],
      project([47.13, 10.18]),
      project,
      8
    );
    expect(hits.map((h) => h.key)).toEqual(['c']);
  });

  it('trifft einen einzelnen Punkt', () => {
    const point = event('p', 'sit-4', [[47.5, 16.8]]);
    expect(
      eventsAtPoint([point], project([47.5, 16.803]), project, 8)
    ).toHaveLength(1);
    expect(
      eventsAtPoint([point], project([47.5, 16.81]), project, 8)
    ).toHaveLength(0);
  });
});
