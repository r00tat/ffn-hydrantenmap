import type { GeoPositionObject } from '../../common/geo';
import { ApiException } from '../api/errors';

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
  /**
   * Name der eigenen Feuerwehr, z.B. „Neusiedl am See" — bewusst getrennt von
   * `name`. Der Gruppenname ist ein Verwaltungsbegriff („FF Neusiedl am See",
   * „Neusiedl"), die `feuerwehr`-Felder der Atemschutz-Stammdaten tragen die
   * Schreibweise des FDISK-Exports. Ein Vergleich über `name` ginge still
   * schief und markierte jede eigene Füllung als zu verrechnen.
   */
  feuerwehrName?: string;
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
 * Prüft, ob die Gruppen-ID ein echter Mandant ist — die Sperre für jeden
 * gruppenbezogenen Guard.
 *
 * Abgelehnt wird jede ID aus `NON_TENANT_GROUP_IDS`:
 * - `allUsers` steht in den Claims jedes Benutzers und in denen von
 *   Einsatz-Gasttokens (die nur für einen einzigen Einsatz gelten). Ein
 *   „Admin von allUsers" wäre Admin für jeden, ein Fahrtenbuch darunter für
 *   jeden Empfänger eines Gastlinks lesbar.
 * - `kostenersatz` ist eine Berechtigungsgruppe („Zugang zur
 *   Kostenersatz-Funktion") und keine Feuerwehr.
 *
 * Steht in diesem reinen Datenmodul und nicht bei den Guards, damit sowohl
 * `actionGroupAdminRequired` (src/app/auth.ts) als auch
 * `assertFahrtenbuchGroup` (Fahrtenbuch) dieselbe Regel benutzen, ohne dass
 * eines der beiden das andere importieren muss. Dieselbe Sperre steht in
 * `fahrtenbuchMember()` in den Firestore-Regeln.
 */
export function assertTenantGroup(groupId: string) {
  if (!groupId) {
    throw new ApiException('groupId missing', { status: 400 });
  }
  if (NON_TENANT_GROUP_IDS.includes(groupId)) {
    throw new ApiException(`${groupId} is not a valid group`, { status: 400 });
  }
}

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
