import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const getMock = vi.fn();
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: getMock }) }),
  },
}));
vi.mock('./encryption', () => ({
  decryptPassword: vi.fn(async () => 'secret'),
}));

import {
  fetchBlaulichtSmsAlarms,
  fetchBlaulichtSmsAlarmById,
} from './fetchAlarms';
import { ApiException } from '../../app/api/errors';

const firestoreDoc = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  data: () => data,
});

describe('fetchBlaulichtSmsAlarms', () => {
  beforeEach(() => {
    getMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ApiException(404) when no credentials for the group', async () => {
    getMock.mockResolvedValue(firestoreDoc(null)); // no Firestore config
    await expect(fetchBlaulichtSmsAlarms('unknown')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws ApiException(502) when the dashboard login fails', async () => {
    getMock.mockResolvedValue(
      firestoreDoc({ username: 'u', passwordEncrypted: 'x', customerId: 'c' }),
    );
    (fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'no' });
    await expect(fetchBlaulichtSmsAlarms('ffnd')).rejects.toBeInstanceOf(ApiException);
    await expect(fetchBlaulichtSmsAlarms('ffnd')).rejects.toMatchObject({ status: 502 });
  });

  it('returns alarms on success', async () => {
    getMock.mockResolvedValue(
      firestoreDoc({ username: 'u', passwordEncrypted: 'x', customerId: 'c' }),
    );
    (fetch as any)
      .mockResolvedValue(undefined)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alarms: [{ alarmId: 'a1' }, { alarmId: 'a2' }] }) });
    const alarms = await fetchBlaulichtSmsAlarms('ffnd');
    expect(alarms.map((a) => a.alarmId)).toEqual(['a1', 'a2']);
  });

  it('fetchBlaulichtSmsAlarmById finds the matching alarm', async () => {
    getMock.mockResolvedValue(
      firestoreDoc({ username: 'u', passwordEncrypted: 'x', customerId: 'c' }),
    );
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alarms: [{ alarmId: 'a1' }, { alarmId: 'a2' }] }) });
    const alarm = await fetchBlaulichtSmsAlarmById('ffnd', 'a2');
    expect(alarm?.alarmId).toBe('a2');
  });
});
