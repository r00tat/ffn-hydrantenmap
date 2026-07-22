import { describe, it, expect } from 'vitest';
import {
  createDefaultEinsatz,
  DEFAULT_EINSATZ_FW,
  resetEinsatzToManual,
  buildFirecallFromAlarm,
} from './einsatzDefaults';
import { Firecall } from '../firebase/firestore';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

describe('createDefaultEinsatz', () => {
  it('produces default values based on the given date', () => {
    const now = new Date('2026-04-18T12:34:56.000Z');
    const einsatz = createDefaultEinsatz(now);

    // group is unset by default — the dialog assigns it from the
    // user's group memberships so we never default to a foreign group.
    expect(einsatz.group).toBeUndefined();
    expect(einsatz.fw).toBe(DEFAULT_EINSATZ_FW);
    expect(einsatz.description).toBe('');
    expect(einsatz.deleted).toBe(false);
    expect(einsatz.date).toBe(now.toISOString());
    expect(einsatz.eintreffen).toBe(now.toISOString());
    expect(einsatz.name).toMatch(/^Einsatz am /);
  });

  it('respects overrides', () => {
    const now = new Date('2026-04-18T12:00:00.000Z');
    const einsatz = createDefaultEinsatz(now, { group: 'other', fw: 'Test FW' });

    expect(einsatz.group).toBe('other');
    expect(einsatz.fw).toBe('Test FW');
  });
});

describe('resetEinsatzToManual', () => {
  it('clears alarm-derived fields and resets date/eintreffen to now', () => {
    const now = new Date('2026-04-18T08:00:00.000Z');
    const current: Firecall = {
      name: 'Von Alarm befüllt',
      group: 'ffnd',
      fw: 'Neusiedl am See',
      description: 'alter Alarmtext',
      date: '2026-04-17T10:00:00.000Z',
      eintreffen: '2026-04-17T10:05:00.000Z',
      abruecken: '2026-04-17T11:00:00.000Z',
      lat: 47.95,
      lng: 16.84,
      blaulichtSmsAlarmId: 'alarm-123',
      blaulichtSmsAlarmIds: ['alarm-123', 'alarm-456'],
    };

    const reset = resetEinsatzToManual(current, now);

    expect(reset.description).toBe('');
    expect(reset.date).toBe(now.toISOString());
    expect(reset.eintreffen).toBe(now.toISOString());
    expect(reset.abruecken).toBeUndefined();
    expect(reset.lat).toBeUndefined();
    expect(reset.lng).toBeUndefined();
    expect(reset.blaulichtSmsAlarmId).toBeUndefined();
    expect(reset.blaulichtSmsAlarmIds).toBeUndefined();
    expect(reset.name).toMatch(/^Einsatz am /);
  });

  it('preserves group and fw and empty-string values', () => {
    const now = new Date('2026-04-18T08:00:00.000Z');
    const current: Firecall = {
      name: 'Test',
      group: 'custom-group',
      fw: 'Custom FW',
      blaulichtSmsAlarmId: 'x',
    };

    const reset = resetEinsatzToManual(current, now);

    expect(reset.group).toBe('custom-group');
    expect(reset.fw).toBe('Custom FW');
  });
});

const baseAlarm = (overrides: Partial<BlaulichtSmsAlarm> = {}): BlaulichtSmsAlarm =>
  ({
    alarmId: 'a1',
    alarmText: 'x',
    alarmDate: '2026-07-22T10:00:00.000Z',
    geolocation: null,
    coordinates: null,
    ...overrides,
  } as BlaulichtSmsAlarm);

describe('buildFirecallFromAlarm', () => {
  it('parses the name from parts[2..4] when alarmText has >=5 segments', () => {
    const fc = buildFirecallFromAlarm(
      baseAlarm({ alarmText: 'a/b/B2/Zimmerbrand/Neusiedl/extra' }),
    );
    expect(fc.name).toBe('B2 Zimmerbrand Neusiedl');
  });

  it('falls back to the full alarmText when fewer than 5 segments', () => {
    const fc = buildFirecallFromAlarm(baseAlarm({ alarmText: 'a/b/c' }));
    expect(fc.name).toBe('a/b/c');
  });

  it('sets date, description and both alarm id fields', () => {
    const fc = buildFirecallFromAlarm(
      baseAlarm({ alarmId: 'a1', alarmText: 'hello', alarmDate: '2026-07-22T10:00:00.000Z' }),
    );
    expect(fc.date).toBe('2026-07-22T10:00:00.000Z');
    expect(fc.description).toBe('hello');
    expect(fc.blaulichtSmsAlarmId).toBe('a1');
    expect(fc.blaulichtSmsAlarmIds).toEqual(['a1']);
  });

  it('uses geolocation coordinates when present', () => {
    const fc = buildFirecallFromAlarm(
      baseAlarm({
        geolocation: {
          coordinates: { lat: 47.9, lon: 16.8 },
        } as BlaulichtSmsAlarm['geolocation'],
      }),
    );
    expect(fc.lat).toBe(47.9);
    expect(fc.lng).toBe(16.8);
  });

  it('falls back to coordinates when geolocation is absent', () => {
    const fc = buildFirecallFromAlarm(
      baseAlarm({ coordinates: { lat: 48.1, lon: 16.3 } }),
    );
    expect(fc.lat).toBe(48.1);
    expect(fc.lng).toBe(16.3);
  });

  it('omits lat/lng when no coordinates are available', () => {
    const fc = buildFirecallFromAlarm(baseAlarm());
    expect(fc.lat).toBeUndefined();
    expect(fc.lng).toBeUndefined();
  });
});
