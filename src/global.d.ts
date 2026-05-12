import type deMessages from '../messages/de.json';

declare module 'next-intl' {
  // Type-safe message keys for `useTranslations` / `getTranslations`.
  // The shape of de.json is the source of truth — en.json must match it.
  interface AppConfig {
    Messages: typeof deMessages;
  }
}
