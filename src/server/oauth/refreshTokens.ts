import type { McpScope } from '../../common/mcp/scopes';
import { generateOpaqueToken, hashToken } from './secrets';
import type { OAuthRefreshToken } from './types';

/**
 * Refresh-Token-Rotation mit Reuse-Detection (RFC 9700 Abschnitt 4.14.2).
 *
 * Jedes Einlösen gibt ein neues Refresh Token aus und verbrennt das alte.
 * Taucht ein bereits verbranntes Token noch einmal auf, ist entweder der
 * Client kaputt oder das Token wurde entwendet — in beiden Fällen wird die
 * **gesamte Kette** widerrufen (`familyId`), nicht nur das vorgelegte Token.
 * Der Benutzer muss dann neu verbinden; das ist der gewollte Preis.
 *
 * Die Logik steht hier hinter einem Store-Interface, damit sie ohne Firestore
 * prüfbar ist — der Ablauf ist der sicherheitskritischste Teil des Servers.
 */

export interface RefreshTokenStore {
  get(tokenHash: string): Promise<OAuthRefreshToken | undefined>;
  create(tokenHash: string, data: OAuthRefreshToken): Promise<void>;
  markConsumed(tokenHash: string, consumedAt: string): Promise<void>;
  /** Widerruft alle noch gültigen Tokens einer Familie; liefert die Anzahl. */
  revokeFamily(
    familyId: string,
    revokedAt: string,
    reason: OAuthRefreshToken['revokedReason'],
  ): Promise<number>;
}

export class RefreshTokenError extends Error {
  readonly code: 'invalid_grant';
  /** Wurde ein bereits verbranntes Token vorgelegt? */
  readonly reuseDetected: boolean;

  constructor(message: string, reuseDetected = false) {
    super(message);
    this.code = 'invalid_grant';
    this.reuseDetected = reuseDetected;
  }
}

export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssueRefreshTokenInput {
  store: RefreshTokenStore;
  familyId: string;
  clientId: string;
  clientName?: string;
  userId: string;
  scopes: McpScope[];
  resource: string;
  now?: () => number;
  lifetimeMs?: number;
}

export async function issueRefreshToken({
  store,
  familyId,
  clientId,
  clientName,
  userId,
  scopes,
  resource,
  now = Date.now,
  lifetimeMs = REFRESH_TOKEN_LIFETIME_MS,
}: IssueRefreshTokenInput): Promise<{ token: string; record: OAuthRefreshToken }> {
  const token = generateOpaqueToken();
  const record: OAuthRefreshToken = {
    familyId,
    clientId,
    clientName,
    userId,
    scopes,
    resource,
    createdAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + lifetimeMs).toISOString(),
  };
  await store.create(hashToken(token), record);
  return { token, record };
}

export interface RotateRefreshTokenInput {
  store: RefreshTokenStore;
  presentedToken: string;
  clientId: string;
  /** Angefragte Scopes; ohne Angabe bleiben die des alten Tokens. */
  requestedScopes?: McpScope[];
  now?: () => number;
  lifetimeMs?: number;
}

export interface RotateRefreshTokenResult {
  token: string;
  record: OAuthRefreshToken;
  previous: OAuthRefreshToken;
}

export async function rotateRefreshToken({
  store,
  presentedToken,
  clientId,
  requestedScopes,
  now = Date.now,
  lifetimeMs = REFRESH_TOKEN_LIFETIME_MS,
}: RotateRefreshTokenInput): Promise<RotateRefreshTokenResult> {
  const presentedHash = hashToken(presentedToken);
  const existing = await store.get(presentedHash);
  if (!existing) {
    throw new RefreshTokenError('refresh token is unknown');
  }

  // Reuse-Detection vor jeder anderen Prüfung: Ein zweites Vorlegen ist auch
  // dann Missbrauch, wenn das Token inzwischen abgelaufen wäre.
  if (existing.consumedAt) {
    await store.revokeFamily(
      existing.familyId,
      new Date(now()).toISOString(),
      'reuse',
    );
    throw new RefreshTokenError(
      'refresh token has already been used; the token family was revoked',
      true,
    );
  }

  if (existing.revokedAt) {
    throw new RefreshTokenError('refresh token has been revoked');
  }

  if (new Date(existing.expiresAt).getTime() <= now()) {
    throw new RefreshTokenError('refresh token has expired');
  }

  // Ein Refresh Token gehört dem Client, dem es ausgestellt wurde. Ohne diese
  // Bindung könnte ein zweiter registrierter Client ein abgefangenes Token
  // einlösen.
  if (existing.clientId !== clientId) {
    throw new RefreshTokenError('refresh token was issued to another client');
  }

  // Scopes dürfen beim Refresh nur schrumpfen (RFC 6749 Abschnitt 6).
  let scopes = existing.scopes;
  if (requestedScopes && requestedScopes.length > 0) {
    const widened = requestedScopes.filter(
      (scope) => !existing.scopes.includes(scope),
    );
    if (widened.length > 0) {
      throw new RefreshTokenError(
        `refresh must not widen scope: ${widened.join(' ')}`,
      );
    }
    scopes = requestedScopes;
  }

  await store.markConsumed(presentedHash, new Date(now()).toISOString());

  const { token, record } = await issueRefreshToken({
    store,
    familyId: existing.familyId,
    clientId: existing.clientId,
    clientName: existing.clientName,
    userId: existing.userId,
    scopes,
    resource: existing.resource,
    now,
    lifetimeMs,
  });

  return { token, record, previous: existing };
}
