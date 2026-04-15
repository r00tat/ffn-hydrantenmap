// Firebase config is read from the parent project's .env.local at build time.
// Vite injects NEXT_PUBLIC_* vars via envDir + envPrefix in vite.config.ts.
export const FIREBASE_CONFIG = JSON.parse(
  import.meta.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
);

// 'ffndev' for dev, empty string for prod
export const FIRESTORE_DB: string =
  import.meta.env.NEXT_PUBLIC_FIRESTORE_DB || '';

export const EINSATZKARTE_URL = 'https://einsatz.ffnd.at';
