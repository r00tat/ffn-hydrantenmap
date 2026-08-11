import { describe, expect, it } from 'vitest';
import { availableDocsSlugs, loadDocsContent } from './loadDocsContent';

describe('loadDocsContent', () => {
  it('bundles the markdown for the known slugs', () => {
    const slugs = availableDocsSlugs();
    expect(slugs).toContain('karte');
    expect(slugs).toContain('quickstart');
    expect(slugs.length).toBeGreaterThan(10);
  });

  it('loads the german content', async () => {
    const markdown = await loadDocsContent('karte', 'de');
    expect(typeof markdown).toBe('string');
    expect(markdown.length).toBeGreaterThan(0);
  });

  it('loads the english content for locale en', async () => {
    const de = await loadDocsContent('karte', 'de');
    const en = await loadDocsContent('karte', 'en');
    expect(en.length).toBeGreaterThan(0);
    expect(en).not.toBe(de);
  });

  it('falls back to german for an unsupported locale', async () => {
    const de = await loadDocsContent('karte', 'de');
    await expect(loadDocsContent('karte', 'fr')).resolves.toBe(de);
  });

  it('throws for an unknown slug', async () => {
    await expect(loadDocsContent('gibt-es-nicht', 'de')).rejects.toThrow(
      /No docs content found/,
    );
  });
});
