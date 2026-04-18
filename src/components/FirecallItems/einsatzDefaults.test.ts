import { describe, it, expect } from 'vitest';
import {
  createDefaultEinsatz,
  DEFAULT_EINSATZ_FW,
  DEFAULT_EINSATZ_GROUP,
  resetEinsatzToManual,
} from './einsatzDefaults';
import { Firecall } from '../firebase/firestore';

describe('createDefaultEinsatz', () => {
  it('produces default values based on the given date', () => {
    const now = new Date('2026-04-18T12:34:56.000Z');
    const einsatz = createDefaultEinsatz(now);

    expect(einsatz.group).toBe(DEFAULT_EINSATZ_GROUP);
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
    };

    const reset = resetEinsatzToManual(current, now);

    expect(reset.description).toBe('');
    expect(reset.date).toBe(now.toISOString());
    expect(reset.eintreffen).toBe(now.toISOString());
    expect(reset.abruecken).toBeUndefined();
    expect(reset.lat).toBeUndefined();
    expect(reset.lng).toBeUndefined();
    expect(reset.blaulichtSmsAlarmId).toBeUndefined();
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
