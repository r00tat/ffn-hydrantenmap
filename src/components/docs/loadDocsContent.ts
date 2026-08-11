const SUPPORTED_LOCALES = ['de', 'en'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Alle Markdown-Dokumente unter content/docs/<locale>/<slug>.md, gebuendelt
 * ueber import.meta.glob.
 *
 * Lazy (ohne `eager`), damit nicht alle 42 Dokumente in jeden Chunk wandern,
 * der loadDocsContent importiert — jeder Eintrag ist ein Thunk auf einen
 * eigenen dynamischen Import.
 *
 * `query: '?raw'` liefert den Dateiinhalt als String. Vite (und damit Vitest)
 * behandelt '?raw' eingebaut; Turbopack nicht, dort macht erst die
 * `turbopack.rules`-Regel fuer '*.md' in next.config.js die Dateien
 * importierbar.
 *
 * Das Verzeichnis kommt ueber `base` und nicht als Teil des Patterns: Ein
 * Pattern, das mit '../' beginnt, matcht in Turbopack 16.3 nichts — Object.keys
 * bleibt leer, auch mit '**' oder projektrelativ ab '/content/docs'. Das
 * './'-Praefix wiederum verlangt Vite ("It must start with '/' or './'").
 */
const docs = import.meta.glob('./*/*.md', {
  query: '?raw',
  import: 'default',
  base: '../../../content/docs',
}) as Record<string, () => Promise<string>>;

/**
 * Die Schluessel von import.meta.glob sind je Bundler unterschiedlich: Vite
 * keyt relativ zu `base` ('./de/karte.md'), Turbopack mit dem vollen Pfad
 * relativ zu dieser Datei ('../../../content/docs/de/karte.md'). Deshalb wird
 * auf '<locale>/<slug>' normalisiert, statt einen Praefix anzunehmen.
 */
const byLocaleAndSlug = new Map<string, () => Promise<string>>(
  Object.entries(docs).flatMap(([key, load]) => {
    const match = /([^/]+)\/([^/]+)\.md$/.exec(key);
    return match ? [[`${match[1]}/${match[2]}`, load] as const] : [];
  }),
);

function normalizeLocale(locale: string): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : 'de';
}

export async function loadDocsContent(
  slug: string,
  locale: string,
): Promise<string> {
  const lang = normalizeLocale(locale);
  // Fehlt die Uebersetzung, wird wie bisher die deutsche Fassung ausgeliefert.
  const load =
    byLocaleAndSlug.get(`${lang}/${slug}`) ??
    byLocaleAndSlug.get(`de/${slug}`);

  if (!load) {
    throw new Error(`No docs content found for slug '${slug}'`);
  }

  return load();
}

/** Die Slugs, fuer die Markdown gebuendelt wurde. */
export function availableDocsSlugs(): string[] {
  return [
    ...new Set(
      [...byLocaleAndSlug.keys()].map((key) => key.split('/')[1]),
    ),
  ].sort();
}
