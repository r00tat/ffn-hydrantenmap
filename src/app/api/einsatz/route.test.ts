import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMock, fetchAlarmsMock, fetchByIdMock, createMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fetchAlarmsMock: vi.fn(),
  fetchByIdMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('../../../server/auth/authorizeTokenForGroup', () => ({
  authorizeTokenForGroup: authMock,
}));
vi.mock('../../../server/blaulichtsms/fetchAlarms', () => ({
  fetchBlaulichtSmsAlarms: fetchAlarmsMock,
  fetchBlaulichtSmsAlarmById: fetchByIdMock,
}));
vi.mock('../../../server/blaulichtsms/createFirecallFromAlarm', () => ({
  createFirecallFromAlarm: createMock,
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return {
    json: async () => body,
    nextUrl: { origin: 'https://example.test' },
  } as any;
}

describe('POST /api/einsatz', () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({ owner: 'u1', isAdmin: false, groups: ['ffnd'] });
    fetchAlarmsMock.mockReset();
    fetchByIdMock.mockReset();
    createMock.mockReset();
  });

  it('returns 400 when group is missing', async () => {
    const res = await POST(makeReq({ alarmId: 'a1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither alarmId nor latest is given', async () => {
    const res = await POST(makeReq({ group: 'ffnd' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when both alarmId and latest are given', async () => {
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'a1', latest: true }));
    expect(res.status).toBe(400);
  });

  it('creates an Einsatz from a specific alarmId and returns the url', async () => {
    fetchByIdMock.mockResolvedValue({ alarmId: 'a1' });
    createMock.mockResolvedValue({
      id: 'fc1', name: 'B2', group: 'ffnd', blaulichtSmsAlarmId: 'a1', created: true,
    });
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'a1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: 'fc1', created: true });
    expect(json.url).toBe('https://example.test/einsatz/fc1');
    expect(authMock).toHaveBeenCalledWith(expect.anything(), 'ffnd');
  });

  it('returns 404 when the requested alarmId is not found', async () => {
    fetchByIdMock.mockResolvedValue(null);
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('uses the latest alarm (alarms[0]) when latest:true', async () => {
    fetchAlarmsMock.mockResolvedValue([{ alarmId: 'newest' }, { alarmId: 'older' }]);
    createMock.mockResolvedValue({
      id: 'fc2', name: 'B2', group: 'ffnd', blaulichtSmsAlarmId: 'newest', created: true,
    });
    const res = await POST(makeReq({ group: 'ffnd', latest: true }));
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith({ alarmId: 'newest' }, 'ffnd', 'u1');
  });

  it('returns 404 when latest is requested but the group has no alarms', async () => {
    fetchAlarmsMock.mockResolvedValue([]);
    const res = await POST(makeReq({ group: 'ffnd', latest: true }));
    expect(res.status).toBe(404);
  });

  it('maps ApiException status from the auth layer (403)', async () => {
    const { ApiException } = await import('../errors');
    authMock.mockRejectedValue(new ApiException('nope', { status: 403 }));
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'a1' }));
    expect(res.status).toBe(403);
  });
});
