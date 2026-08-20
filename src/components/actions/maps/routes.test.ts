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

import {
  computeRouteDistanceMeters,
  computeRouteLegsGeometry,
  computeRouteLegsMeters,
} from './routes';

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

describe('computeRouteLegsGeometry', () => {
  const leg = (
    coordinates: [number, number][],
    distanceMeters?: number
  ) => ({
    ...(distanceMeters === undefined ? {} : { distanceMeters }),
    polyline: { geoJsonLinestring: { type: 'LineString', coordinates } },
  });

  beforeEach(() => {
    getAccessToken.mockResolvedValue('test-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  function respondWithLegs(...responses: any[][]) {
    let call = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      const legs = responses[call++];
      return {
        ok: true,
        json: async () => ({ routes: [{ legs }] }),
      } as Response;
    });
  }

  it('dreht die GeoJSON-Koordinaten auf lat/lng', async () => {
    // GeoJSON zählt [lng, lat] — ungedreht landete die Leitung im Indischen
    // Ozean statt in Neusiedl.
    respondWithLegs([
      leg(
        [
          [16.848, 47.948],
          [16.849, 47.949],
        ],
        140
      ),
    ]);

    await expect(
      computeRouteLegsGeometry([from, to], 'WALK')
    ).resolves.toEqual([
      {
        positions: [
          [47.948, 16.848],
          [47.949, 16.849],
        ],
        distanceMeters: 140,
      },
    ]);
  });

  it('fragt das Fußgänger-Profil ohne routingPreference ab', async () => {
    // Die Routes API nimmt routingPreference nur für DRIVE und TWO_WHEELER an
    // und lehnt den Aufruf sonst ab.
    respondWithLegs([
      leg([
        [16.848, 47.948],
        [16.849, 47.949],
      ]),
    ]);

    await computeRouteLegsGeometry([from, to], 'WALK');

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe(
      'routes.legs.distanceMeters,routes.legs.polyline'
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.travelMode).toBe('WALK');
    expect(body.routingPreference).toBeUndefined();
    expect(body.polylineEncoding).toBe('GEO_JSON_LINESTRING');
  });

  it('schickt beim Auto-Profil routingPreference mit', async () => {
    // Für DRIVE ist das Feld erlaubt; ohne es fiele das Routing in eine
    // teurere, verkehrsabhängige SKU.
    respondWithLegs([
      leg([
        [16.848, 47.948],
        [16.849, 47.949],
      ]),
    ]);

    await computeRouteLegsGeometry([from, to], 'DRIVE');

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.travelMode).toBe('DRIVE');
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
  });

  it('schickt die Punkte dazwischen als intermediates', async () => {
    const middle = { lat: 47.95, lng: 16.86 };
    respondWithLegs([
      leg([
        [16.848, 47.948],
        [16.86, 47.95],
      ]),
      leg([
        [16.86, 47.95],
        [16.9, 47.98],
      ]),
    ]);

    const legs = await computeRouteLegsGeometry([from, middle, to], 'WALK');

    expect(legs).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.intermediates).toEqual([
      { location: { latLng: { latitude: middle.lat, longitude: middle.lng } } },
    ]);
  });

  it('teilt mehr als 25 Punkte auf mehrere Anfragen mit überlappendem Punkt auf', async () => {
    // 26 Punkte: 25 im ersten Block (24 Abschnitte), der 25. Punkt beginnt den
    // zweiten Block — ohne die Überlappung fehlte der Abschnitt 25→26.
    const points = Array.from({ length: 26 }, (_, i) => ({
      lat: 47.9 + i / 1000,
      lng: 16.8 + i / 1000,
    }));
    const straightLeg = leg([
      [16.8, 47.9],
      [16.81, 47.91],
    ]);
    respondWithLegs(
      Array.from({ length: 24 }, () => straightLeg),
      [straightLeg]
    );

    const legs = await computeRouteLegsGeometry(points, 'WALK');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(legs).toHaveLength(25);
    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) =>
        JSON.parse((init as RequestInit).body as string)
      );
    expect(bodies[0].intermediates).toHaveLength(23);
    expect(bodies[1].origin.location.latLng.latitude).toBe(points[24].lat);
    expect(bodies[1].destination.location.latLng.latitude).toBe(points[25].lat);
  });

  it('liefert undefined, wenn die Antwort weniger Abschnitte als Punkte hat', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWithLegs([
      leg([
        [16.848, 47.948],
        [16.849, 47.949],
      ]),
    ]);

    await expect(
      computeRouteLegsGeometry([from, { lat: 47.95, lng: 16.86 }, to], 'WALK')
    ).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn ein Abschnitt ohne Geometrie kommt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWithLegs([{ distanceMeters: 100 }]);

    await expect(computeRouteLegsGeometry([from, to], 'WALK')).resolves.toBeUndefined();
  });

  it('liefert undefined, wenn ein Block der Aufteilung ausfällt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const points = Array.from({ length: 26 }, (_, i) => ({
      lat: 47.9 + i / 1000,
      lng: 16.8 + i / 1000,
    }));
    const straightLeg = leg([
      [16.8, 47.9],
      [16.81, 47.91],
    ]);
    let call = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        return { ok: false, status: 500, text: async () => 'boom' } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          routes: [{ legs: Array.from({ length: 24 }, () => straightLeg) }],
        }),
      } as Response;
    });

    await expect(computeRouteLegsGeometry(points, 'WALK')).resolves.toBeUndefined();
  });

  it('gibt für einen einzelnen Punkt keine Anfrage ab', async () => {
    await expect(computeRouteLegsGeometry([from], 'WALK')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
