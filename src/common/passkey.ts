import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

export const PASSKEY_COLLECTION_ID = 'passkey';

export const MAX_PASSKEY_LABEL_LENGTH = 100;

/**
 * Ein registrierter Passkey, wie er in der Collection `passkey` liegt. Die
 * base64url-kodierte Credential-ID ist zugleich die Doc-ID: beim Login ist nur
 * sie bekannt, der Benutzer noch nicht.
 */
export interface Passkey {
  /** base64url-Credential-ID — gleichzeitig die Doc-ID. */
  id: string;
  uid: string;
  /** COSE Public Key, base64url-kodiert. */
  publicKey: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  /** Domain-Bindung, z.B. `einsatz.ffnd.at`. */
  rpId: string;
  /** Vollständige Origin, z.B. `https://einsatz.ffnd.at`. */
  origin: string;
  /** Authenticator-Modell, nur für die Diagnose. */
  aaguid: string;
  label: string;
  userAgent: string;
  /** Zuletzt verbrauchte Authentication-Challenge (Replay-Schutz). */
  lastChallenge?: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Client-taugliche Projektion — ohne Schlüsselmaterial und Challenge. */
export type PasskeyInfo = Omit<Passkey, 'publicKey' | 'lastChallenge' | 'uid'>;

export function toPasskeyInfo(passkey: Passkey): PasskeyInfo {
  // Bewusst destrukturiert statt gepickt: neue sensible Felder auf `Passkey`
  // müssen hier explizit ausgeschlossen werden, sonst schlägt der Typecheck an.
  const { publicKey, lastChallenge, uid, ...info } = passkey;
  return info;
}
