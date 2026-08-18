/**
 * Konfiguration je Gruppe. Eigene Collection statt eines Feldes am
 * Gruppen-Dokument: dessen Regel erlaubt jedem Mitglied das Lesen aller Felder.
 * Gleiche Bauweise wie `blaulichtsmsConfig` und `fahrtenbuchConfig` — Zugriff
 * ausschließlich über Admin Server Actions.
 */
export const DRIVE_CONFIG_COLLECTION_ID = 'driveConfig';

/** Höchstzahl Dateien je Upload-Anfrage — Riegel gegen eine manipulierte Anfrage. */
export const DRIVE_UPLOAD_MAX_FILES = 25;

/** Höchstgröße je Datei in Bytes (500 MB). */
export const DRIVE_UPLOAD_MAX_SIZE = 500 * 1024 * 1024;

/** Kantenlänge der Vorschaubilder in Pixeln. */
export const DRIVE_THUMBNAIL_SIZE = 400;

export interface DriveConfig {
  groupId: string;
  /** Ordner-ID des Basisordners im Shared Drive */
  baseFolderId: string;
  updatedAt: string;
  updatedBy: string;
}

/** Eine Datei im Einsatz-Ordner, wie sie der Client sieht. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Link in die Drive-Oberfläche; nur für Mitglieder des Shared Drives nutzbar. */
  webViewLink?: string;
  createdTime?: string;
}

/** Zustand des Drive-Abschnitts eines Einsatzes. */
export interface FirecallDriveState {
  /** Für die Gruppe ist ein Basisordner gepflegt. */
  configured: boolean;
  /** Ordnername, den der Einsatz hat oder beim ersten Upload bekommt. */
  folderName: string;
  /** Erst nach dem ersten Upload gesetzt. */
  folderId?: string;
  folderUrl?: string;
  files: DriveFile[];
}
