import type { McpScope } from '../../common/mcp/scopes';
import type { OAuthApplicationType } from './redirectUri';

/**
 * Firestore-Sammlungen des Authorization Servers.
 *
 * Alle vier sind **rein serverseitig**: Die Firestore-Regeln verbieten jeden
 * Client-Zugriff (`allow read, write: if false`), gelesen und geschrieben wird
 * ausschließlich über das Admin SDK. Der abschließende Admin-Catch-all in den
 * Regeln bleibt davon unberührt — dort liegen nur Hashes, keine Geheimnisse im
 * Klartext.
 */
export const OAUTH_CLIENTS_COLLECTION_ID = 'oauthClients';
export const OAUTH_AUTH_CODES_COLLECTION_ID = 'oauthAuthCodes';
export const OAUTH_REFRESH_TOKENS_COLLECTION_ID = 'oauthRefreshTokens';
export const OAUTH_CONSENTS_COLLECTION_ID = 'oauthConsents';

/** Wie ein Client an seine `client_id` gekommen ist. */
export type OAuthClientSource =
  /** Dynamic Client Registration, RFC 7591. */
  | 'dcr'
  /** Client ID Metadata Document — die `client_id` ist eine HTTPS-URL. */
  | 'cimd';

/**
 * Ein registrierter Client.
 *
 * Dokument-ID ist die `client_id`. Bei CIMD-Clients ist das die URL des
 * Metadaten-Dokuments; weil ein Doppelpunkt und ein Schrägstrich in einer
 * Firestore-Dokument-ID nicht zulässig sind, werden CIMD-Clients **nicht**
 * hier abgelegt — sie werden bei jedem Aufruf frisch geholt (siehe `cimd.ts`).
 * Diese Sammlung enthält damit ausschließlich DCR-Clients.
 */
export interface OAuthClient {
  client_id: string;
  /**
   * Hash des Client-Secrets (SHA-256, hex) — nie das Secret selbst. Public
   * Clients (`token_endpoint_auth_method: 'none'`) haben keins.
   */
  client_secret_hash?: string;
  client_id_issued_at: number;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  application_type: OAuthApplicationType;
  scope?: string;
  client_uri?: string;
  logo_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
  software_id?: string;
  software_version?: string;
  source: OAuthClientSource;
  /**
   * Der Issuer, unter dem dieser Client registriert wurde. Spec-Revision
   * 2026-07-28: Client-Credentials sind an den ausstellenden Issuer gebunden —
   * ein auf dev registrierter Client gilt nicht auf prod.
   */
  issuer: string;
  /** Für die Missbrauchsbegrenzung: woher kam die Registrierung? */
  registered_from?: string;
}

/**
 * Ein ausgestellter Authorization Code.
 *
 * Dokument-ID ist der **Hash** des Codes (SHA-256, hex). Lebensdauer ≤ 60 s,
 * einmalig einlösbar (`consumedAt`), gebunden an `client_id`, `redirect_uri`,
 * PKCE-Challenge und `resource`.
 */
export interface OAuthAuthCode {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: McpScope[];
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  /** ISO-Zeitstempel; die TTL-Policy räumt darüber auf. */
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
  /** Gesetzt, sobald ein bereits eingelöster Code erneut vorgelegt wurde. */
  reusedAt?: string;
}

/**
 * Ein Refresh Token — opaque, **gehasht** gespeichert, **rotierend**.
 *
 * Dokument-ID ist der Hash (SHA-256, hex). `familyId` verkettet alle Tokens
 * einer Sitzung: Wird ein bereits eingelöstes Token erneut vorgelegt, wird die
 * gesamte Familie widerrufen (Reuse-Detection nach RFC 9700).
 */
export interface OAuthRefreshToken {
  familyId: string;
  clientId: string;
  userId: string;
  scopes: McpScope[];
  resource: string;
  createdAt: string;
  expiresAt: string;
  /** Gesetzt beim Einlösen — ein zweites Mal ist Missbrauch. */
  consumedAt?: string;
  /** Gesetzt beim Widerruf (durch den Benutzer oder durch Reuse-Detection). */
  revokedAt?: string;
  revokedReason?: 'user' | 'reuse' | 'client';
  /** Anzeigename des Clients, damit „verbundene Anwendungen" ohne Join auskommt. */
  clientName?: string;
  /** Letzte Verwendung, für die Anzeige in „verbundene Anwendungen". */
  lastUsedAt?: string;
}

/**
 * Eine erteilte Einwilligung. Dokument-ID ist `<uid>:<client-key>` — der
 * Client-Key ist die `client_id`, bei CIMD über SHA-256 gekürzt, weil eine URL
 * keine gültige Dokument-ID ist.
 */
export interface OAuthConsent {
  userId: string;
  clientId: string;
  clientName?: string;
  scopes: McpScope[];
  grantedAt: string;
  updatedAt: string;
}
