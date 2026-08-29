import { UserRecord } from 'firebase-admin/auth';

export interface FirebaseUserInfo {
  authorized?: boolean;
  feuerwehr?: string;
  description?: string;
  messaging?: string[];
  groups?: string[];
  isAdmin?: boolean;
  /**
   * Gruppen, in denen dieser Benutzer Gerätemeister ist: Er darf dort jeden
   * Fahrtenbucheintrag korrigieren und die Fahrzeuge und Personen pflegen.
   *
   * Steht am Benutzerdokument und nicht an der Gruppenkonfiguration, damit die
   * Rolle denselben Weg in die Session nimmt wie `isAdmin` und `groups` — und
   * damit ohne zusätzlichen Firestore-Read auch im Client bekannt ist. Nur das
   * Admin SDK schreibt hier; die Firestore-Regel für `/user/{uid}` erlaubt dem
   * Benutzer ausschließlich das Lesen.
   */
  fahrtenbuchGeraetemeister?: string[];
  /**
   * Gruppen, in denen dieser Benutzer Gruppen-Admin ist: Er darf dort alle
   * gruppenbezogenen Admin-Tätigkeiten übernehmen und schließt damit die
   * Gerätemeister-Rolle ein.
   *
   * Steht wie `fahrtenbuchGeraetemeister` am Benutzerdokument, damit die Rolle
   * denselben Weg in die Session nimmt wie `isAdmin` und `groups`. Nur das
   * Admin SDK schreibt hier; die Firestore-Regel für `/user/{uid}` erlaubt dem
   * Benutzer ausschließlich das Lesen.
   */
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
