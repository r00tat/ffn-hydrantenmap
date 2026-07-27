import { describe, it, expect } from 'vitest';
import {
  buildNewFirecallPayload,
  createDefaultEinsatz,
  createEinsatzFromAlarm,
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

describe('createEinsatzFromAlarm', () => {
  it('marks the einsatz as not deleted', () => {
    // A firecall written without `deleted: false` is invisible to every list
    // query (`where('deleted', '==', false)` never matches an absent field),
    // which previously produced duplicate, unreachable Einsätze.
    const einsatz = createEinsatzFromAlarm(baseAlarm(), {
      group: 'ffnd',
      fw: 'Neusiedl am See',
    });

    expect(einsatz.deleted).toBe(false);
  });

  it('applies the alarm fields plus group and fw', () => {
    const einsatz = createEinsatzFromAlarm(
      baseAlarm({
        alarmId: 'a9',
        alarmText: 'a/b/G1/Ölspur/Neusiedl am See/Am Tabor/7',
        coordinates: { lat: 47.95, lon: 16.84 },
      }),
      { group: 'ffnd', fw: 'Neusiedl am See' },
    );

    expect(einsatz.name).toBe('G1 Ölspur Neusiedl am See');
    expect(einsatz.blaulichtSmsAlarmId).toBe('a9');
    expect(einsatz.blaulichtSmsAlarmIds).toEqual(['a9']);
    expect(einsatz.lat).toBe(47.95);
    expect(einsatz.lng).toBe(16.84);
    expect(einsatz.group).toBe('ffnd');
    expect(einsatz.fw).toBe('Neusiedl am See');
  });

  it('accepts empty group and fw without dropping the deleted flag', () => {
    const einsatz = createEinsatzFromAlarm(baseAlarm(), { group: '', fw: '' });

    expect(einsatz.group).toBe('');
    expect(einsatz.fw).toBe('');
    expect(einsatz.deleted).toBe(false);
  });
});

describe('buildNewFirecallPayload', () => {
  const now = new Date('2026-07-27T12:52:40.000Z');

  it('always sets deleted: false when the firecall has no deleted flag', () => {
    const payload = buildNewFirecallPayload({ name: 'Test' } as Firecall, {
      user: 'test@example.com',
      now,
    });

    expect(payload.deleted).toBe(false);
  });

  it('preserves an explicit deleted flag', () => {
    const payload = buildNewFirecallPayload(
      { name: 'Test', deleted: true } as Firecall,
      { user: 'test@example.com', now },
    );

    expect(payload.deleted).toBe(true);
  });

  it('stamps user and created', () => {
    const payload = buildNewFirecallPayload({ name: 'Test' } as Firecall, {
      user: 'test@example.com',
      now,
    });

    expect(payload.user).toBe('test@example.com');
    expect(payload.created).toBe(now.toISOString());
  });

  it('falls back to the given position when the firecall has no coordinates', () => {
    const payload = buildNewFirecallPayload({ name: 'Test' } as Firecall, {
      user: 'u',
      lat: 47.9,
      lng: 16.8,
      now,
    });

    expect(payload.lat).toBe(47.9);
    expect(payload.lng).toBe(16.8);
  });

  it('keeps the firecall coordinates over the fallback position', () => {
    const payload = buildNewFirecallPayload(
      { name: 'Test', lat: 48.1, lng: 16.3 } as Firecall,
      { user: 'u', lat: 47.9, lng: 16.8, now },
    );

    expect(payload.lat).toBe(48.1);
    expect(payload.lng).toBe(16.3);
  });

  it('strips nullish values so Firestore accepts the payload', () => {
    const payload = buildNewFirecallPayload(
      { name: 'Test', abruecken: undefined } as Firecall,
      { user: 'u', now },
    );

    expect('abruecken' in payload).toBe(false);
    expect('id' in payload).toBe(false);
  });
});
