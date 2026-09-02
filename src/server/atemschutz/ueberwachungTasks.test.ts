import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getAccessToken = vi.fn();
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    getAccessToken = getAccessToken;
  },
}));

vi.mock('../auth/baseUrl', () => ({
  getBaseUrl: vi.fn().mockResolvedValue('https://einsatz-dev.ffnd.at'),
}));

import type { AtemschutzTrupp } from '../../common/atemschutz';
import { planeUeberwachungTask, ueberwachungTaskId } from './ueberwachungTasks';

const ABMARSCH = '2026-09-02T10:00:00.000Z';

function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna', 'Bernd'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    createdAt: ABMARSCH,
    createdBy: 'u1',
    updatedAt: ABMARSCH,
    updatedBy: 'u1',
    ...over,
  };
}

const QUEUE = 'projects/ffn-utils/locations/europe-west1/queues/asue-dev';

describe('ueberwachungTaskId', () => {
  it('bildet den Namen aus Trupp, Warnung und Terminminute', () => {
    expect(ueberwachungTaskId('t1', 'drittel', '2026-09-02T10:08:36.000Z')).toBe(
      ueberwachungTaskId('t1', 'drittel', '2026-09-02T10:08:59.000Z'),
    );
    expect(
      ueberwachungTaskId('t1', 'drittel', '2026-09-02T10:08:00.000Z'),
    ).not.toBe(ueberwachungTaskId('t1', 'drittel', '2026-09-02T10:09:00.000Z'));
    expect(
      ueberwachungTaskId('t1', 'drittel', '2026-09-02T10:08:00.000Z'),
    ).not.toBe(
      ueberwachungTaskId('t1', 'rueckzug', '2026-09-02T10:08:00.000Z'),
    );
  });

  it('ersetzt Zeichen, die Cloud Tasks im Namen nicht zulässt', () => {
    expect(ueberwachungTaskId('a/b.c', 'drittel', ABMARSCH)).toMatch(
      /^asue-a_b_c-drittel-\d+$/,
    );
  });
});

describe('planeUeberwachungTask', () => {
  beforeEach(() => {
    process.env.ATEMSCHUTZ_TASKS_QUEUE = QUEUE;
    process.env.ATEMSCHUTZ_TASKS_INVOKER = 'invoker@ffn-utils.iam.gserviceaccount.com';
    getAccessToken.mockResolvedValue('test-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env.ATEMSCHUTZ_TASKS_QUEUE;
    delete process.env.ATEMSCHUTZ_TASKS_INVOKER;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('legt die Aufgabe auf den Termin der nächsten Warnung', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp(),
      jetzt: nachAbmarsch(0),
    });

    expect(ergebnis.status).toBe('planned');
    expect(ergebnis.warnung).toBe('drittel');

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`https://cloudtasks.googleapis.com/v2/${QUEUE}/tasks`);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.task.name).toBe(`${QUEUE}/tasks/${ergebnis.taskId}`);
    expect(body.task.scheduleTime).toBe(ergebnis.faelligAb);
    expect(body.task.httpRequest.url).toBe(
      'https://einsatz-dev.ffnd.at/api/atemschutz/ueberwachung-check',
    );
    // OIDC und nicht ein geteiltes Geheimnis: `cronRequired` prüft Token und
    // Audience.
    expect(body.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: 'invoker@ffn-utils.iam.gserviceaccount.com',
      audience: 'https://einsatz-dev.ffnd.at',
    });
    expect(
      JSON.parse(
        Buffer.from(body.task.httpRequest.body, 'base64').toString('utf8'),
      ),
    ).toMatchObject({ firecallId: 'f1', truppId: 't1', warnung: 'drittel' });
  });

  it('plant einen bereits fälligen Termin auf jetzt', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    const jetzt = nachAbmarsch(12);

    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp(),
      jetzt,
    });

    expect(ergebnis.faelligAb).toBe(jetzt.toISOString());
  });

  it('meldet eine schon bestehende Aufgabe als Dublette', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response);

    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp(),
      jetzt: nachAbmarsch(0),
    });

    expect(ergebnis.status).toBe('duplicate');
  });

  it('meldet einen Fehler, ohne zu werfen', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'PERMISSION_DENIED',
    } as Response);

    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp(),
      jetzt: nachAbmarsch(0),
    });

    expect(ergebnis.status).toBe('failed');
    expect(ergebnis.error).toBe('HTTP 403');
  });

  it('plant ohne Queue nichts und ruft nichts auf', async () => {
    delete process.env.ATEMSCHUTZ_TASKS_QUEUE;
    vi.stubGlobal('fetch', vi.fn());

    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp(),
      jetzt: nachAbmarsch(0),
    });

    expect(ergebnis.status).toBe('notConfigured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('plant für einen zurückgekehrten Trupp nichts', async () => {
    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp({ status: 'zurueck' }),
      jetzt: nachAbmarsch(30),
    });

    expect(ergebnis.status).toBe('nothingDue');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('plant nichts, was mehr als einen Tag entfernt liegt', async () => {
    // Ein vertipptes Datum im Abmarschfeld — keine Frist, sondern ein Fehler.
    const ergebnis = await planeUeberwachungTask({
      firecallId: 'f1',
      trupp: trupp({ abmarschZeit: '2026-09-05T10:00:00.000Z' }),
      jetzt: nachAbmarsch(0),
    });

    expect(ergebnis.status).toBe('nothingDue');
    expect(fetch).not.toHaveBeenCalled();
  });
});
