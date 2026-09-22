import { describe, expect, it } from 'vitest';
import {
  PLAY_RELEASE_NOTES_MAX_LENGTH,
  buildPlayReleaseNotes,
  notesFromCommitSubjects,
  summaryFromReleaseBody,
  truncateForPlay,
} from './releaseNotes';

const releaseBody = `## Zusammenfassung

Der **Sprach-Assistent** führt jetzt ein laufendes Gespräch statt einzelner
Fragen. Details in der [Doku](https://example.org/doku).

## What's Changed

### 🏕 Features
* feat(ai)!: Sprach-Assistent als laufendes Gespräch by @r00tat in #501

### 🪲 Bugfixes
* fix(ai): Antwort nach einem Werkzeugaufruf ging verloren by @r00tat in #499

**Full Changelog**: https://github.com/r00tat/ffn-hydrantenmap/compare/v2.49.0...v2.50.0
`;

describe('summaryFromReleaseBody', () => {
  it('nimmt nur den Abschnitt Zusammenfassung', () => {
    const summary = summaryFromReleaseBody(releaseBody);
    expect(summary).toContain('Sprach-Assistent');
    expect(summary).not.toContain("What's Changed");
    expect(summary).not.toContain('@r00tat');
    expect(summary).not.toContain('Full Changelog');
  });

  it('entfernt Markdown-Auszeichnung', () => {
    const summary = summaryFromReleaseBody(releaseBody);
    expect(summary).not.toContain('**');
    expect(summary).not.toContain('](');
    expect(summary).toContain('Doku');
    expect(summary).not.toContain('https://example.org/doku');
  });

  it('fügt umgebrochene Zeilen eines Absatzes zusammen', () => {
    expect(summaryFromReleaseBody(releaseBody)).toContain(
      'laufendes Gespräch statt einzelner Fragen'
    );
  });

  it('behält Absatzgrenzen', () => {
    const body = '## Zusammenfassung\n\nErster Absatz.\n\nZweiter Absatz.\n';
    expect(summaryFromReleaseBody(body)).toBe(
      'Erster Absatz.\n\nZweiter Absatz.'
    );
  });

  it('erkennt die Überschrift unabhängig von Groß-/Kleinschreibung und Ebene', () => {
    const body =
      "# v2.50.0\n\n### zusammenfassung\nKurz und knapp.\n\n## What's Changed\n* egal\n";
    expect(summaryFromReleaseBody(body)).toBe('Kurz und knapp.');
  });

  it('nimmt ohne Zusammenfassung den Text vor der Änderungsliste', () => {
    const body =
      "Ein kurzer Einleitungstext.\n\n## What's Changed\n* feat: irgendwas by @r00tat in #1\n";
    expect(summaryFromReleaseBody(body)).toBe('Ein kurzer Einleitungstext.');
  });

  it('liefert leeren Text für leere Eingaben', () => {
    expect(summaryFromReleaseBody('')).toBe('');
    expect(summaryFromReleaseBody('   \n\n')).toBe('');
  });
});

describe('notesFromCommitSubjects', () => {
  it('macht Stichpunkte ohne Conventional-Commit-Präfix', () => {
    expect(
      notesFromCommitSubjects([
        'feat(ai)!: Sprach-Assistent als laufendes Gespräch',
        'fix: Wiedergabe blieb stumm',
      ])
    ).toBe('• Sprach-Assistent als laufendes Gespräch\n• Wiedergabe blieb stumm');
  });

  it('lässt Commits ohne Nutzen für Tester weg', () => {
    expect(
      notesFromCommitSubjects([
        'chore(deps): bump next',
        'ci: cache gradle',
        'docs: Kartenlayer beschreiben',
        'test: Fahrtenbuch-Dialog',
        'fix: Höhenlinie fehlte',
      ])
    ).toBe('• Höhenlinie fehlte');
  });

  it('entfernt Dubletten und leere Zeilen', () => {
    expect(
      notesFromCommitSubjects(['fix: gleiches', '', 'fix: gleiches', '  '])
    ).toBe('• gleiches');
  });

  it('liefert leeren Text, wenn nichts übrig bleibt', () => {
    expect(notesFromCommitSubjects(['chore: nichts'])).toBe('');
    expect(notesFromCommitSubjects([])).toBe('');
  });
});

describe('truncateForPlay', () => {
  it('lässt kurzen Text unverändert', () => {
    expect(truncateForPlay('Kurz.')).toBe('Kurz.');
  });

  it('kürzt am Satzende, wenn eines in Reichweite liegt', () => {
    const sentence = `${'Wort '.repeat(40)}Ende. `;
    const result = truncateForPlay(sentence.repeat(4));
    expect(result.length).toBeLessThanOrEqual(PLAY_RELEASE_NOTES_MAX_LENGTH);
    expect(result).toBe(`${sentence.repeat(2).trimEnd()} …`);
  });

  it('kürzt an der Zeilengrenze', () => {
    const line = `• ${'a'.repeat(200)}`;
    const text = [line, line, line].join('\n');
    const result = truncateForPlay(text);
    expect(result.length).toBeLessThanOrEqual(PLAY_RELEASE_NOTES_MAX_LENGTH);
    expect(result).toBe(`${line}\n${line}\n…`);
  });

  it('kürzt an der Wortgrenze, wenn es keine Zeilengrenze gibt', () => {
    const text = `${'wort '.repeat(200)}ende`;
    const result = truncateForPlay(text);
    expect(result.length).toBeLessThanOrEqual(PLAY_RELEASE_NOTES_MAX_LENGTH);
    expect(result.endsWith(' …')).toBe(false);
    expect(result.endsWith('…')).toBe(true);
  });

  it('hält die Grenze auch ohne jede Trennstelle ein', () => {
    const result = truncateForPlay('a'.repeat(900));
    expect(result.length).toBe(PLAY_RELEASE_NOTES_MAX_LENGTH);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('buildPlayReleaseNotes', () => {
  it('nimmt die Zusammenfassung des Releases', () => {
    expect(buildPlayReleaseNotes({ releaseBody })).toContain('Sprach-Assistent');
  });

  it('nimmt die Commits, wenn es kein Release gibt', () => {
    expect(
      buildPlayReleaseNotes({ commitSubjects: ['fix: Höhenlinie fehlte'] })
    ).toBe('• Höhenlinie fehlte');
  });

  it('fällt auf die Commits zurück, wenn die Release-Beschreibung nichts hergibt', () => {
    expect(
      buildPlayReleaseNotes({
        releaseBody: '   ',
        commitSubjects: ['feat: Neue Karte'],
      })
    ).toBe('• Neue Karte');
  });

  it('kürzt auf die von Play erlaubte Länge', () => {
    const long = `## Zusammenfassung\n\n${'Satz für Satz. '.repeat(100)}`;
    expect(
      buildPlayReleaseNotes({ releaseBody: long }).length
    ).toBeLessThanOrEqual(PLAY_RELEASE_NOTES_MAX_LENGTH);
  });

  it('liefert leeren Text, wenn es nichts zu sagen gibt', () => {
    expect(buildPlayReleaseNotes({})).toBe('');
  });
});
