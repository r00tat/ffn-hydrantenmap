import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Die Route ermittelt die Basis-URL über server/auth/baseUrl, das `server-only`
// importiert — außerhalb des Next-Bundlers wirft dieses Modul beim Laden.
vi.mock('server-only', () => ({}));

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
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({ owner: 'u1', isAdmin: false, groups: ['ffnd'] });
    fetchAlarmsMock.mockReset();
    fetchByIdMock.mockReset();
    createMock.mockReset();
    // Default: no NEXTAUTH_URL → route falls back to req.nextUrl.origin.
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalNextAuthUrl;
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

  it('builds the url from NEXTAUTH_URL (not req origin) and trims trailing slash', async () => {
    // Behind the Cloud Run proxy req.nextUrl.origin is the internal container
    // address; the public URL must come from NEXTAUTH_URL instead.
    process.env.NEXTAUTH_URL = 'https://einsatz.ffnd.at/';
    fetchByIdMock.mockResolvedValue({ alarmId: 'a1' });
    createMock.mockResolvedValue({
      id: 'fc1', name: 'B2', group: 'ffnd', blaulichtSmsAlarmId: 'a1', created: true,
    });
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'a1' }));
    const json = await res.json();
    expect(json.url).toBe('https://einsatz.ffnd.at/einsatz/fc1');
  });

  it('returns 404 when the requested alarmId is not found', async () => {
    fetchByIdMock.mockResolvedValue(null);
    const res = await POST(makeReq({ group: 'ffnd', alarmId: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('picks the most recent alarm by date when latest:true (sorts, not raw order)', async () => {
    fetchAlarmsMock.mockResolvedValue([
      { alarmId: 'older', alarmDate: '2026-07-20T10:00:00.000Z' },
      { alarmId: 'newest', alarmDate: '2026-07-22T10:00:00.000Z' },
    ]);
    createMock.mockResolvedValue({
      id: 'fc2', name: 'B2', group: 'ffnd', blaulichtSmsAlarmId: 'newest', created: true,
    });
    const res = await POST(makeReq({ group: 'ffnd', latest: true }));
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      { alarmId: 'newest', alarmDate: '2026-07-22T10:00:00.000Z' },
      'ffnd',
      'u1',
    );
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
