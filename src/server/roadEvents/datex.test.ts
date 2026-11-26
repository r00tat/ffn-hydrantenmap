import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { classifyRecord, parseDatexEvents } from './datex';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const unplanned = fixture('asfinag-unplanned.xml');
const planned = fixture('asfinag-planned.xml');

describe('parseDatexEvents', () => {
  it('liest eine aktive Sperre aus den ungeplanten Ereignissen', () => {
    const events = parseDatexEvents(unplanned, {
      now: new Date('2026-02-18T22:00:00Z'),
    });

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      id: 'XH5dIRYWS+IEjMflN+GqtQ_A11_2',
      version: '5',
      kind: 'closure',
      road: 'A11',
      roadName: 'Karawanken Autobahn',
      direction: 'Ljubljana (SLO) Richtung Villach',
      start: '2026-02-18T21:00:00Z',
      end: '2026-02-19T04:00:00Z',
      from: [46.483078, 14.008999],
      to: [46.533497, 14.030346],
    });
    expect(event.description).toMatch(/^A11 Karawanken Autobahn, Ljubljana/);
    // Zeilenumbrüche aus dem XML werden zu einfachen Leerzeichen
    expect(event.description).not.toMatch(/\s{2,}/);
    expect(event.recordTypes).toContain(
      'RoadOrCarriagewayOrLaneManagement:roadClosed'
    );
  });

  it('lässt ausgesetzte (suspended) Meldungen weg', () => {
    const events = parseDatexEvents(unplanned, {
      now: new Date('2026-02-12T12:00:00Z'),
    });
    expect(events.find((e) => e.road === 'A10')).toBeUndefined();
  });

  it('lässt Meldungen außerhalb ihres Zeitraums weg', () => {
    expect(
      parseDatexEvents(unplanned, { now: new Date('2026-02-19T05:00:00Z') })
    ).toHaveLength(0);
    expect(
      parseDatexEvents(unplanned, { now: new Date('2026-02-18T20:00:00Z') })
    ).toHaveLength(0);
  });

  it('fasst Einträge einer Situation am selben Ort zusammen, getrennte Orte bleiben getrennt', () => {
    const events = parseDatexEvents(planned, {
      now: new Date('2026-04-27T22:00:00+02:00'),
    });

    const a9 = events.filter((e) => e.id.startsWith('2358304_1'));
    expect(a9).toHaveLength(2);

    const main = a9.find((e) => e.to[0] === 47.72245);
    expect(main?.kind).toBe('closure');
    expect(main?.recordTypes).toEqual(
      expect.arrayContaining([
        'MaintenanceWorks:roadworks',
        'RoadOrCarriagewayOrLaneManagement:roadClosed',
      ])
    );
    expect(main?.url).toBe(
      'https://baustelleninfo.asfinag.at/client/details/2358304/2358306'
    );
    expect(new Set(a9.map((e) => e.key)).size).toBe(2);
  });

  it('wertet nur die direkten Einträge einer Situation aus, nicht die Übersicht in der Erweiterung', () => {
    const events = parseDatexEvents(planned, {
      now: new Date('2026-04-14T22:00:00+02:00'),
    });
    const a13 = events.filter((e) => e.id === '2357252_2');
    expect(a13).toHaveLength(1);
    expect(a13[0].kind).toBe('closure');
    expect(a13[0].road).toBe('A13');
  });

  it('liefert bei kaputtem XML eine leere Liste statt eines Fehlers', () => {
    expect(parseDatexEvents('<kein xml', { now: new Date() })).toEqual([]);
  });
});

describe('classifyRecord', () => {
  it('stuft Sperren als closure ein', () => {
    expect(
      classifyRecord({
        type: 'RoadOrCarriagewayOrLaneManagement',
        subtype: 'roadClosed',
      })
    ).toBe('closure');
    expect(
      classifyRecord({
        type: 'MaintenanceWorks',
        subtype: 'roadworks',
        trafficConstrictionType: 'roadBlocked',
      })
    ).toBe('closure');
  });

  it('stuft Baustellen und Fahrstreifensperren als restriction ein', () => {
    expect(
      classifyRecord({ type: 'MaintenanceWorks', subtype: 'resurfacingWork' })
    ).toBe('restriction');
    expect(
      classifyRecord({
        type: 'RoadOrCarriagewayOrLaneManagement',
        subtype: 'laneClosures',
      })
    ).toBe('restriction');
    expect(classifyRecord({ type: 'SpeedManagement' })).toBe('restriction');
  });

  it('stuft ungeplante Ereignisse als incident ein', () => {
    expect(classifyRecord({ type: 'Accident' })).toBe('incident');
    expect(classifyRecord({ type: 'VehicleObstruction' })).toBe('incident');
    expect(classifyRecord({ type: 'PoorEnvironmentConditions' })).toBe(
      'incident'
    );
  });
});
