import type { McpScope } from '../../common/mcp/scopes';
import { verifyCodeChallenge } from './pkce';
import { generateOpaqueToken, hashToken } from './secrets';
import type { OAuthAuthCode } from './types';

/**
 * Authorization Codes: einmalig, kurzlebig, gebunden.
 *
 * Gebunden heißt: an `client_id`, an die `redirect_uri`, an die
 * PKCE-Challenge und an den `resource`-Parameter. Jede dieser Bindungen
 * schließt einen eigenen Angriff aus — ohne die `resource`-Bindung ließe sich
 * ein Code, der für einen anderen Resource Server gedacht war, hier einlösen
 * (Confused Deputy).
 *
 * Die Lebensdauer liegt bei 60 Sekunden, wie es RFC 6749 Abschnitt 4.1.2
 * empfiehlt. Sie deckt genau eine Weiterleitung ab.
 */

export const AUTH_CODE_LIFETIME_MS = 60_000;

export interface AuthCodeStore {
  get(codeHash: string): Promise<OAuthAuthCode | undefined>;
  create(codeHash: string, data: OAuthAuthCode): Promise<void>;
  markConsumed(codeHash: string, consumedAt: string): Promise<void>;
  markReused(codeHash: string, reusedAt: string): Promise<void>;
}

export class AuthCodeError extends Error {
  readonly code = 'invalid_grant';
  /** Wurde ein bereits eingelöster Code erneut vorgelegt? */
  readonly reuseDetected: boolean;
  /** Der Benutzer, dessen Code missbraucht wurde — für den Kettenwiderruf. */
  readonly userId?: string;
  readonly clientId?: string;

  constructor(
    message: string,
    options: { reuseDetected?: boolean; userId?: string; clientId?: string } = {},
  ) {
    super(message);
    this.reuseDetected = options.reuseDetected ?? false;
    this.userId = options.userId;
    this.clientId = options.clientId;
  }
}

export interface CreateAuthCodeInput {
  store: AuthCodeStore;
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: McpScope[];
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  now?: () => number;
  lifetimeMs?: number;
}

export async function createAuthCode({
  store,
  clientId,
  userId,
  redirectUri,
  scopes,
  codeChallenge,
  codeChallengeMethod,
  resource,
  now = Date.now,
  lifetimeMs = AUTH_CODE_LIFETIME_MS,
}: CreateAuthCodeInput): Promise<string> {
  const code = generateOpaqueToken();
  const data: OAuthAuthCode = {
    clientId,
    userId,
    redirectUri,
    scopes,
    codeChallenge,
    codeChallengeMethod,
    resource,
    createdAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + lifetimeMs).toISOString(),
  };
  await store.create(hashToken(code), data);
  return code;
}

export interface ConsumeAuthCodeInput {
  store: AuthCodeStore;
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
  resource?: string;
  now?: () => number;
}

/**
 * Löst einen Code ein.
 *
 * Die Reihenfolge ist Absicht: Zuerst Existenz und Mehrfachverwendung, dann
 * Ablauf, dann die Bindungen. Ein erneut vorgelegter Code gilt auch dann als
 * Missbrauch, wenn er inzwischen abgelaufen wäre.
 */
export async function consumeAuthCode({
  store,
  code,
  clientId,
  redirectUri,
  codeVerifier,
  resource,
  now = Date.now,
}: ConsumeAuthCodeInput): Promise<OAuthAuthCode> {
  const codeHash = hashToken(code);
  const record = await store.get(codeHash);
  if (!record) {
    throw new AuthCodeError('authorization code is unknown');
  }

  if (record.consumedAt) {
    await store.markReused(codeHash, new Date(now()).toISOString());
    throw new AuthCodeError('authorization code has already been used', {
      reuseDetected: true,
      userId: record.userId,
      clientId: record.clientId,
    });
  }

  if (new Date(record.expiresAt).getTime() <= now()) {
    throw new AuthCodeError('authorization code has expired');
  }

  if (record.clientId !== clientId) {
    throw new AuthCodeError('authorization code was issued to another client');
  }

  // Exakter Vergleich — die Loopback-Portregel gilt beim `authorize`, hier
  // steht bereits die konkrete URI im Code.
  if (record.redirectUri !== redirectUri) {
    throw new AuthCodeError('redirect_uri does not match the authorization request');
  }

  if (resource !== undefined && record.resource !== resource) {
    throw new AuthCodeError('resource does not match the authorization request');
  }

  if (
    !verifyCodeChallenge(
      codeVerifier,
      record.codeChallenge,
      record.codeChallengeMethod,
    )
  ) {
    throw new AuthCodeError('code_verifier does not match code_challenge');
  }

  await store.markConsumed(codeHash, new Date(now()).toISOString());
  return record;
}
