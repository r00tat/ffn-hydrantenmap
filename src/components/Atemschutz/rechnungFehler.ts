import type { useTranslations } from 'next-intl';

type AtemschutzTranslator = ReturnType<typeof useTranslations<'atemschutz'>>;

/**
 * Einen Fehler aus einer Server Action anzeigbar machen.
 *
 * `actionErrorKey` liefert für einen *unbekannten* Fehler dessen Meldung
 * zurück, nicht einen Schlüssel. Ohne diese Prüfung schiebt die Anzeige den
 * rohen Text in `t()`, next-intl wirft `MISSING_MESSAGE` — und die
 * eigentliche Ursache verschwindet hinter dem Absturz der Fehleranzeige.
 *
 * Der rohe Text wird dann bewusst gezeigt statt durch ein allgemeines
 * „Speichern fehlgeschlagen" ersetzt: Wer einen unerwarteten Fehler sieht,
 * braucht ihn zum Weitermelden.
 */
export function fehlerText(t: AtemschutzTranslator, fehler: string): string {
  const schluessel = `errors.${fehler}` as 'errors.saveFailed';
  return t.has(schluessel) ? t(schluessel) : fehler;
}
