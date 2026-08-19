/**
 * Markdown für die Sprachausgabe entfernen.
 *
 * Das Modell formatiert seine Antworten gern mit `**fett**` und Aufzählungen.
 * Vorgelesen wird daraus „Sternchen Sternchen nächster Hydrant Sternchen
 * Sternchen" — sowohl über Cloud TTS als auch über die Browser-Stimme, denn
 * beide bekommen reinen Text und kennen kein Markdown.
 *
 * Bewusst konservativ: Betonungszeichen werden nur dort entfernt, wo sie ein
 * Wort einrahmen. Ein „3 * 4" bleibt stehen, weil es dort eine Rechnung ist.
 */
export function stripMarkdownForSpeech(text: string): string {
  return (
    text
      // Links: der Text wird gesprochen, die URL nicht
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Bilder ganz weg
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Überschriften, Zitatzeichen und Aufzählungspunkte am Zeilenanfang
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Betonung nur, wenn die Zeichen ein Wort einrahmen
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
      .replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g, '$2')
      // Code-Auszeichnung
      .replace(/`+([^`]*)`+/g, '$1')
      // Zeilenumbrüche werden zu Sprechpausen
      .replace(/[ \t]+/g, ' ')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((sentence, line) => {
        if (!sentence) return line;
        // Steht schon ein Satzzeichen, kommt kein zweiter Punkt dazu.
        return /[.!?:,;]$/.test(sentence)
          ? `${sentence} ${line}`
          : `${sentence}. ${line}`;
      }, '')
      .trim()
  );
}
