/**
 * Zahlen aus Textfeldern und fürs Anzeigen — geteilt von den drei Sektionen des
 * Panels, damit dieselbe Eingabe überall dasselbe bedeutet.
 */

/** Eine Zahl aus einem Textfeld; unbrauchbare Eingabe behält den alten Wert. */
export const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;
