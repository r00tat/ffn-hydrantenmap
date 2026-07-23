import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { whereMock, addMock, scalarRef, arrayRef } = vi.hoisted(() => ({
  whereMock: vi.fn(),
  addMock: vi.fn(),
  scalarRef: { docs: [] as any[] },
  arrayRef: { docs: [] as any[] },
}));

// Chainable query stub: .where().where()... .get()
function makeQuery(result: { docs: any[] }) {
  const q: any = {};
  q.where = vi.fn(() => q);
  q.get = vi.fn(async () => result);
  return q;
}

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({
      where: (field: string, ...rest: any[]) => {
        whereMock(field, ...rest);
        return field === 'blaulichtSmsAlarmIds'
          ? makeQuery(arrayRef)
          : makeQuery(scalarRef);
      },
      add: addMock,
    }),
  },
}));

import { createFirecallFromAlarm } from './createFirecallFromAlarm';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

const alarm = {
  alarmId: 'a1',
  alarmText: 'a/b/B2/Brand/Ort',
  alarmDate: '2026-07-22T10:00:00.000Z',
  geolocation: null,
  coordinates: null,
} as BlaulichtSmsAlarm;

describe('createFirecallFromAlarm', () => {
  beforeEach(() => {
    whereMock.mockReset();
    addMock.mockReset();
    scalarRef.docs = [];
    arrayRef.docs = [];
  });

  it('returns the existing firecall when one is linked to the alarm (idempotent)', async () => {
    scalarRef.docs = [
      { id: 'existing1', data: () => ({ name: 'Alt', group: 'ffnd', deleted: false }) },
    ];
    const result = await createFirecallFromAlarm(alarm, 'ffnd', 'owner1');
    expect(result.created).toBe(false);
    expect(result.id).toBe('existing1');
    expect(addMock).not.toHaveBeenCalled();
  });

  it('ignores soft-deleted matches and creates a new firecall', async () => {
    scalarRef.docs = [
      { id: 'deleted1', data: () => ({ name: 'Weg', group: 'ffnd', deleted: true }) },
    ];
    addMock.mockResolvedValue({ id: 'new1' });
    const result = await createFirecallFromAlarm(alarm, 'ffnd', 'owner1');
    expect(result.created).toBe(true);
    expect(result.id).toBe('new1');
    expect(addMock).toHaveBeenCalledTimes(1);
    const written = addMock.mock.calls[0][0];
    expect(written).toMatchObject({
      name: 'B2 Brand Ort',
      group: 'ffnd',
      blaulichtSmsAlarmId: 'a1',
      blaulichtSmsAlarmIds: ['a1'],
      user: 'owner1',
      deleted: false,
    });
    expect(typeof written.created).toBe('string');
  });

  it('creates a new firecall when no match exists', async () => {
    addMock.mockResolvedValue({ id: 'new2' });
    const result = await createFirecallFromAlarm(alarm, 'ffnd', 'owner1');
    expect(result).toMatchObject({ id: 'new2', created: true, name: 'B2 Brand Ort' });
  });

  it('ignores a matching firecall from a different group and creates a new one', async () => {
    scalarRef.docs = [
      { id: 'otherGroup1', data: () => ({ name: 'Fremd', group: 'other', deleted: false }) },
    ];
    addMock.mockResolvedValue({ id: 'new3' });
    const result = await createFirecallFromAlarm(alarm, 'ffnd', 'owner1');
    expect(result.created).toBe(true);
    expect(result.id).toBe('new3');
    expect(addMock).toHaveBeenCalledTimes(1);
  });
});
