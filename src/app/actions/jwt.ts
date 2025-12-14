'use server';

import 'server-only';
import { firestore } from '../../server/firebase/admin';
import { generateKeyPair, exportJWK, JWK, importJWK, SignJWT, jwtVerify, JWTPayload } from 'jose';

export interface JwtKeys {
  publicKey: JWK;
  privateKey: JWK;
  algorithm: string;
}

export interface PublicJwtKey {
  publicKey: JWK;
  algorithm: string;
}

/**
 * Fetches JWT keys from Firestore, creating them if they don't exist.
 * The private key is sensitive and should not be exposed to the client.
 * @returns {Promise<JwtKeys>} A promise that resolves to the JWT keys.
 */
export async function getOrCreateJwtKeys(): Promise<JwtKeys> {
  const docRef = firestore.collection('config').doc('jwt');
  const doc = await docRef.get();

  if (doc.exists) {
    // Type assertion to ensure the retrieved data matches the JwtKeys interface
    return doc.data() as JwtKeys;
  } else {
    const algorithm = 'Ed25519';
    // Generate an RSA key pair for signing JWTs
    const { publicKey, privateKey } = await generateKeyPair(algorithm, {
      extractable: true,
    });

    // Export the keys to JWK (JSON Web Key) format
    const privateJwk = await exportJWK(privateKey);
    const publicJwk = await exportJWK(publicKey);

    const keys: JwtKeys = {
      privateKey: privateJwk,
      publicKey: publicJwk,
      algorithm,
    };

    // Save the new keys to Firestore
    await docRef.set(keys);
    return keys;
  }
}

/**
 * Creates a new JWT.
 * @param payload The payload to include in the JWT.
 * @param subject The subject of the JWT.
 * @param expiresIn The expiration time for the JWT (e.g., "2 hours", "60s").
 * @returns {Promise<string>} A promise that resolves to the signed JWT.
 */
export async function createJwt(
  payload: Record<string, unknown>,
  subject: string,
  expiresIn: string
): Promise<string> {
  const { privateKey, algorithm } = await getOrCreateJwtKeys();

  const pk = await importJWK(privateKey, algorithm);

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setSubject(subject)
    .setExpirationTime(expiresIn)
    .sign(pk);

  return jwt;
}

/**
 * Verifies a JWT.
 * @param jwt The JWT to verify.
 * @returns {Promise<JWTPayload>} A promise that resolves to the JWT's payload if verification is successful.
 */
export async function verifyJwt(jwt: string): Promise<JWTPayload> {
  const { publicKey, algorithm } = await getOrCreateJwtKeys();
  const pk = await importJWK(publicKey, algorithm);
  const { payload } = await jwtVerify(jwt, pk);
  return payload;
}
