import { promises as fs } from 'fs';
import path from 'path';

const SUPPORTED_LOCALES = ['de', 'en'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(locale: string): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : 'de';
}

export async function loadDocsContent(slug: string, locale: string): Promise<string> {
  const lang = normalizeLocale(locale);
  const baseDir = path.join(process.cwd(), 'content', 'docs');
  const primary = path.join(baseDir, lang, `${slug}.md`);
  const fallback = path.join(baseDir, 'de', `${slug}.md`);
  try {
    return await fs.readFile(primary, 'utf-8');
  } catch {
    return fs.readFile(fallback, 'utf-8');
  }
}
