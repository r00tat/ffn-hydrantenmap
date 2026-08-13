/**
 * Deutsche Beschriftungen für serverseitig erzeugte Nachrichten.
 *
 * Die Oberfläche übersetzt über `next-intl`, eine Mail kann das nicht: Sie
 * entsteht in einer Server Action oder in einem Cron-Lauf, in dem es keinen
 * Request und damit keine Locale des Lesers gibt. Empfänger ist die eigene
 * Feuerwehr — dieselbe Entscheidung wie bei der Bug-Report-Mail.
 *
 * Eigenes Modul und nicht in `buildMangelEmail.ts`, weil der Wochenbericht
 * dieselben Beschriftungen braucht. Zwei Fassungen von „Übung" wären ein
 * Fehler, der erst beim Empfänger auffällt.
 */

import type { FahrtZweck, FuelType } from '../../common/fahrtenbuch';

export const ZWECK_LABELS: Record<FahrtZweck, string> = {
  einsatz: 'Einsatz',
  uebung: 'Übung',
  versorgung: 'Versorgungsfahrt',
  sonstiges: 'Sonstiges',
};

export const FUEL_LABELS: Record<FuelType, string> = {
  diesel: 'Diesel',
  benzin: 'Benzin',
  adblue: 'AdBlue',
};

/** Einheit der Betriebsmittelmengen — wie `fahrtenbuch.fuelUnit` im Katalog. */
export const FUEL_UNIT = 'l';

/**
 * Nur die offenen Status. `resolved` kommt in einer Mail nicht vor: Der Bericht
 * listet, was noch Arbeit macht.
 *
 * Groß geschrieben wie `fahrtenbuch.maengel.statuses.*` im Katalog — der
 * Empfänger sieht denselben Mangel in der Mail und in der Oberfläche, und zwei
 * Schreibweisen desselben Status lesen sich wie zwei verschiedene Zustände.
 */
export const OPEN_MANGEL_STATUS_LABELS: Record<'open' | 'inProgress', string> = {
  open: 'Offen',
  inProgress: 'In Arbeit',
};
