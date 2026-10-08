import { beforeEach, describe, expect, it, vi } from 'vitest';

// Die Route lädt über `cronRequired` und die Orchestrierung Module, die
// `server-only` importieren — außerhalb des Next-Bundlers wirft das beim Laden.
vi.mock('server-only', () => ({}));

const { cronRequiredMock, sendAblaufReportsMock } = vi.hoisted(() => ({
  cronRequiredMock: vi.fn(),
  sendAblaufReportsMock: vi.fn(),
}));

vi.mock('../../../../server/auth/cronRequired', () => ({
  default: cronRequiredMock,
}));

vi.mock('../../../../components/Geraete/sendAblaufReports', () => ({
  sendAblaufReports: sendAblaufReportsMock,
}));

import { ApiException } from '../../errors';
import { POST } from './route';

function req(body?: unknown, hasBody = true) {
  return {
    json: async () => {
      if (!hasBody) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  } as any;
}

const sent = [{ groupId: 'ffnd', status: 'sent', count: 2 }];

describe('POST /api/geraete/ablauf-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronRequiredMock.mockResolvedValue({ email: 'scheduler@example.iam' });
    sendAblaufReportsMock.mockResolvedValue(sent);
  });

  it('verschickt die Sammelmails und antwortet mit dem Ergebnis', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual(sent);
    expect(sendAblaufReportsMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it('kommt ohne Body aus', async () => {
    const res = await POST(req(undefined, false));
    expect(res.status).toBe(200);
    expect(sendAblaufReportsMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it('nimmt nur ein echtes true als dryRun', async () => {
    await POST(req({ dryRun: true }));
    expect(sendAblaufReportsMock).toHaveBeenLastCalledWith({ dryRun: true });
    await POST(req({ dryRun: 'yes' }));
    expect(sendAblaufReportsMock).toHaveBeenLastCalledWith({ dryRun: false });
    await POST(req(null));
    expect(sendAblaufReportsMock).toHaveBeenLastCalledWith({ dryRun: false });
  });

  it('antwortet 200 ohne Mail, wenn nichts abläuft', async () => {
    sendAblaufReportsMock.mockResolvedValue([
      { groupId: 'ffnd', status: 'skipped', count: 0 },
    ]);
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].status).toBe('skipped');
  });

  it('antwortet 401 ohne Token', async () => {
    cronRequiredMock.mockRejectedValue(new ApiException('Unauthorized', { status: 401 }));
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(sendAblaufReportsMock).not.toHaveBeenCalled();
  });

  it('antwortet 403 bei fremdem Aufrufer', async () => {
    cronRequiredMock.mockRejectedValue(
      new ApiException('caller is not allowed', { status: 403 }),
    );
    expect((await POST(req({}))).status).toBe(403);
    expect(sendAblaufReportsMock).not.toHaveBeenCalled();
  });

  it('antwortet 200, wenn nur eine Gruppe scheitert', async () => {
    sendAblaufReportsMock.mockResolvedValue([
      sent[0],
      { groupId: 'b', status: 'failed', count: 1, error: 'gmail down' },
    ]);
    expect((await POST(req({}))).status).toBe(200);
  });

  it('antwortet 500, wenn nichts verschickt wurde und eine Gruppe scheiterte', async () => {
    sendAblaufReportsMock.mockResolvedValue([
      { groupId: 'ffnd', status: 'failed', count: 1, error: 'gmail down' },
    ]);
    expect((await POST(req({}))).status).toBe(500);
  });

  it('antwortet 500, wenn der Lauf selbst scheitert', async () => {
    sendAblaufReportsMock.mockRejectedValue(new Error('firestore down'));
    expect((await POST(req({}))).status).toBe(500);
  });
});
