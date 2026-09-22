/**
 * Der Text, der im Play Store unter „Was ist neu" steht, wird aus den
 * Release-Informationen gebaut: bei einem GitHub-Release aus dem Abschnitt
 * „## Zusammenfassung" der Beschreibung (siehe docs/releases.md), bei einem
 * Testbuild ohne Release aus den Commit-Betreffs seit dem letzten Tag.
 *
 * Play nimmt je Sprache 500 Zeichen und stellt sie als reinen Text dar —
 * Markdown bliebe als Zeichensalat stehen und wird deshalb entfernt.
 */

/** Grenze der Play Developer API je Sprache (`releaseNotes[].text`). */
export const PLAY_RELEASE_NOTES_MAX_LENGTH = 500;

/** Überschrift des Abschnitts, der die Zusammenfassung trägt. */
const SUMMARY_HEADING = /^#{1,6}\s*zusammenfassung\s*:?\s*$/i;

/** Überschrift, ab der die maschinelle Änderungsliste beginnt. */
const CHANGELOG_HEADING = /^#{1,6}\s*(what'?s changed|changelog|änderungen)\b/i;

const HEADING = /^#{1,6}\s/;

/**
 * Commit-Typen, die für Tester nichts hergeben. `feat`, `fix`, `perf` und
 * alles ohne erkennbaren Typ bleiben stehen.
 */
const SKIPPED_COMMIT_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'docs',
  'refactor',
  'style',
  'test',
]);

const CONVENTIONAL_PREFIX = /^([a-z]+)(\([^)]*\))?(!)?:\s*/i;

function stripMarkdown(line: string): string {
  return (
    line
      // [Text](url) → Text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Bilder erst gar nicht: ![alt](url) → alt (durch die Zeile oben schon)
      .replace(/^\s*[*-]\s+/, '• ')
      .replace(/\*\*|__/g, '')
      .replace(/`/g, '')
      // „by @r00tat in #501" am Zeilenende
      .replace(/\s+by\s+@[\w-]+\s+in\s+#\d+\s*$/i, '')
      .replace(/\s+$/, '')
  );
}

/**
 * Absätze zusammenfügen: Innerhalb eines Absatzes sind Zeilenumbrüche nur
 * Satz für Satz gesetzt und dürfen zu einer Zeile werden; Stichpunkte
 * behalten ihre eigene Zeile.
 */
function joinParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    const isBullet = line.startsWith('• ');
    const previous = current[current.length - 1];
    if (current.length > 0 && !isBullet && !previous?.startsWith('• ')) {
      current[current.length - 1] = `${previous} ${line.trim()}`;
    } else {
      current.push(line.trim());
    }
  }
  flush();

  return paragraphs.join('\n\n');
}

/**
 * Den Abschnitt „Zusammenfassung" aus der Release-Beschreibung holen. Fehlt
 * er, gilt der Text vor der Änderungsliste als Zusammenfassung.
 */
export function summaryFromReleaseBody(body: string | undefined): string {
  const lines = (body ?? '').replace(/\r\n/g, '\n').split('\n');

  const start = lines.findIndex((line) => SUMMARY_HEADING.test(line));
  let section: string[];
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => HEADING.test(line));
    section = end >= 0 ? rest.slice(0, end) : rest;
  } else {
    const end = lines.findIndex((line) => CHANGELOG_HEADING.test(line));
    section = (end >= 0 ? lines.slice(0, end) : lines).filter(
      (line) => !HEADING.test(line) && !/^\*\*Full Changelog\*\*/i.test(line)
    );
  }

  return joinParagraphs(section.map(stripMarkdown)).trim();
}

/** Commit-Betreffs seit dem letzten Tag als Stichpunkte. */
export function notesFromCommitSubjects(subjects: string[]): string {
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const subject of subjects) {
    const trimmed = subject.trim();
    if (trimmed === '') continue;

    const match = CONVENTIONAL_PREFIX.exec(trimmed);
    if (match && SKIPPED_COMMIT_TYPES.has(match[1].toLowerCase())) continue;

    const text = stripMarkdown(
      (match ? trimmed.slice(match[0].length) : trimmed)
        // Merge-Referenz „ (#501)" am Ende
        .replace(/\s+\(#\d+\)\s*$/, '')
    ).trim();
    if (text === '' || seen.has(text)) continue;

    seen.add(text);
    bullets.push(`• ${text}`);
  }

  return bullets.join('\n');
}

/** Satzende: Punkt, Frage- oder Rufzeichen vor einem Leerraum. */
const SENTENCE_END = /[.!?][\"»)]?(?=\s|$)/g;

/**
 * Auf die von Play erlaubte Länge kürzen. Bevorzugt endet der Text an einem
 * Satzende, sonst an einer Zeilen-, sonst an einer Wortgrenze — nur so bleibt
 * kein halber Gedanke stehen. Die Kürzung greift erst ab der Hälfte des
 * Platzes; eine Trennstelle weiter vorne würde mehr wegwerfen als sie nützt.
 */
export function truncateForPlay(
  text: string,
  maxLength = PLAY_RELEASE_NOTES_MAX_LENGTH
): string {
  if (text.length <= maxLength) return text;

  // Zwei Zeichen bleiben für Trenner und Auslassungszeichen frei.
  const candidate = text.slice(0, maxLength - 2);
  const half = Math.floor(candidate.length / 2);

  const sentences = [...candidate.matchAll(SENTENCE_END)];
  const lastSentence = sentences[sentences.length - 1];
  if (lastSentence?.index !== undefined) {
    const end = lastSentence.index + lastSentence[0].length;
    if (end > half) return `${candidate.slice(0, end)} …`;
  }

  const lastNewline = candidate.lastIndexOf('\n');
  if (lastNewline > half) {
    return `${candidate.slice(0, lastNewline).trimEnd()}\n…`;
  }

  const lastSpace = candidate.lastIndexOf(' ');
  if (lastSpace > half) {
    return `${candidate.slice(0, lastSpace).trimEnd()}…`;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

export interface PlayReleaseNotesInput {
  /** Beschreibung des GitHub-Releases, falls der Build aus einem stammt. */
  releaseBody?: string;
  /** Commit-Betreffs seit dem letzten Release-Tag (nur für Testbuilds). */
  commitSubjects?: string[];
}

/**
 * Der fertige „Was ist neu"-Text. Leer, wenn die Quellen nichts hergeben —
 * dann bleibt das Feld beim Play-Upload weg, statt leer gesetzt zu werden.
 */
export function buildPlayReleaseNotes({
  releaseBody,
  commitSubjects,
}: PlayReleaseNotesInput): string {
  const summary = summaryFromReleaseBody(releaseBody);
  if (summary !== '') return truncateForPlay(summary);

  const notes = notesFromCommitSubjects(commitSubjects ?? []);
  return notes === '' ? '' : truncateForPlay(notes);
}
