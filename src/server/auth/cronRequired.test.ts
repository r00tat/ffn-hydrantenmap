import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { verifyIdTokenMock, getBaseUrlMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBaseUrlMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdTokenMock;
  },
}));

vi.mock('./baseUrl', () => ({ getBaseUrl: getBaseUrlMock }));

import cronRequired from './cronRequired';

function req(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? (authorization ?? null) : null,
    },
  } as any;
}

function ticket(payload: Record<string, unknown>) {
  return { getPayload: () => payload };
}

describe('cronRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBaseUrlMock.mockResolvedValue('https://karte.example.at');
    process.env.CRON_INVOKER_EMAILS = 'scheduler@proj.iam.gserviceaccount.com';
    delete process.env.CRON_OIDC_AUDIENCE;
    verifyIdTokenMock.mockResolvedValue(
      ticket({
        email: 'scheduler@proj.iam.gserviceaccount.com',
        email_verified: true,
      }),
    );
  });

  it('lässt ein gültiges Token eines erlaubten Kontos durch', async () => {
    const payload = await cronRequired(req('Bearer tok'));
    expect(payload.email).toBe('scheduler@proj.iam.gserviceaccount.com');
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'https://karte.example.at',
    });
  });

  it('nimmt die Audience aus CRON_OIDC_AUDIENCE, wenn gesetzt', async () => {
    process.env.CRON_OIDC_AUDIENCE = 'https://run-url.a.run.app';
    await cronRequired(req('Bearer tok'));
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'https://run-url.a.run.app',
    });
    expect(getBaseUrlMock).not.toHaveBeenCalled();
  });

  it('vergleicht die Adresse ohne Rücksicht auf Groß- und Kleinschreibung', async () => {
    process.env.CRON_INVOKER_EMAILS =
      ' Scheduler@Proj.iam.gserviceaccount.com , x@y.at ';
    await expect(cronRequired(req('Bearer tok'))).resolves.toBeTruthy();
  });

  it('lehnt eine fehlende Kopfzeile mit 401 ab', async () => {
    await expect(cronRequired(req())).rejects.toMatchObject({ status: 401 });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('lehnt eine Kopfzeile ohne Bearer mit 403 ab', async () => {
    await expect(cronRequired(req('tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lehnt ein ungültiges Token mit 403 ab', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient'));
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lehnt ein Token ohne Payload mit 403 ab', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => undefined });
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lehnt ein fremdes Konto mit 403 ab', async () => {
    verifyIdTokenMock.mockResolvedValue(
      ticket({ email: 'angreifer@example.at', email_verified: true }),
    );
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lehnt ein Token mit ausdrücklich unbestätigter Adresse mit 403 ab', async () => {
    verifyIdTokenMock.mockResolvedValue(
      ticket({
        email: 'scheduler@proj.iam.gserviceaccount.com',
        email_verified: false,
      }),
    );
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lässt ein Token ohne email_verified durch', async () => {
    // Das Claim ist im OIDC-Token optional. Wäre es Pflicht und Google liefert
    // es für Service Accounts nicht mit, lehnte der Guard in Produktion jeden
    // legitimen Lauf ab — und kein gemockter Test könnte das zeigen. Die
    // Sicherheit hängt an der Allowlist: Die Adresse im Token stammt von Google
    // und nicht vom Aufrufer.
    verifyIdTokenMock.mockResolvedValue(
      ticket({ email: 'scheduler@proj.iam.gserviceaccount.com' }),
    );
    await expect(cronRequired(req('Bearer tok'))).resolves.toBeTruthy();
  });

  it('lehnt ein Token ohne email mit 403 ab', async () => {
    // Ohne Adresse ist gegen die Allowlist nichts zu prüfen.
    verifyIdTokenMock.mockResolvedValue(ticket({ email_verified: true }));
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('lehnt ab, wenn keine Allowlist konfiguriert ist', async () => {
    // Fail closed: Ein offener Endpoint, der Mails an Verteilerlisten
    // verschickt, wäre ein Mail-Relay.
    delete process.env.CRON_INVOKER_EMAILS;
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('lehnt ab, wenn die Allowlist leer ist', async () => {
    process.env.CRON_INVOKER_EMAILS = '  ,  ';
    await expect(cronRequired(req('Bearer tok'))).rejects.toMatchObject({
      status: 403,
    });
  });
});
