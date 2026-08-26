import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from './secrets';
import {
  issueRefreshToken,
  RefreshTokenError,
  rotateRefreshToken,
  type RefreshTokenStore,
} from './refreshTokens';
import type { OAuthRefreshToken } from './types';

function memoryStore(): RefreshTokenStore & {
  records: Map<string, OAuthRefreshToken>;
} {
  const records = new Map<string, OAuthRefreshToken>();
  return {
    records,
    async get(hash) {
      return records.get(hash);
    },
    async create(hash, data) {
      records.set(hash, { ...data });
    },
    async markConsumed(hash, consumedAt) {
      const record = records.get(hash);
      if (record) {
        record.consumedAt = consumedAt;
      }
    },
    async revokeFamily(familyId, revokedAt, reason) {
      let count = 0;
      for (const record of records.values()) {
        if (record.familyId === familyId && !record.revokedAt) {
          record.revokedAt = revokedAt;
          record.revokedReason = reason;
          count += 1;
        }
      }
      return count;
    },
  };
}

let store: ReturnType<typeof memoryStore>;
let now = 1_700_000_000_000;

const base = {
  familyId: 'family-1',
  clientId: 'client-1',
  userId: 'uid-1',
  scopes: ['einsatz:read' as const, 'einsatz:write' as const],
  resource: 'https://karte.example/api/mcp',
};

beforeEach(() => {
  store = memoryStore();
  now = 1_700_000_000_000;
});

describe('issueRefreshToken', () => {
  it('legt das Token nur gehasht ab', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    expect(store.records.has(token)).toBe(false);
    expect(store.records.has(hashToken(token))).toBe(true);
  });
});

describe('rotateRefreshToken', () => {
  it('gibt ein neues Token aus und verbrennt das alte', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    const result = await rotateRefreshToken({
      store,
      presentedToken: token,
      clientId: 'client-1',
      now: () => now,
    });

    expect(result.token).not.toBe(token);
    expect(store.records.get(hashToken(token))?.consumedAt).toBeDefined();
    expect(store.records.get(hashToken(result.token))?.consumedAt).toBeUndefined();
    expect(result.record.familyId).toBe('family-1');
  });

  it('widerruft bei erneuter Vorlage die gesamte Kette', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    const rotated = await rotateRefreshToken({
      store,
      presentedToken: token,
      clientId: 'client-1',
      now: () => now,
    });

    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toThrow(RefreshTokenError);

    // Auch das eben ausgegebene Nachfolge-Token ist danach wertlos.
    expect(store.records.get(hashToken(rotated.token))?.revokedAt).toBeDefined();
    expect(store.records.get(hashToken(rotated.token))?.revokedReason).toBe(
      'reuse',
    );
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: rotated.token,
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toThrow(/revoked/);
  });

  it('meldet die Reuse-Erkennung am Fehler', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    await rotateRefreshToken({
      store,
      presentedToken: token,
      clientId: 'client-1',
      now: () => now,
    });
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toMatchObject({ reuseDetected: true });
  });

  it('weist ein unbekanntes Token ab', async () => {
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: 'gibtsnicht',
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toThrow(/unknown/);
  });

  it('weist ein abgelaufenes Token ab', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
      lifetimeMs: 1000,
    });
    now += 2000;
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toThrow(/expired/);
  });

  it('weist ein Token eines anderen Clients ab', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'anderer-client',
        now: () => now,
      }),
    ).rejects.toThrow(/another client/);
  });

  it('lässt eine Verkleinerung des Scopes zu', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    const result = await rotateRefreshToken({
      store,
      presentedToken: token,
      clientId: 'client-1',
      requestedScopes: ['einsatz:read'],
      now: () => now,
    });
    expect(result.record.scopes).toEqual(['einsatz:read']);
  });

  it('weist eine Erweiterung des Scopes ab', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      scopes: ['einsatz:read'],
      now: () => now,
    });
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'client-1',
        requestedScopes: ['einsatz:read', 'einsatz:write'],
        now: () => now,
      }),
    ).rejects.toThrow(/must not widen scope/);
  });

  it('weist ein widerrufenes Token ab', async () => {
    const { token } = await issueRefreshToken({
      store,
      ...base,
      now: () => now,
    });
    await store.revokeFamily('family-1', new Date(now).toISOString(), 'user');
    await expect(
      rotateRefreshToken({
        store,
        presentedToken: token,
        clientId: 'client-1',
        now: () => now,
      }),
    ).rejects.toThrow(/revoked/);
  });
});
