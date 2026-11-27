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

describe('parseDatexEvents mit EVIS.AT (Landesstraßen)', () => {
  const evisPlanned = fixture('evis-planned.xml');
  const evisUnplanned = fixture('evis-unplanned.xml');
  // Mittwoch, 25.11.2026, 10:00 Ortszeit (MEZ)
  const WEDNESDAY_MORNING = new Date('2026-11-25T09:00:00Z');
  const parse = (xml: string, now: Date) =>
    parseDatexEvents(xml, { now, source: 'evis' });

  it('liest jede Richtung einer Route als eigenen Abschnitt mit mitgeliefertem Verlauf', () => {
    const b50 = parse(evisPlanned, WEDNESDAY_MORNING).filter(
      (e) => e.road === 'B50'
    );

    expect(b50).toHaveLength(2);
    expect(new Set(b50.map((e) => e.key)).size).toBe(2);
    for (const event of b50) {
      expect(event.source).toBe('evis');
      expect(event.kind).toBe('restriction');
      expect(event.roadName).toBe('Burgenland Straße');
      // Anfang, zwei Zwischenpunkte, Ende
      expect(event.path).toHaveLength(4);
      expect(event.path?.[0]).toEqual(event.from);
      expect(event.path?.[3]).toEqual(event.to);
    }
    expect(b50[0].path).toEqual([
      [47.60647, 16.4062767],
      [47.60623, 16.40641],
      [47.60596, 16.40656],
      [47.60588, 16.4066086],
    ]);
  });

  it('liest auch einen einzelnen Abschnitt (Linear) samt Zwischenpunkten', () => {
    const b62 = parse(evisPlanned, WEDNESDAY_MORNING).filter(
      (e) => e.road === 'B62'
    );
    expect(b62).toHaveLength(1);
    expect(b62[0].path!.length).toBeGreaterThan(2);
  });

  it('stuft eine gesperrte Landesstraße als Sperre ein und zeigt alle Kommentare', () => {
    const l219 = parse(evisPlanned, WEDNESDAY_MORNING).filter(
      (e) => e.road === 'L219'
    );
    expect(l219.length).toBeGreaterThan(0);
    expect(l219[0].kind).toBe('closure');
    expect(l219[0].description).toMatch(/^L219 - Mattersburger Straße/);
    expect(l219[0].description).toContain('Umbau Bahnhof Neudörfl');
  });

  it('entfernt die UUIDs, die EVIS statt Ortsnamen in den Text schreibt', () => {
    const [b50] = parse(evisPlanned, WEDNESDAY_MORNING).filter(
      (e) => e.road === 'B50'
    );
    expect(b50.description).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(b50.description).toMatch(
      /^B50 - Burgenland Straße: Im Gemeindegebiet/
    );
    expect(b50.description).toContain('Kilometer 81.571');
  });

  it('zeigt Baustellen mit Zeitfenster nur innerhalb des Fensters', () => {
    const roads = (now: Date) =>
      new Set(parse(evisPlanned, now).map((e) => e.road));

    // Mittwoch 19:00 Ortszeit: B50 (07:30–17:00) und B62 (08:00–17:00) ruhen,
    // die durchgehende Sperre der L219 gilt weiter.
    expect(roads(new Date('2026-11-25T18:00:00Z'))).toEqual(new Set(['L219']));
    // Mittwoch 07:00 Ortszeit: vor beiden Fenstern
    expect(roads(new Date('2026-11-25T06:00:00Z'))).toEqual(new Set(['L219']));
    // Samstag 10:00 Ortszeit: nur werktags
    expect(roads(new Date('2026-11-28T09:00:00Z'))).toEqual(new Set(['L219']));
    // Mittwoch 16:59 Ortszeit: noch im Fenster
    expect(roads(new Date('2026-11-25T15:59:00Z')).has('B50')).toBe(true);
  });

  it('liest die ungeplanten Ereignisse', () => {
    const events = parse(evisUnplanned, new Date('2026-11-27T10:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ road: 'L221', source: 'evis' });
    expect(events[0].description).toContain('Bergungsarbeiten');
  });

  it('kennzeichnet Meldungen der ASFINAG ohne Angabe als asfinag', () => {
    const events = parseDatexEvents(unplanned, {
      now: new Date('2026-02-18T22:00:00Z'),
    });
    expect(events[0].source).toBe('asfinag');
  });
});

describe('classifyRecord (Richtungsfahrbahn)', () => {
  it('stuft eine gesperrte Richtungsfahrbahn als Sperre ein', () => {
    expect(
      classifyRecord({
        type: 'MaintenanceWorks',
        trafficConstrictionType: 'carriagewayBlocked',
      })
    ).toBe('closure');
  });
});
