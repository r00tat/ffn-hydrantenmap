/**
 * Reine Namens- und Datumslogik für die Drive-Ordner eines Einsatzes — bewusst
 * ohne Drive-API, damit sie ohne Netzwerk testbar bleibt.
 */

/** Alle Datumsangaben der Feuerwehr sind Ortszeit, nicht UTC. */
export const DRIVE_TIME_ZONE = 'Europe/Vienna';

const MAX_NAME_LENGTH = 120;

/**
 * Entfernt, was in einem Drive-Ordnernamen stört: Schrägstriche (Drive erlaubt
 * sie, aber sie lesen sich wie eine Pfadtrennung), Steuerzeichen und mehrfache
 * Leerzeichen.
 */
export function sanitizeFolderName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[/\\]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, MAX_NAME_LENGTH)
      .trim()
  );
}

/**
 * Escaped einen Wert für die `q`-Syntax der Drive-API. Ohne das bricht ein
 * Einsatzname mit Apostroph die Abfrage — oder verändert sie stillschweigend.
 * Backslash zuerst, sonst würde der eben eingefügte Escape selbst escapt.
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * `sv-SE` liefert `YYYY-MM-DD` — das kürzeste verlässliche Mittel, ein Datum in
 * einer bestimmten Zeitzone ISO-formatiert zu bekommen.
 */
function isoDateInZone(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: DRIVE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export interface FirecallFolderNaming {
  /** Jahresordner, z.B. "2026" */
  year: string;
  /** Einsatzordner, z.B. "2026-08-16_Zimmerbrand Hauptstraße" */
  folderName: string;
}

export function firecallFolderNaming(
  firecall: { name?: string; date?: string; created?: string },
  now: Date = new Date(),
): FirecallFolderNaming {
  const date = parseDate(firecall.date) ?? parseDate(firecall.created) ?? now;
  const isoDate = isoDateInZone(date);
  const name = sanitizeFolderName(firecall.name ?? '');
  return {
    year: isoDate.substring(0, 4),
    folderName: name ? `${isoDate}_${name}` : isoDate,
  };
}
