import { UserRecord } from 'firebase-admin/auth';
import type { GroupRoles, Permission } from './permissions';

export interface FirebaseUserInfo {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
  /**
   * Gruppen vor `groupRoles`. Die Mitgliedschaft liest der Code aus
   * `groupRoles`; dieses Feld pflegt `writeUserRoles()` nicht mit.
   */
  groups?: string[];
  isAdmin?: boolean;
  /**
   * Rollen je Gruppe — die Quelle. Ein Schlüssel bedeutet Mitgliedschaft, auch
   * mit leerem Array. Steht am Benutzerdokument und nicht an der Gruppe, damit
   * der Sitzungsaufbau mit einem Lesezugriff auskommt. Geschrieben nur über
   * `writeUserRoles()` (src/server/auth/userRoles.ts).
   */
  groupRoles?: GroupRoles;
  /**
   * Aus `groupRoles` abgeleitete Rechte je Gruppe. Nur die Firestore-Regeln
   * lesen sie; Server und Client rechnen aus `groupRoles` und dem Katalog.
   */
  groupPerms?: Record<string, Permission[]>;
  /** Vereinigung von `groupPerms` für globale Sammlungen (Tarife, Vorlagen). */
  permsAny?: Permission[];
  /** `ROLES_CATALOG_VERSION` zum Zeitpunkt der Ableitung. */
  rolesCatalogVersion?: number;
  /** @deprecated nur Migration, ersetzt durch die Rolle `geraetemeister`. */
  fahrtenbuchGeraetemeister?: string[];
  /** @deprecated nur Migration, ersetzt durch die Rolle `bekleidungswart`. */
  bekleidungswart?: string[];
  /** @deprecated nur Migration, ersetzt durch die Rolle `gruppenadmin`. */
  groupAdmin?: string[];
  /** Einsatz-Gast: der einzige Einsatz, auf den dieser Benutzer Zugriff hat. */
  firecall?: string;
  /**
   * Darf der Einsatz-Gast den Einsatz bearbeiten? Nur relevant, wenn `firecall`
   * gesetzt ist. Fehlt das Feld, gilt Schreibzugriff (siehe `guestCanWrite`).
   */
  firecallWrite?: boolean;
  /**
   * Ablaufzeitpunkt des Gastzugangs in Millisekunden. Pflicht für neu erzeugte
   * Zugänge; **fehlt das Feld, gilt der Zugang als abgelaufen** (Gäste aus der
   * Zeit vor der Link-Verwaltung).
   */
  firecallExpiresAt?: number;
  /** Zeitpunkt, zu dem der Share-Link erzeugt wurde. */
  firecallCreatedAt?: number;
  /** UID des Benutzers, der den Share-Link erzeugt hat. */
  firecallCreatedBy?: string;
  /** Anzeigename des Erstellers, damit die Liste ohne zweiten Lookup auskommt. */
  firecallCreatedByName?: string;
}

export interface UserRecordExtended extends UserRecord, FirebaseUserInfo {
  // combine FirebaseUserInfo and UserRecord
}

export const userTextFields: { [key: string]: string } = {
  displayName: 'Name',
  description: 'Zusatzinfo',
};
