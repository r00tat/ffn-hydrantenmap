// Firebase config is read from the parent project's .env.local at build time.
// Vite injects NEXT_PUBLIC_* vars via envDir + envPrefix in vite.config.ts.
export const FIREBASE_CONFIG = JSON.parse(
  import.meta.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
);

// Normalises the configured Firestore database id. The default database must
// be addressed via getFirestore(app) WITHOUT an id — passing the literal
// strings 'default' (the prod GitHub-environment sentinel) or '(default)'
// raises "Database 'default' not found". An empty result selects the default.
export function normalizeFirestoreDb(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '' || value === 'default' || value === '(default)') {
    return '';
  }
  return value;
}

// 'ffndev' for dev, empty string for prod
export const FIRESTORE_DB: string = normalizeFirestoreDb(
  import.meta.env.NEXT_PUBLIC_FIRESTORE_DB
);

export const EINSATZKARTE_URL = 'https://einsatz.ffnd.at';
