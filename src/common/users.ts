import { UserRecord } from 'firebase-admin/auth';

export interface FirebaseUserInfo {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
  groups?: string[];
  isAdmin?: boolean;
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
