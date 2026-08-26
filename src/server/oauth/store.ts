import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../firebase/admin';
import type { AuthCodeStore } from './authCodes';
import type { RefreshTokenStore } from './refreshTokens';
import { clientDocumentKey } from './secrets';
import {
  OAUTH_AUTH_CODES_COLLECTION_ID,
  OAUTH_CLIENTS_COLLECTION_ID,
  OAUTH_CONSENTS_COLLECTION_ID,
  OAUTH_REFRESH_TOKENS_COLLECTION_ID,
  type OAuthAuthCode,
  type OAuthClient,
  type OAuthConsent,
  type OAuthRefreshToken,
} from './types';

/**
 * Firestore-Anbindung des Authorization Servers.
 *
 * Die Sammlungen sind rein serverseitig; die Regeln in `firebase/dev` und `firebase/prod`
 * verbieten jeden Client-Zugriff. Die Store-Interfaces aus `authCodes.ts` und
 * `refreshTokens.ts` sind hier nur implementiert — die Ablauflogik steht dort
 * und ist ohne Firestore getestet.
 */

/**
 * Ergänzt `ttlAt` als echten Timestamp.
 *
 * Die TTL-Policy in `firebase/*` räumt abgelaufene Codes und Tokens von selbst
 * weg — ohne sie wüchsen die Sammlungen unbegrenzt. `expiresAt` taugt dafür
 * nicht: Es ist eine ISO-Zeichenkette (weil die Ablauflogik ohne Firestore
 * testbar sein soll), und eine TTL-Policy verlangt ein Timestamp-Feld.
 */
function withTtl<T extends { expiresAt: string }>(data: T) {
  return { ...data, ttlAt: Timestamp.fromDate(new Date(data.expiresAt)) };
}

export function firestoreAuthCodeStore(): AuthCodeStore {
  const collection = firestore.collection(OAUTH_AUTH_CODES_COLLECTION_ID);
  return {
    async get(codeHash) {
      const doc = await collection.doc(codeHash).get();
      return doc.exists ? (doc.data() as OAuthAuthCode) : undefined;
    },
    async create(codeHash, data) {
      await collection.doc(codeHash).set(withTtl(data));
    },
    async markConsumed(codeHash, consumedAt) {
      await collection.doc(codeHash).update({ consumedAt });
    },
    async markReused(codeHash, reusedAt) {
      await collection.doc(codeHash).update({ reusedAt });
    },
  };
}

export function firestoreRefreshTokenStore(): RefreshTokenStore {
  const collection = firestore.collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID);
  return {
    async get(tokenHash) {
      const doc = await collection.doc(tokenHash).get();
      return doc.exists ? (doc.data() as OAuthRefreshToken) : undefined;
    },
    async create(tokenHash, data) {
      await collection.doc(tokenHash).set(withTtl(data));
    },
    async markConsumed(tokenHash, consumedAt) {
      await collection.doc(tokenHash).update({ consumedAt });
    },
    async revokeFamily(familyId, revokedAt, reason) {
      const snapshot = await collection
        .where('familyId', '==', familyId)
        .get();
      const batch = firestore.batch();
      let count = 0;
      snapshot.forEach((doc) => {
        if ((doc.data() as OAuthRefreshToken).revokedAt) {
          return;
        }
        batch.update(doc.ref, { revokedAt, revokedReason: reason });
        count += 1;
      });
      if (count > 0) {
        await batch.commit();
      }
      return count;
    },
  };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function saveClient(client: OAuthClient): Promise<void> {
  await firestore
    .collection(OAUTH_CLIENTS_COLLECTION_ID)
    .doc(client.client_id)
    .set(client);
}

export async function loadClient(
  clientId: string,
): Promise<OAuthClient | undefined> {
  // Eine CIMD-`client_id` ist eine URL und damit keine gültige Dokument-ID —
  // solche Clients liegen nie in dieser Sammlung.
  if (clientId.includes('/')) {
    return undefined;
  }
  const doc = await firestore
    .collection(OAUTH_CLIENTS_COLLECTION_ID)
    .doc(clientId)
    .get();
  return doc.exists ? (doc.data() as OAuthClient) : undefined;
}

export async function listClients(): Promise<OAuthClient[]> {
  const snapshot = await firestore
    .collection(OAUTH_CLIENTS_COLLECTION_ID)
    .orderBy('client_id_issued_at', 'desc')
    .limit(200)
    .get();
  return snapshot.docs.map((doc) => doc.data() as OAuthClient);
}

export async function deleteClient(clientId: string): Promise<void> {
  await firestore
    .collection(OAUTH_CLIENTS_COLLECTION_ID)
    .doc(clientId)
    .delete();
}

/**
 * Wie viele Clients wurden zuletzt von dieser Herkunft registriert?
 *
 * Die Begrenzung für `/api/oauth/register` — DCR ist per Definition offen und
 * wäre sonst eine Einladung, die Sammlung vollzuschreiben.
 */
export async function countRecentRegistrations(
  registeredFrom: string,
  sinceEpochSeconds: number,
): Promise<number> {
  const snapshot = await firestore
    .collection(OAUTH_CLIENTS_COLLECTION_ID)
    .where('registered_from', '==', registeredFrom)
    .where('client_id_issued_at', '>=', sinceEpochSeconds)
    .count()
    .get();
  return snapshot.data().count;
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

export function consentDocumentId(userId: string, clientId: string): string {
  return `${userId}_${clientDocumentKey(clientId)}`;
}

export async function loadConsent(
  userId: string,
  clientId: string,
): Promise<OAuthConsent | undefined> {
  const doc = await firestore
    .collection(OAUTH_CONSENTS_COLLECTION_ID)
    .doc(consentDocumentId(userId, clientId))
    .get();
  return doc.exists ? (doc.data() as OAuthConsent) : undefined;
}

export async function saveConsent(consent: OAuthConsent): Promise<void> {
  await firestore
    .collection(OAUTH_CONSENTS_COLLECTION_ID)
    .doc(consentDocumentId(consent.userId, consent.clientId))
    .set(consent);
}

export async function deleteConsent(
  userId: string,
  clientId: string,
): Promise<void> {
  await firestore
    .collection(OAUTH_CONSENTS_COLLECTION_ID)
    .doc(consentDocumentId(userId, clientId))
    .delete();
}

export async function listConsents(userId: string): Promise<OAuthConsent[]> {
  const snapshot = await firestore
    .collection(OAUTH_CONSENTS_COLLECTION_ID)
    .where('userId', '==', userId)
    .get();
  return snapshot.docs.map((doc) => doc.data() as OAuthConsent);
}

// ---------------------------------------------------------------------------
// Verbundene Anwendungen
// ---------------------------------------------------------------------------

export interface ConnectedApplication {
  clientId: string;
  clientName?: string;
  scopes: string[];
  grantedAt: string;
  lastUsedAt?: string;
  /** Anzahl noch gültiger Refresh Tokens — 0 heißt: nur noch der Consent steht. */
  activeTokens: number;
}

/**
 * Die Liste für „verbundene Anwendungen".
 *
 * Grundlage ist der Consent, nicht das Token: Ein Zugang bleibt auch dann
 * sichtbar, wenn gerade kein Refresh Token gültig ist — sonst verschwände der
 * Eintrag genau dann aus der Übersicht, wenn jemand ihn widerrufen will.
 */
export async function listConnectedApplications(
  userId: string,
): Promise<ConnectedApplication[]> {
  const [consents, tokens] = await Promise.all([
    listConsents(userId),
    firestore
      .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
      .where('userId', '==', userId)
      .get(),
  ]);

  const now = Date.now();
  const byClient = new Map<string, { active: number; lastUsedAt?: string }>();
  tokens.forEach((doc) => {
    const token = doc.data() as OAuthRefreshToken;
    const entry = byClient.get(token.clientId) ?? { active: 0 };
    const isActive =
      !token.revokedAt &&
      !token.consumedAt &&
      new Date(token.expiresAt).getTime() > now;
    if (isActive) {
      entry.active += 1;
    }
    const used = token.lastUsedAt ?? token.createdAt;
    if (!entry.lastUsedAt || used > entry.lastUsedAt) {
      entry.lastUsedAt = used;
    }
    byClient.set(token.clientId, entry);
  });

  return consents
    .map((consent) => ({
      clientId: consent.clientId,
      clientName: consent.clientName,
      scopes: consent.scopes,
      grantedAt: consent.grantedAt,
      lastUsedAt: byClient.get(consent.clientId)?.lastUsedAt,
      activeTokens: byClient.get(consent.clientId)?.active ?? 0,
    }))
    .sort((a, b) => (a.grantedAt < b.grantedAt ? 1 : -1));
}

/**
 * Widerruft den Zugang eines Clients für einen Benutzer vollständig: alle
 * Refresh Tokens und die Einwilligung.
 *
 * Bereits ausgestellte Access Tokens bleiben bis zu ihrem Ablauf gültig (max.
 * eine Stunde) — das ist der Preis für die zustandslose Prüfung am
 * MCP-Endpunkt und in `docs/mcp-server.md` festgehalten.
 */
export async function revokeApplicationAccess(
  userId: string,
  clientId: string,
): Promise<number> {
  const snapshot = await firestore
    .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
    .where('userId', '==', userId)
    .where('clientId', '==', clientId)
    .get();

  const revokedAt = new Date().toISOString();
  const batch = firestore.batch();
  let count = 0;
  snapshot.forEach((doc) => {
    if ((doc.data() as OAuthRefreshToken).revokedAt) {
      return;
    }
    batch.update(doc.ref, { revokedAt, revokedReason: 'user' });
    count += 1;
  });
  if (count > 0) {
    await batch.commit();
  }

  await deleteConsent(userId, clientId);
  return count;
}

/** Alle Refresh Tokens eines Benutzers widerrufen — für den Admin-Notfall. */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const snapshot = await firestore
    .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
    .where('userId', '==', userId)
    .get();
  const revokedAt = new Date().toISOString();
  const batch = firestore.batch();
  let count = 0;
  snapshot.forEach((doc) => {
    if ((doc.data() as OAuthRefreshToken).revokedAt) {
      return;
    }
    batch.update(doc.ref, { revokedAt, revokedReason: 'user' });
    count += 1;
  });
  if (count > 0) {
    await batch.commit();
  }
  return count;
}

/** Ein einzelnes Refresh Token widerrufen (RFC 7009). */
export async function revokeRefreshTokenByHash(
  tokenHash: string,
  clientId: string,
): Promise<boolean> {
  const ref = firestore
    .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
    .doc(tokenHash);
  const doc = await ref.get();
  if (!doc.exists) {
    return false;
  }
  const token = doc.data() as OAuthRefreshToken;
  // RFC 7009 Abschnitt 2.1: Ein Token, das einem anderen Client gehört, wird
  // nicht widerrufen — die Antwort bleibt trotzdem 200, damit der Aufrufer
  // daraus nichts über fremde Tokens lernt.
  if (token.clientId !== clientId) {
    return false;
  }
  if (!token.revokedAt) {
    await ref.update({
      revokedAt: new Date().toISOString(),
      revokedReason: 'client',
    });
  }
  return true;
}

/** Verwendung eines Refresh Tokens festhalten, für „verbundene Anwendungen". */
export async function touchRefreshToken(tokenHash: string): Promise<void> {
  await firestore
    .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
    .doc(tokenHash)
    .update({ lastUsedAt: new Date().toISOString() })
    .catch(() => {
      // Ein fehlgeschlagener Zeitstempel darf den Token-Endpunkt nicht kippen.
    });
}

/**
 * Alle aktiven Zugänge über alle Benutzer — die Admin-Übersicht.
 *
 * Gruppiert je Benutzer und Client; die einzelnen Refresh Tokens sind für
 * niemanden interessant, es geht um „wer hat welcher Anwendung Zugriff
 * gegeben".
 */
export interface AdminGrant {
  userId: string;
  clientId: string;
  clientName?: string;
  scopes: string[];
  activeTokens: number;
  lastUsedAt?: string;
  createdAt: string;
}

export async function listAllGrants(limit = 500): Promise<AdminGrant[]> {
  const snapshot = await firestore
    .collection(OAUTH_REFRESH_TOKENS_COLLECTION_ID)
    .limit(limit)
    .get();

  const now = Date.now();
  const grants = new Map<string, AdminGrant>();
  snapshot.forEach((doc) => {
    const token = doc.data() as OAuthRefreshToken;
    const key = `${token.userId}:${token.clientId}`;
    const entry = grants.get(key) ?? {
      userId: token.userId,
      clientId: token.clientId,
      clientName: token.clientName,
      scopes: token.scopes,
      activeTokens: 0,
      createdAt: token.createdAt,
    };
    const isActive =
      !token.revokedAt &&
      !token.consumedAt &&
      new Date(token.expiresAt).getTime() > now;
    if (isActive) {
      entry.activeTokens += 1;
    }
    const used = token.lastUsedAt ?? token.createdAt;
    if (!entry.lastUsedAt || used > entry.lastUsedAt) {
      entry.lastUsedAt = used;
    }
    if (token.createdAt < entry.createdAt) {
      entry.createdAt = token.createdAt;
    }
    grants.set(key, entry);
  });

  return [...grants.values()].sort((a, b) =>
    (b.lastUsedAt ?? '') .localeCompare(a.lastUsedAt ?? ''),
  );
}
