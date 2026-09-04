# Internationalisierung (i18n)

Übersetzungen laufen über [`next-intl`](https://next-intl.dev). Unterstützt sind aktuell `de` (default/fallback) und `en`. Die Sprache wird pro Benutzer im Firestore-Profil gespeichert; die aktive Locale wird serverseitig in [src/i18n/getLocale.ts](../src/i18n/getLocale.ts) ermittelt und über den Provider in [src/components/providers/](../src/components/providers/) an Client-Komponenten weitergereicht.

**Message-Kataloge** liegen in `messages/<locale>.json` (z.B. `messages/de.json`, `messages/en.json`). Beide Dateien müssen denselben Schlüsselbaum haben — fehlende Schlüssel in `en.json` werden zur Laufzeit auf den deutschen Wert zurückfallen, fehlende Schlüssel in `de.json` führen zu Fehlern.

## Konventionen

- Namespaces folgen dem Feature/Komponenten-Kontext (`drawer`, `einsaetze`, `kostenersatz`, `docsNav`, …).
- Keine deutschen Wörter als Schlüssel — Schlüssel sind immer englisch und camelCase (`addEntry`, `noResults`, `deleteConfirm`).
- ICU-Platzhalter wie `{name}`, `{count}` werden via `t('key', { name, count })` befüllt. Pluralisierung über die `{count, plural, …}`-Syntax.
- Datums-/Zahl-/Listformatierung über `useFormatter()` statt manueller Strings.

## Verwendung in Komponenten

```tsx
// Client Component
'use client';
import { useTranslations } from 'next-intl';

export function MyButton() {
  const t = useTranslations('common');
  return <Button>{t('save')}</Button>;
}

// Server Component / Server Action
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('einsaetze');
  return <h1>{t('title')}</h1>;
}
```

## Statisch typisierte Schlüssel

Beim Iterieren über Schlüssel (z.B. Sidebar-Listen) muss das Array `as const` getypt werden, sonst beschwert sich TypeScript über die `NamespacedMessageKeys`-Constraint von `next-intl`.

## Markdown-Doku

Statische Texte unter `/docs/<slug>` liegen in `content/docs/{de,en}/<slug>.md` und werden von `loadDocsContent(slug, locale)` geladen. Fehlt eine englische Übersetzung, wird automatisch die deutsche Version verwendet.

## Neue UI-Strings

1. Beide Locale-Dateien gleichzeitig erweitern (Schlüssel in beiden, Wert übersetzt).
2. Komponente auf `useTranslations`/`getTranslations` umstellen — keine hartkodierten deutschen Strings im JSX.
3. Komponenten-Tests müssen mit `renderWithIntl` aus [src/test-utils/intlRender.tsx](../src/test-utils/intlRender.tsx) gerendert werden — das wrappt den Tree in einen `NextIntlClientProvider` mit der `messages/de.json` als Katalog.

Meldet `npm run typecheck` einen eben ergänzten Schlüssel als `not assignable to
parameter of type NamespacedMessageKeys`, ist es der inkrementelle Cache von TS 7:
`rm -f tsconfig.tsbuildinfo && npm run typecheck`. Siehe
[build-und-toolchain.md](build-und-toolchain.md).
