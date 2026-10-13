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
 * - **Extern** fehlt → `false`. Externe kommen über die Teilnehmerliste von
 *   BlaulichtSMS in den Personalstand, gehören aber nicht der Feuerwehr an. Sie
 *   bleiben für die Besatzungszuordnung stehen, sind aber weder Fahrer noch
 *   Atemschutzträger und bekommen keine Bekleidung — gleich, was in den beiden
 *   Qualifikationen steht.
 *
 * Siehe docs/personal.md.
 */

export interface PersonQualifications {
  active?: boolean;
  kraftfahrer?: boolean;
  atemschutztraeger?: boolean;
  extern?: boolean;
}

export function isExtern(person: PersonQualifications): boolean {
  return person.extern === true;
}

export function isKraftfahrer(person: PersonQualifications): boolean {
  return !isExtern(person) && person.kraftfahrer !== false;
}

export function isAtemschutztraeger(person: PersonQualifications): boolean {
  return !isExtern(person) && person.atemschutztraeger === true;
}

/** Aktive Mitglieder — wer etwa Bekleidung ausgegeben bekommen kann. */
export function memberPersons<T extends PersonQualifications>(persons: T[]): T[] {
  return persons.filter((p) => p.active !== false && !isExtern(p));
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
  'extern',
] as const;

export type PersonFlagField = (typeof PERSON_FLAG_FIELDS)[number];
