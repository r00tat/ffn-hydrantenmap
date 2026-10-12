/**
 * Qualifikationen am Personalstand einer Gruppe (`groups/{groupId}/person`).
 *
 * Beide Felder sind optional und haben verschiedene Vorgaben — deshalb steht
 * die Auslegung hier und nirgends sonst:
 *
 * - **Kraftfahrer** fehlt → `true`. Bis zur Einführung des Feldes war jede
 *   aktive Person als Fahrer auswählbar; ein fehlendes Feld darf niemanden aus
 *   der Fahrerauswahl nehmen.
 * - **Atemschutzträger** fehlt → `false`. Atemschutz verlangt eine gültige
 *   Ausbildung und Untersuchung; vorgeschlagen wird nur, wer ausdrücklich
 *   eingetragen ist.
 *
 * Siehe docs/personal.md.
 */

export interface PersonQualifications {
  kraftfahrer?: boolean;
  atemschutztraeger?: boolean;
}

export function isKraftfahrer(person: PersonQualifications): boolean {
  return person.kraftfahrer !== false;
}

export function isAtemschutztraeger(person: PersonQualifications): boolean {
  return person.atemschutztraeger === true;
}

/** Die Personen, die als Fahrer zur Auswahl stehen. */
export function driverPersons<T extends PersonQualifications>(persons: T[]): T[] {
  return persons.filter(isKraftfahrer);
}

/** Die Personen, die für Atemschutz vorgeschlagen werden. */
export function atemschutzPersons<T extends PersonQualifications>(
  persons: T[],
): T[] {
  return persons.filter(isAtemschutztraeger);
}

/** Die Felder, die sich in der Personalliste direkt umschalten lassen. */
export const PERSON_FLAG_FIELDS = [
  'active',
  'kraftfahrer',
  'atemschutztraeger',
] as const;

export type PersonFlagField = (typeof PERSON_FLAG_FIELDS)[number];
