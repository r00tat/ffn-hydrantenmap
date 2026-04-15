/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_FIREBASE_APIKEY: string;
  readonly NEXT_PUBLIC_FIRESTORE_DB: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
