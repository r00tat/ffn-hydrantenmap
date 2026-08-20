export interface DefectHintInput {
  /**
   * Die jüngste Fahrt meldet einen Defekt — `vehicle.lastEntryHasDefect`,
   * ersatzweise das `defekt`-Kennzeichen der letzten geladenen Fahrt.
   */
  hasDefect?: boolean;
  /** Offene Mängel dieses Fahrzeugs. */
  openMangelCount: number;
  /**
   * `vehicle.lastEntryMangelId`: der Mangeldatensatz zur jüngsten Fahrt,
   * `null` wenn es keinen gibt, `undefined` wenn der Cache das Feld nicht
   * kennt.
   */
  lastEntryMangelId?: string | null;
  /**
   * Rückfall aus den geladenen Mängeln: Gibt es zur jüngsten Fahrt einen
   * Mangeldatensatz? `undefined`, wenn die Frage aus dem geladenen Fenster
   * nicht zu beantworten ist.
   */
  lastEntryHasMangel?: boolean;
}

/**
 * Ob „Defekt gemeldet" an einem Fahrzeug zu zeigen ist.
 *
 * Der Hinweis ist der Rückfall für Fahrten aus der Zeit vor der
 * Mängelverwaltung: Dort steht der Defekt nur als Häkchen an der Fahrt und hat
 * keinen Vorgang, der ihn erledigen könnte. Sobald es zur Fahrt einen
 * Mangeldatensatz gibt, spricht dieser — offen über den Mängelzähler, behoben
 * gar nicht mehr.
 *
 * Ohne diese Unterscheidung machte das Beheben des letzten Mangels den Hinweis
 * nicht weg, sondern erst sichtbar: Der Zähler ging auf 0 und gab die Anzeige
 * frei, die er bis dahin verdeckt hatte (#706).
 *
 * Steht als eigenes Modul neben den Komponenten, weil Fahrzeugkarte und
 * Fahrzeugseite dieselbe Regel brauchen — wie `mangelStatus.ts`.
 */
export function showDefectHint({
  hasDefect,
  openMangelCount,
  lastEntryMangelId,
  lastEntryHasMangel,
}: DefectHintInput): boolean {
  if (!hasDefect || openMangelCount > 0) return false;
  // Der Cache am Fahrzeug gewinnt: Er stammt von einer Abfrage über alle
  // Mängel des Fahrzeugs, die Ableitung nur aus dem geladenen Fenster der
  // jüngsten Fahrten. `undefined` heißt dort „nie geschrieben" und darf nicht
  // als „kein Mangeldatensatz" durchgehen.
  const hasMangel =
    lastEntryMangelId !== undefined
      ? lastEntryMangelId !== null
      : (lastEntryHasMangel ?? false);
  return !hasMangel;
}
