import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthCodeError,
  consumeAuthCode,
  createAuthCode,
  type AuthCodeStore,
} from './authCodes';
import { deriveCodeChallenge } from './pkce';
import { hashToken } from './secrets';
import type { OAuthAuthCode } from './types';

const VERIFIER = 'x'.repeat(43);
const CHALLENGE = deriveCodeChallenge(VERIFIER);
const RESOURCE = 'https://karte.example/api/mcp';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

function memoryStore(): AuthCodeStore & { records: Map<string, OAuthAuthCode> } {
  const records = new Map<string, OAuthAuthCode>();
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
      if (record) record.consumedAt = consumedAt;
    },
    async markReused(hash, reusedAt) {
      const record = records.get(hash);
      if (record) record.reusedAt = reusedAt;
    },
  };
}

let store: ReturnType<typeof memoryStore>;
let now = 1_700_000_000_000;

async function issue(overrides: Partial<Parameters<typeof createAuthCode>[0]> = {}) {
  return createAuthCode({
    store,
    clientId: 'client-1',
    userId: 'uid-1',
    redirectUri: REDIRECT,
    scopes: ['einsatz:read'],
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    resource: RESOURCE,
    now: () => now,
    ...overrides,
  });
}

beforeEach(() => {
  store = memoryStore();
  now = 1_700_000_000_000;
});

describe('createAuthCode', () => {
  it('legt den Code nur gehasht ab', async () => {
    const code = await issue();
    expect(store.records.has(code)).toBe(false);
    expect(store.records.has(hashToken(code))).toBe(true);
  });

  it('lebt 60 Sekunden', async () => {
    const code = await issue();
    const record = store.records.get(hashToken(code))!;
    expect(
      new Date(record.expiresAt).getTime() -
        new Date(record.createdAt).getTime(),
    ).toBe(60_000);
  });
});

describe('consumeAuthCode', () => {
  it('löst einen gültigen Code ein', async () => {
    const code = await issue();
    const record = await consumeAuthCode({
      store,
      code,
      clientId: 'client-1',
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
      resource: RESOURCE,
      now: () => now,
    });
    expect(record.userId).toBe('uid-1');
    expect(store.records.get(hashToken(code))?.consumedAt).toBeDefined();
  });

  it('lässt sich nur einmal einlösen', async () => {
    const code = await issue();
    const args = {
      store,
      code,
      clientId: 'client-1',
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
      resource: RESOURCE,
      now: () => now,
    };
    await consumeAuthCode(args);
    await expect(consumeAuthCode(args)).rejects.toMatchObject({
      reuseDetected: true,
      userId: 'uid-1',
    });
    expect(store.records.get(hashToken(code))?.reusedAt).toBeDefined();
  });

  it('weist einen unbekannten Code ab', async () => {
    await expect(
      consumeAuthCode({
        store,
        code: 'gibtsnicht',
        clientId: 'client-1',
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        now: () => now,
      }),
    ).rejects.toThrow(AuthCodeError);
  });

  it('weist einen abgelaufenen Code ab', async () => {
    const code = await issue();
    now += 61_000;
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        now: () => now,
      }),
    ).rejects.toThrow(/expired/);
  });

  it('weist einen fremden Client ab', async () => {
    const code = await issue();
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'anderer',
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        now: () => now,
      }),
    ).rejects.toThrow(/another client/);
  });

  it('weist eine abweichende redirect_uri ab', async () => {
    const code = await issue();
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: 'https://claude.ai/anders',
        codeVerifier: VERIFIER,
        now: () => now,
      }),
    ).rejects.toThrow(/redirect_uri does not match/);
  });

  it('weist eine abweichende resource ab', async () => {
    const code = await issue();
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        resource: 'https://evil.example/api/mcp',
        now: () => now,
      }),
    ).rejects.toThrow(/resource does not match/);
  });

  it('weist einen falschen code_verifier ab', async () => {
    const code = await issue();
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: REDIRECT,
        codeVerifier: 'y'.repeat(43),
        now: () => now,
      }),
    ).rejects.toThrow(/code_verifier/);
  });

  it('weist einen fehlenden code_verifier ab', async () => {
    const code = await issue();
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: REDIRECT,
        now: () => now,
      }),
    ).rejects.toThrow(/code_verifier/);
  });

  it('weist einen Code mit Methode plain ab', async () => {
    const code = await issue({
      codeChallenge: VERIFIER,
      codeChallengeMethod: 'plain',
    });
    await expect(
      consumeAuthCode({
        store,
        code,
        clientId: 'client-1',
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        now: () => now,
      }),
    ).rejects.toThrow(/code_verifier/);
  });
});
