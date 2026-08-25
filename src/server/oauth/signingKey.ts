import 'server-only';

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import {
  calculateJwkThumbprint,
  exportJWK,
  importJWK,
  importPKCS8,
  type CryptoKey,
  type JWK,
} from 'jose';
import { getGcpProjectId } from '../firebase/project';

export const MCP_SIGNING_ALG = 'RS256';
export const MCP_SIGNING_SECRET_ID = 'MCP_OAUTH_SIGNING_KEY';

export interface McpSigningKey {
  privateKey: CryptoKey;
  /**
   * Der öffentliche Teil als CryptoKey. Zum Prüfen einer Signatur verlangt die
   * WebCrypto-API ausdrücklich den öffentlichen Schlüssel — mit dem privaten
   * scheitert `jwtVerify` mit „must be of type public".
   */
  publicKey: CryptoKey;
  publicJwk: JWK;
  kid: string;
}

// Modul-Cache: gilt für die Lebensdauer dieser Serverinstanz. Nach einer
// Rotation des Secrets wird neu deployt — genau wie beim
// BlaulichtSMS-Encryption-Key.
let cached: Promise<McpSigningKey> | undefined;

async function readSigningKeyPem(): Promise<string> {
  // Lokale Entwicklung ohne Secret Manager: der PEM steht direkt in der
  // Umgebung. `\n` wird entfaltet, damit der Schlüssel in eine .env-Zeile passt.
  const fromEnv = process.env.MCP_OAUTH_SIGNING_KEY;
  if (fromEnv) {
    return fromEnv.replace(/\\n/g, '\n');
  }

  const project = await getGcpProjectId();
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${project}/secrets/${MCP_SIGNING_SECRET_ID}/versions/latest`,
  });
  const pem = version.payload?.data?.toString() ?? '';
  if (!pem.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      `${MCP_SIGNING_SECRET_ID} must be an RSA private key in PKCS#8 PEM form. ` +
        'Run `tofu apply` to create the secret.',
    );
  }
  return pem;
}

/**
 * Der Signaturschlüssel des Authorization Servers.
 *
 * RS256 und nicht HS256: Der öffentliche Teil wird über den JWKS-Endpunkt
 * veröffentlicht, damit ein Access Token auch ohne Introspection prüfbar ist —
 * ein symmetrisches Geheimnis ließe sich nicht veröffentlichen.
 *
 * Der `kid` ist der RFC-7638-Thumbprint des öffentlichen Schlüssels. Damit
 * ändert er sich bei einer Rotation von selbst und ohne Pflege einer
 * Versionsnummer, und ein Token aus der alten Generation ist am `kid` als
 * solches erkennbar.
 */
export async function getMcpSigningKey(): Promise<McpSigningKey> {
  if (!cached) {
    cached = (async () => {
      const pem = await readSigningKeyPem();
      const privateKey = await importPKCS8(pem, MCP_SIGNING_ALG, {
        extractable: true,
      });
      const jwk = await exportJWK(privateKey);
      // Nur der öffentliche Teil wird veröffentlicht — `d`, `p`, `q`, `dp`,
      // `dq` und `qi` sind der private Schlüssel und dürfen den Prozess nicht
      // verlassen.
      const publicJwk: JWK = {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
      };
      const kid = await calculateJwkThumbprint(publicJwk, 'sha256');
      const publicKey = (await importJWK(
        { ...publicJwk, alg: MCP_SIGNING_ALG },
        MCP_SIGNING_ALG,
      )) as CryptoKey;
      return {
        privateKey,
        publicKey,
        publicJwk: { ...publicJwk, kid, alg: MCP_SIGNING_ALG, use: 'sig' },
        kid,
      };
    })().catch((err) => {
      // Ein fehlgeschlagener Abruf darf sich nicht als dauerhaft kaputter
      // Cache festsetzen — sonst bleibt der Server nach einer vorübergehenden
      // Störung des Secret Managers bis zum nächsten Deploy unbrauchbar.
      cached = undefined;
      throw err;
    });
  }
  return cached;
}

/** Nur für Tests: den Modul-Cache verwerfen. */
export function resetMcpSigningKeyCache(): void {
  cached = undefined;
}

/** Der JWKS-Inhalt, wie ihn `/.well-known/jwks.json` ausliefert. */
export async function getMcpJwks(): Promise<{ keys: JWK[] }> {
  const { publicJwk } = await getMcpSigningKey();
  return { keys: [publicJwk] };
}
