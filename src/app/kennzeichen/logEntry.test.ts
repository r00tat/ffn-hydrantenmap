import { describe, it, expect } from 'vitest';
import { buildKennzeichenLogEntry } from './logEntry';

describe('buildKennzeichenLogEntry', () => {
  it('assembles a full log entry with plate, system and user', () => {
    const entry = buildKennzeichenLogEntry({
      user: 'test@example.com',
      groupId: 'ffnd',
      system: 'einsatz',
      platePrefix: 'FW',
      plateNumber: 'KFZ3',
      resultCount: 1,
      success: true,
      timestamp: '2026-07-20T10:00:00.000Z',
    });
    expect(entry).toEqual({
      user: 'test@example.com',
      groupId: 'ffnd',
      system: 'einsatz',
      plate: 'FW KFZ3',
      resultCount: 1,
      success: true,
      timestamp: '2026-07-20T10:00:00.000Z',
    });
  });

  it('uppercases and trims the plate parts', () => {
    const entry = buildKennzeichenLogEntry({
      user: 'u@e.at',
      groupId: 'g',
      system: 'uebung',
      platePrefix: ' fw ',
      plateNumber: ' kfz1 ',
      resultCount: 0,
      success: false,
      timestamp: '2026-07-20T10:00:00.000Z',
    });
    expect(entry.plate).toBe('FW KFZ1');
  });
});
