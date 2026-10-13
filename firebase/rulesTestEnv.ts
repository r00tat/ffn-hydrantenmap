import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Gegen prod getestet; dass dev wörtlich gleich ist, prüft
// rulesIdentical.test.ts.
export const RULES_PATH = path.join(import.meta.dirname, 'prod', 'firestore.rules');

// `demo-` vor der Projekt-ID: Der Emulator verlangt dann keine Anmeldung und
// greift nie auf ein echtes Projekt zu. Muss zu `--project` in
// `npm run test:rules` passen.
export const PROJECT_ID = 'demo-hydranten-rules';

export async function createRulesTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
}

/** Claims eines freigeschalteten Benutzers mit den angegebenen Gruppen. */
export function memberToken(email: string, groups: string[]) {
  return {
    email,
    email_verified: true,
    authorized: true,
    groups: ['allUsers', ...groups],
  };
}

/** Claims eines Einsatz-Gasts aus einem Share-Link. */
export function guestToken(
  firecallId: string,
  options: { write: boolean; expiresAt?: number },
) {
  return {
    email: 'gast@example.com',
    authorized: true,
    groups: ['allUsers'],
    firecall: firecallId,
    firecallWrite: options.write,
    firecallExpires: options.expiresAt ?? Date.now() + 60 * 60 * 1000,
  };
}

export function adminToken() {
  return {
    email: 'admin@example.com',
    email_verified: true,
    authorized: true,
    isAdmin: true,
    groups: ['allUsers'],
  };
}
