import { describe, expect, it } from 'vitest';
import { stripMarkdownForSpeech } from './speechText';

describe('stripMarkdownForSpeech', () => {
  it('drops bold and italic markers', () => {
    expect(stripMarkdownForSpeech('Der **nächste Hydrant** ist *nah*')).toBe(
      'Der nächste Hydrant ist nah'
    );
    expect(stripMarkdownForSpeech('__fett__ und _kursiv_')).toBe(
      'fett und kursiv'
    );
  });

  it('keeps asterisks that are not formatting', () => {
    expect(stripMarkdownForSpeech('3 * 4 = 12')).toBe('3 * 4 = 12');
  });

  it('turns list bullets into spoken pauses', () => {
    expect(
      stripMarkdownForSpeech('Gefunden:\n- ÜH 12\n- UH 3\n* Saugstelle')
    ).toBe('Gefunden: ÜH 12. UH 3. Saugstelle');
  });

  it('drops headings, code ticks and blockquotes', () => {
    expect(stripMarkdownForSpeech('## Lage\n`B-Leitung`\n> Hinweis')).toBe(
      'Lage. B-Leitung. Hinweis'
    );
  });

  it('reads the text of a link, not its target', () => {
    expect(stripMarkdownForSpeech('Siehe [Hydrant 12](https://example.com)')).toBe(
      'Siehe Hydrant 12'
    );
  });

  it('collapses whitespace and blank lines', () => {
    expect(stripMarkdownForSpeech('Erste Zeile\n\n\nZweite   Zeile')).toBe(
      'Erste Zeile. Zweite Zeile'
    );
  });

  it('does not end up with duplicated sentence separators', () => {
    expect(stripMarkdownForSpeech('Fertig.\n- Punkt')).toBe('Fertig. Punkt');
  });

  it('leaves plain text untouched', () => {
    const plain = 'Nächster Hydrant: 120 m nördlich, 100 mm.';
    expect(stripMarkdownForSpeech(plain)).toBe(plain);
  });

  it('handles empty input', () => {
    expect(stripMarkdownForSpeech('')).toBe('');
    expect(stripMarkdownForSpeech('   ')).toBe('');
  });
});
