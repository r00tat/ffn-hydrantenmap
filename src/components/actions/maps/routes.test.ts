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

import { computeRouteDistanceMeters } from './routes';

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

  it('setzt ein Zeitlimit für den Netzaufruf', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1 }] }),
    } as Response);

    await computeRouteDistanceMeters(from, to);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('liefert undefined, wenn der Aufruf durch das Zeitlimit abgebrochen wird', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValue(abortError);

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
    errorSpy.mockRestore();
  });

  it('liefert undefined ohne fetch-Aufruf, wenn kein Access-Token vorliegt', async () => {
    getAccessToken.mockResolvedValue(null);

    await expect(computeRouteDistanceMeters(from, to)).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('legt GoogleAuth nur einmal mit dem Routes-Scope an', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1 }] }),
    } as Response);

    await computeRouteDistanceMeters(from, to);
    await computeRouteDistanceMeters(from, to);

    expect(googleAuthConstructorCalls).toHaveLength(1);
    expect(googleAuthConstructorCalls[0].scopes).toEqual([
      'https://www.googleapis.com/auth/maps-platform.routespreferred',
    ]);
  });
});
