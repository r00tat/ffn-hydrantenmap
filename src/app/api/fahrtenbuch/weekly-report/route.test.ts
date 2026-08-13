import { beforeEach, describe, expect, it, vi } from 'vitest';

// Die Route lädt über `cronRequired` und die Orchestrierung Module, die
// `server-only` importieren — außerhalb des Next-Bundlers wirft das beim Laden.
vi.mock('server-only', () => ({}));

const { cronRequiredMock, sendWeeklyReportsMock } = vi.hoisted(() => ({
  cronRequiredMock: vi.fn(),
  sendWeeklyReportsMock: vi.fn(),
}));

vi.mock('../../../../server/auth/cronRequired', () => ({
  default: cronRequiredMock,
}));

vi.mock('../../../../components/Fahrtenbuch/sendWeeklyReports', () => ({
  sendWeeklyReports: sendWeeklyReportsMock,
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

const sent = [
  {
    groupId: 'ffnd',
    status: 'sent',
    recipientCount: 1,
    entryCount: 3,
    warningCount: 0,
    openMangelCount: 0,
  },
];

describe('POST /api/fahrtenbuch/weekly-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronRequiredMock.mockResolvedValue({ email: 'scheduler@example.iam' });
    sendWeeklyReportsMock.mockResolvedValue(sent);
  });

  it('verschickt die Berichte und antwortet mit Zeitraum und Ergebnis', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toMatchObject({
      from: expect.any(String),
      week: expect.any(Number),
    });
    expect(body.results).toEqual(sent);
  });

  it('kommt ohne Body aus', async () => {
    // Cloud Scheduler ohne Payload darf nicht an einem JSON.parse scheitern.
    const res = await POST(req(undefined, false));
    expect(res.status).toBe(200);
    expect(sendWeeklyReportsMock).toHaveBeenCalledOnce();
  });

  it('nimmt eine ausdrücklich angegebene Woche', async () => {
    const res = await POST(req({ year: 2026, week: 32 }));
    expect(res.status).toBe(200);
    expect(sendWeeklyReportsMock.mock.calls[0][0].period).toMatchObject({
      from: '2026-08-03',
      to: '2026-08-09',
    });
  });

  it('reicht dryRun weiter', async () => {
    sendWeeklyReportsMock.mockResolvedValue([{ ...sent[0], status: 'dryRun' }]);
    await POST(req({ dryRun: true }));
    expect(sendWeeklyReportsMock.mock.calls[0][0].dryRun).toBe(true);
  });

  it('antwortet 400 bei unbrauchbarem Zeitraum', async () => {
    const res = await POST(req({ year: 2026, week: 99 }));
    expect(res.status).toBe(400);
    // Der Schlüssel und nicht die Prosa-Meldung: Der Schlüssel ist der Vertrag.
    expect((await res.json()).error).toBe('invalidWeek');
    expect(sendWeeklyReportsMock).not.toHaveBeenCalled();
  });

  it('antwortet 401 ohne Token', async () => {
    cronRequiredMock.mockRejectedValue(
      new ApiException('Unauthorized', { status: 401 }),
    );
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(sendWeeklyReportsMock).not.toHaveBeenCalled();
  });

  it('antwortet 403 bei fremdem Aufrufer', async () => {
    cronRequiredMock.mockRejectedValue(
      new ApiException('caller is not allowed', { status: 403 }),
    );
    expect((await POST(req({}))).status).toBe(403);
  });

  it('antwortet 200, wenn nur eine Gruppe scheitert', async () => {
    // Kein 5xx: Cloud Scheduler würde wiederholen und der erfolgreichen Gruppe
    // die Mail doppelt schicken.
    sendWeeklyReportsMock.mockResolvedValue([
      sent[0],
      { ...sent[0], groupId: 'b', status: 'failed', error: 'gmail down' },
    ]);
    expect((await POST(req({}))).status).toBe(200);
  });

  it('antwortet 200, wenn alle Gruppen übersprungen wurden', async () => {
    sendWeeklyReportsMock.mockResolvedValue([
      { ...sent[0], status: 'skipped', recipientCount: 0 },
    ]);
    expect((await POST(req({}))).status).toBe(200);
  });

  it('antwortet 500, wenn keine Gruppe verschickt wurde und mindestens eine scheiterte', async () => {
    sendWeeklyReportsMock.mockResolvedValue([
      { ...sent[0], status: 'failed', error: 'gmail down' },
    ]);
    const res = await POST(req({}));
    expect(res.status).toBe(500);
  });

  it('antwortet 500, wenn der Lauf selbst scheitert', async () => {
    sendWeeklyReportsMock.mockRejectedValue(new Error('firestore down'));
    expect((await POST(req({}))).status).toBe(500);
  });
});
