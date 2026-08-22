'use client';

import { useFormatter } from 'next-intl';
import { useCallback } from 'react';

/**
 * Eine Zahl fürs Anzeigen, in der Sprache des Benutzers.
 *
 * `Math.round(x * 10) / 10` in den Text zu schreiben ergibt „12.5" — mit
 * englischem Dezimalpunkt in einer deutschen Oberfläche. Bei ganzen Zahlen
 * fällt das nie auf, bei einer Umlaufzeit von 12,5 Minuten sofort. Deshalb
 * dieselbe Regel wie im ganzen Projekt: formatiert wird über `useFormatter`,
 * nicht von Hand.
 */
export default function usePanelNumber(): (
  value: number,
  digits?: number
) => string {
  const format = useFormatter();
  return useCallback(
    (value: number, digits = 1) =>
      format.number(value, {
        maximumFractionDigits: digits,
      }),
    [format]
  );
}
