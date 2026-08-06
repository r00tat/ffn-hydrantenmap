import type { GeoPositionObject } from '../../common/geo';

export interface Group {
  id?: string;
  name: string;
  description?: string;
  /**
   * Feuerwehrhaus der Gruppe — Startpunkt für die Berechnung der
   * Einsatzkilometer im Fahrtenbuch. `null` bedeutet: bewusst zurückgesetzt
   * (ein zuvor gepflegter Standort wurde explizit geleert) — zu
   * unterscheiden von `undefined`/fehlendem Feld, wenn nie einer gepflegt
   * wurde. Geschrieben wird ein expliziter `null`-Wert statt das Feld mit
   * `FieldValue.delete()` zu entfernen, weil das ein `merge: true`-Schreiben
   * übersteht und „nie gesetzt“ von „bewusst geleert“ unterscheidbar macht.
   */
  standort?: GeoPositionObject | null;
}

/**
 * Pseudo-Gruppe, die jedem Benutzer in die Claims geschrieben wird
 * (`updateUser.ts`) und die auch Einsatz-Gasttokens tragen. Sie ist kein
 * Mandant und darf nie als Fahrtenbuch-Gruppe gelten.
 */
export const ALL_USERS_GROUP_ID = 'allUsers';

/**
 * Group IDs that are capabilities or pseudo-groups rather than brigades
 * ("Mandanten"). Features that let a user pick "their" group — such as the
 * Fahrtenbuch group selector — must filter these out, the same way
 * `ALL_USERS_GROUP_ID` alone used to be filtered before `kostenersatz` was
 * recognised as belonging to the same category.
 */
export const NON_TENANT_GROUP_IDS: string[] = [ALL_USERS_GROUP_ID, 'kostenersatz'];

/**
 * Known groups with predefined IDs
 */
export const KNOWN_GROUPS: Group[] = [
  {
    id: 'ffnd',
    name: 'FF Neusiedl am See',
    description: 'Mitglieder der FF Neusiedl am See',
  },
  {
    id: 'allUsers',
    name: 'Alle Benutzer',
    description: 'Alle registrierten Benutzer',
  },
  {
    id: 'kostenersatz',
    name: 'Kostenersatz',
    description: 'Zugang zur Kostenersatz-Funktion',
  },
];
