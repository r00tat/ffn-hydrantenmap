import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getAccessToken = vi.fn();
const googleAuthConstructorCalls: { scopes?: string[] }[] = [];
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor(options?: { scopes?: string[] }) {
      googleAuthConstructorCalls.push(options ?? {});
    }
    getAccessToken = getAccessToken;
  },
}));

vi.mock('../../../server/firebase/project', () => ({
  getGcpProjectId: vi.fn().mockResolvedValue('ffn-utils'),
}));

import { computeRouteDistanceMeters, computeRouteLegsMeters } from './routes';

const from = { lat: 47.9482913, lng: 16.848222 };
const to = { lat: 47.98, lng: 16.9 };

describe('computeRouteDistanceMeters', () => {
  beforeEach(() => {
    getAccessToken.mockResolvedValue('test-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // Spione zentral zurücksetzen: Ein `mockRestore()` am Ende eines Testrumpfs
    // wird bei einer fehlschlagenden Assertion nie erreicht und ließe den Spion
    // für die folgenden Tests stehen.
    vi.restoreAllMocks();
  });

  it('liefert die Distanz der ersten Route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 12345 }] }),
    } as Response);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBe(12345);
  });

  it('setzt Token, Projekt und FieldMask im Aufruf', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1 }] }),
    } as Response);

    await computeRouteDistanceMeters(from, to);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['X-Goog-User-Project']).toBe('ffn-utils');
    expect(headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.travelMode).toBe('DRIVE');
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.origin.location.latLng).toEqual({
      latitude: from.lat,
      longitude: from.lng,
    });
    expect(body.destination.location.latLng).toEqual({
      latitude: to.lat,
      longitude: to.lng,
    });
  });

  it('bricht den Netzaufruf nach acht Sekunden ab', async () => {
    // Über den Spion, nicht über `toBeInstanceOf(AbortSignal)`: Das bestünde
    // auch ein Signal, das nie feuert — die Frist bliebe ungeprüft.
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1 }] }),
    } as Response);

    await computeRouteDistanceMeters(from, to);

    expect(timeout).toHaveBeenCalledWith(8000);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).signal).toBe(timeout.mock.results[0].value);
  });

  it('liefert undefined, wenn der Aufruf durch das Zeitlimit abgebrochen wird', async () => {
    // `AbortSignal.timeout` verwirft mit einer `DOMException` namens
    // `TimeoutError` — nicht mit `AbortError`, wie beim Abbruch von Hand.
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation timed out', 'TimeoutError'),
    );

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('liefert undefined statt zu werfen, wenn der Dienst einen Fehler meldet', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'PERMISSION_DENIED',
    } as Response);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn der Netzaufruf scheitert', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn keine Route zurückkommt', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [] }),
    } as Response);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn die Route ohne Distanz zurückkommt', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{}] }),
    } as Response);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn die Antwort kein gültiges JSON ist', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
  });

  it('protokolliert das Koordinatenpaar, wenn keine Route zurückkommt', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [] }),
    } as Response);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await computeRouteDistanceMeters(from, to);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      { from, to }
    );
  });

  it('liefert undefined ohne fetch-Aufruf, wenn kein Access-Token vorliegt', async () => {
    getAccessToken.mockResolvedValue(null);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fordert das Token mit dem cloud-platform-Scope an', async () => {
    // Der Kern des zuvor gemeldeten 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`:
    // `maps-platform.routespreferred` gehört zur Vorgänger-API Routes
    // Preferred v1 und deckt `directions/v2:computeRoutes` nicht ab. Stünde er
    // hier wieder, wäre der Fehler zurück.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1 }] }),
    } as Response);

    await computeRouteDistanceMeters(from, to);
    await computeRouteDistanceMeters(from, to);

    // Nur einmal angelegt: `GoogleAuth` cacht das Token, sonst käme auf jeden
    // Routing-Aufruf ein zweiter Netzaufruf zur Token-Ausstellung.
    expect(googleAuthConstructorCalls).toHaveLength(1);
    expect(googleAuthConstructorCalls[0].scopes).toEqual([
      'https://www.googleapis.com/auth/cloud-platform',
    ]);
  });

  it('liefert undefined, wenn die Token-Ausstellung scheitert', async () => {
    getAccessToken.mockRejectedValue(new Error('no credentials'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('computeRouteLegsMeters', () => {
  /** Antwortet je Aufrufreihenfolge mit einer eigenen Distanz. */
  function respondWith(...distances: (number | undefined)[]) {
    let call = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      const distanceMeters = distances[call++];
      return {
        ok: true,
        json: async () => ({
          routes: distanceMeters === undefined ? [] : [{ distanceMeters }],
        }),
      } as Response;
    });
  }

  beforeEach(() => {
    getAccessToken.mockResolvedValue('test-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('misst Hinweg und Rückweg getrennt und gibt beide zurück', async () => {
    // Der Kern der Korrektur: Der Rückweg ist nicht der gespiegelte Hinweg.
    // Auf der Autobahn liegt die nächste Abfahrt hinter dem Einsatzort — hier
    // 21 km zurück gegenüber 12 km hin.
    respondWith(12000, 21000);

    await expect(computeRouteLegsMeters(from, to)).resolves.toEqual({
      outboundMeters: 12000,
      returnMeters: 21000,
    });
  });

  it('fragt die zweite Route mit vertauschten Endpunkten ab', async () => {
    respondWith(12000, 21000);

    await computeRouteLegsMeters(from, to);

    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies[0].origin.location.latLng.latitude).toBe(from.lat);
    expect(bodies[0].destination.location.latLng.latitude).toBe(to.lat);
    expect(bodies[1].origin.location.latLng.latitude).toBe(to.lat);
    expect(bodies[1].destination.location.latLng.latitude).toBe(from.lat);
  });

  it('liefert undefined, wenn nur eine der beiden Richtungen zu bekommen ist', async () => {
    // Kein Verdoppeln der einen Richtung als Rettung — das wäre genau die
    // Annahme, die hier abgelöst wird. Der Aufrufer schätzt dann und weist die
    // Schätzung aus.
    respondWith(12000, undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(computeRouteLegsMeters(from, to)).resolves.toBeUndefined();
  });
});
