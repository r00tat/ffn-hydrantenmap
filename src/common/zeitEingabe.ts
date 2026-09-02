/**
 * Umrechnung zwischen ISO-Zeitstempel und dem Wert eines
 * `<input type="datetime-local">`.
 *
 * Ein gemeinsames Modul, weil die Überwachung an mehreren Stellen eine Uhrzeit
 * nachträglich eintippen lässt — eine Druckabfrage kommt über Funk und wird
 * eine Minute später erfasst. (Im Bestand steht dieselbe Rechnung noch mehrfach
 * lokal, etwa in `TruppZeitDialog` und `FuellungDialog`; die hier
 * zusammenzuziehen ist eine eigene Aufräumarbeit und gehört nicht in diese
 * Änderung.)
 */

/**
 * `datetime-local` erwartet `YYYY-MM-DDTHH:mm` in *lokaler* Zeit — ein
 * ISO-String mit `Z` würde als UTC gelesen und läge in Österreich ein bis zwei
 * Stunden daneben.
 */
export function toLocalInput(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Zurück nach ISO. Eine unlesbare Eingabe ergibt `undefined` und **nicht** den
 * Jetzt-Zeitpunkt: Der Aufrufer soll entscheiden, ob ein leeres Feld „jetzt"
 * heißt oder ein Fehler ist.
 */
export function fromLocalInput(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
