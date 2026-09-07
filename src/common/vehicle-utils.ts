import { kategorieAusName, normalizeName } from './fahrtenbuch';

/** Funktion, die eine Person als Atemschutzträger ausweist. */
export const ATS_FUNKTION = 'Atemschutzträger';

/**
 * Art des Einsatzmittels auf der Karte.
 *
 * Die ersten drei Werte sind die Kategorien der Fahrtenbuch-Stammdaten
 * (`FahrtenbuchVehicleKategorie`), damit deren Ableitung aus dem Namen
 * weiterverwendet werden kann. `aufbau` kommt dazu: Ein Wechselladeaufbau
 * läuft im Fahrtenbuch mit den Anhängern, weil er kein eigenes Fahrtenbuch
 * führt — auf der Karte ist „Aufbau" die genauere Auskunft, und die Stärke
 * behandelt beide gleich.
 */
export type EinsatzmittelKategorie =
  | 'fahrzeug'
  | 'boot'
  | 'anhaenger'
  | 'aufbau';

/** Die Kategorien in der Reihenfolge, in der sie angezeigt werden. */
export const EINSATZMITTEL_KATEGORIEN: EinsatzmittelKategorie[] = [
  'fahrzeug',
  'boot',
  'anhaenger',
  'aufbau',
];

export const EINSATZMITTEL_KATEGORIE_LABELS: Record<
  EinsatzmittelKategorie,
  string
> = {
  fahrzeug: 'Fahrzeug',
  boot: 'Boot',
  anhaenger: 'Anhänger',
  aufbau: 'Aufbau',
};

/** Was zum Einordnen eines Einsatzmittels gebraucht wird — mehr nicht. */
export interface EinsatzmittelKategorieQuelle {
  name: string;
  kategorie?: EinsatzmittelKategorie;
}

/**
 * Die gepflegte Kategorie, sonst die aus dem Namen abgeleitete.
 *
 * Dieselbe Bauweise wie `vehicleKategorie()` im Fahrtenbuch: Die Ableitung
 * greift nur, solange nichts gepflegt ist — sonst würde ein Wort im Namen die
 * ausdrückliche Einordnung wieder umwerfen. Der Rückfall ist zugleich die
 * Antwort für alle Einsatzmittel, die vor dem Feld angelegt wurden.
 */
export function einsatzmittelKategorie(
  quelle: EinsatzmittelKategorieQuelle
): EinsatzmittelKategorie {
  if (quelle.kategorie && EINSATZMITTEL_KATEGORIEN.includes(quelle.kategorie)) {
    return quelle.kategorie;
  }
  // „WLA …" prüft `kategorieAusName()` schon, ordnet es aber den Anhängern zu.
  if (normalizeName(quelle.name).startsWith('wla')) return 'aufbau';
  return kategorieAusName(quelle.name);
}

/**
 * Ob ein Einsatzmittel dieser Kategorie eine eigene Mannschaft hat.
 *
 * Nur was selbst fährt, bringt eine Führungskraft mit — die `1` in der
 * Schreibweise „1:x": beim Fahrzeug der Fahrzeugkommandant, beim Boot der
 * Bootsführer. Ein Aufbau oder ein Anhänger wird gebracht, seine Mannschaft
 * ist die des Zugfahrzeugs und dort schon gezählt. Daraus folgt beides: keine
 * Führungskraft in der Stärke und keine Personenzuordnung im Personal-Board
 * (#795). Hintergrund: docs/einsatzmittel-staerke.md.
 */
export function hatEigeneBesatzung(kategorie: EinsatzmittelKategorie): boolean {
  return kategorie === 'fahrzeug' || kategorie === 'boot';
}

/**
 * Ob dem Einsatzmittel Personen zugeordnet werden können — die Frage am
 * Personal-Board, gestellt am Datensatz statt an der Kategorie.
 */
export function nimmtBesatzung(quelle: EinsatzmittelKategorieQuelle): boolean {
  return hatEigeneBesatzung(einsatzmittelKategorie(quelle));
}

/**
 * Die Zahl hinter dem Doppelpunkt aus dem Feld „Besatzung 1:?".
 *
 * Gespeichert wird nur diese Zahl, also die Mannschaft **ohne** Führung. Weil
 * die Schreibweise „1:8" aber überall in der Literatur und in den Meldungen
 * steht, wird sie hier ebenso gelesen wie die deutsche Form „1/8" bzw.
 * „1/8/9" — sonst landete über den Sprachassistenten oder den MCP-Server eine
 * `1` im Feld und aus 1:8 würde 1:1. Die Zahl vor dem Trenner wird bewusst
 * nicht ausgewertet: Am einzelnen Einsatzmittel steht dort immer die eine
 * Führungskraft.
 */
export function parseBesatzung(besatzung?: string): number {
  if (!besatzung) return 0;
  const parts = besatzung.split(/[:/]/);
  // Bei „1/8/9" ist die Gesamtsumme angeschrieben — die Mannschaft steht davor.
  const raw =
    (parts.length > 2 ? parts[parts.length - 2] : parts[parts.length - 1]) ?? '';
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Besatzung eines Einsatzmittels: ein erfasster Wert hat Vorrang, ansonsten
 * werden die zugeordneten Personen gezählt.
 *
 * Von den zugeordneten Personen wird die Führungskraft abgezogen, weil das
 * Ergebnis die Zahl hinter dem Doppelpunkt ist. Wo es keine gibt — Aufbau,
 * Anhänger —, zählt jede zugeordnete Person zur Besatzung.
 */
export function getEffectiveBesatzung(
  besatzung: string | undefined,
  crewCount: number,
  kategorie: EinsatzmittelKategorie = 'fahrzeug'
): number {
  const manual = parseBesatzung(besatzung);
  if (manual > 0) return manual;
  if (crewCount > 0) {
    return hatEigeneBesatzung(kategorie)
      ? Math.max(crewCount - 1, 0)
      : crewCount;
  }
  return 0;
}

/**
 * Gesamtstärke eines Einsatzmittels: die Besatzung plus die eigene
 * Führungskraft, falls es eine gibt.
 */
export function einsatzmittelStaerke(
  besatzung: number,
  kategorie: EinsatzmittelKategorie = 'fahrzeug'
): number {
  return besatzung + (hatEigeneBesatzung(kategorie) ? 1 : 0);
}

/**
 * Die Besatzung, wie sie angeschrieben wird: „1:8" für alles mit eigener
 * Führung, am Aufbau und am Anhänger die nackte Zahl. Ohne Besatzung bleibt
 * dort nichts stehen — ein „1:0" am Anhänger behauptete eine Führungskraft,
 * die es nicht gibt.
 */
export function formatBesatzung(
  besatzung: number,
  kategorie: EinsatzmittelKategorie = 'fahrzeug'
): string {
  if (hatEigeneBesatzung(kategorie)) return `1:${besatzung}`;
  return besatzung > 0 ? `${besatzung}` : '';
}

/**
 * ATS-Träger eines Fahrzeugs: ein manuell erfasster Wert hat Vorrang,
 * ansonsten werden die dem Fahrzeug zugeordneten Atemschutzträger gezählt.
 */
export function getEffectiveAts(
  ats: number | string | undefined,
  atsCrewCount: number
): number {
  const manual = Number(ats);
  if (Number.isFinite(manual) && manual > 0) return manual;
  return atsCrewCount > 0 ? atsCrewCount : 0;
}

export interface CrewCountsByVehicle {
  /** Anzahl aller zugeordneten Personen pro Fahrzeug-Id */
  crewCount: Map<string, number>;
  /** Anzahl der zugeordneten Atemschutzträger pro Fahrzeug-Id */
  atsCount: Map<string, number>;
}

/**
 * Zählt Besatzung und Atemschutzträger je Fahrzeug aus den Zuordnungen.
 * Personen ohne Fahrzeug werden ignoriert.
 */
export function countCrewByVehicle(
  assignments: { vehicleId?: string | null; funktion?: string }[]
): CrewCountsByVehicle {
  const crewCount = new Map<string, number>();
  const atsCount = new Map<string, number>();

  for (const assignment of assignments) {
    const vehicleId = assignment.vehicleId;
    if (!vehicleId) continue;
    crewCount.set(vehicleId, (crewCount.get(vehicleId) ?? 0) + 1);
    if (assignment.funktion === ATS_FUNKTION) {
      atsCount.set(vehicleId, (atsCount.get(vehicleId) ?? 0) + 1);
    }
  }

  return { crewCount, atsCount };
}
