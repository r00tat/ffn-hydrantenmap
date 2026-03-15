import 'server-only';

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

let cachedKey: Buffer | null = null;

async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) {
    throw new Error(
      'No GCP project ID found. Set GOOGLE_CLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
    );
  }

  const secretName = `projects/${project}/secrets/BLAULICHTSMS_ENCRYPTION_KEY/versions/latest`;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: secretName });
  const keyHex = version.payload?.data?.toString() ?? '';

  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'BLAULICHTSMS_ENCRYPTION_KEY must be a 64-character hex string. ' +
        'Run `terraform apply` to create the secret.'
    );
  }

  cachedKey = Buffer.from(keyHex, 'hex');
  return cachedKey;
}

export async function encryptPassword(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${authTag.toString('hex')}`;
}

export async function decryptPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format — expected iv:ciphertext:authTag');
  }
  const [ivHex, ciphertextHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  if (iv.length !== 12) {
    throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
  }
  if (authTag.length !== 16) {
    throw new Error(`Invalid auth tag length: expected 16 bytes, got ${authTag.length}`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
