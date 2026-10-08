/**
 * Bekleidungsverwaltung: Datenmodell und kleine, reine Hilfsfunktionen.
 *
 * Alle Sammlungen liegen unter `groups/{groupId}/`. Feldnamen sind deutsch,
 * weil sie persistiert werden.
 */

export const BEKLEIDUNG_ARTIKEL_COLLECTION = 'bekleidungArtikel';
export const BEKLEIDUNG_STUECK_COLLECTION = 'bekleidungStueck';
export const BEKLEIDUNG_BESTAND_COLLECTION = 'bekleidungBestand';
export const BEKLEIDUNG_AUSGABE_COLLECTION = 'bekleidungAusgabe';
export const BEKLEIDUNG_WAESCHE_COLLECTION = 'bekleidungWaesche';
/**
 * Verwaltungsdaten der Bekleidung, rein serverseitig. Das Dokument `import`
 * ist die Sperre des einmaligen Excel-Imports (`running` → `done`).
 */
export const BEKLEIDUNG_META_COLLECTION = 'bekleidungMeta';
export const BEKLEIDUNG_IMPORT_LOCK_ID = 'import';

/** Größe eines Stücks oder einer Ausgabe, wenn das Excel keine nennt. */
export const GROESSE_UNBEKANNT = '\u2013';

export type BekleidungKategorie = 'einsatz' | 'dienst';
/** `einzeln`: jedes Stück ist ein Dokument; `menge`: nur Anzahl je Größe. */
export type BekleidungFuehrung = 'einzeln' | 'menge';
export type BekleidungStatus =
  | 'lager'
  | 'ausgegeben'
  | 'ausgeschieden'
  | 'nicht_auffindbar';
export type BekleidungEigentum = 'feuerwehr' | 'privat';
export type WaschProgramm = 'standard' | 'impraegnierung' | 'sonstiges';

export interface Stamps {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BekleidungArtikel extends Stamps {
  id?: string;
  kategorie: BekleidungKategorie;
  bezeichnung: string;
  hersteller?: string;
  fuehrung: BekleidungFuehrung;
  maxWaschgaenge?: number;
  aktiv: boolean;
}

export interface BekleidungStueck extends Stamps {
  id?: string;
  artikelId: string;
  tagNummer?: string;
  groesse: string;
  charge?: string;
  eigentum: BekleidungEigentum;
  status: BekleidungStatus;
  lagerort?: string;
  bemerkung?: string;
  personId?: string;
  ausgabeId?: string;
  ausgegebenAm?: string;
  waschgaenge: number;
  waschgaengeAltbestand: number;
  letzteWaescheAm?: string;
}

export interface BekleidungBestand {
  id?: string;
  artikelId: string;
  groesse: string;
  anzahl: number;
  updatedAt: string;
  updatedBy: string;
}

export interface BekleidungAusgabe extends Stamps {
  id?: string;
  personId: string;
  stueckId?: string;
  artikelId: string;
  groesse: string;
  menge: number;
  /** Leer = Datum unbekannt (Import). */
  ausgegebenAm?: string;
  /** Leer = noch ausgegeben. */
  zurueckAm?: string;
  bemerkung?: string;
  quelle: 'app' | 'import';
  /**
   * Nur bei Mengen-Ausgaben aus privaten Zeilen des Imports gesetzt
   * (`privat`): Sie zählen nicht zum Lager, eine Rücknahme bucht sie nie
   * in den Bestand. Fehlt das Feld, gehört die Menge der Feuerwehr.
   */
  eigentum?: BekleidungEigentum;
}

export interface BekleidungWaesche {
  id?: string;
  datum: string;
  programm: WaschProgramm;
  programmText?: string;
  stueckIds: string[];
  bemerkung?: string;
  createdAt: string;
  createdBy: string;
}

/** Größe vergleichbar machen: „ m3 " und „M3" sind dieselbe Größe. */
export function normalizeGroesse(groesse: string): string {
  return groesse.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Dokument-ID des Mengenbestands je Artikel und Größe. Die Größe wird
 * kodiert, weil „52/54" sonst einen Pfadtrenner enthielte.
 */
export function bestandDocId(artikelId: string, groesse: string): string {
  return `${artikelId}__${encodeURIComponent(normalizeGroesse(groesse))}`;
}

/**
 * Tag-Nummer aus dem Excel oder einer Eingabe: getrimmt, eine als Zahl
 * gespeicherte Zelle als Ganzzahltext. Leer → `undefined`.
 *
 * Als Zahl gespeicherte Zellen stehen je nach Programm als „22081702.0" oder
 * in E-Schreibweise („2.2081702E7") in der Datei. Eine alphanumerische Nummer
 * wie „7E97510003180001" sieht ähnlich aus, hat aber keinen Dezimalpunkt in
 * der Mantisse und bleibt unverändert.
 */
export function normalizeTagNummer(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const decimal = /^(\d+)\.0+$/.exec(trimmed);
  if (decimal) return decimal[1];
  if (/^\d\.\d+E\+?\d+$/i.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isSafeInteger(value)) return String(value);
  }
  return trimmed;
}

/** Angezeigter Waschzähler: Startwert aus dem Import plus gezählte Wäschen. */
export function totalWaschgaenge(
  stueck: Pick<BekleidungStueck, 'waschgaenge' | 'waschgaengeAltbestand'>,
): number {
  return (stueck.waschgaenge ?? 0) + (stueck.waschgaengeAltbestand ?? 0);
}

/**
 * Stand gegenüber der Höchstzahl der Wäschen des Artikels: `near` ab 90 %,
 * `reached` ab der Höchstzahl, ohne Höchstzahl immer `ok`.
 */
export function waschLimitState(
  stueck: Pick<BekleidungStueck, 'waschgaenge' | 'waschgaengeAltbestand'>,
  artikel: Pick<BekleidungArtikel, 'maxWaschgaenge'> | undefined,
): 'ok' | 'near' | 'reached' {
  const max = artikel?.maxWaschgaenge;
  if (!max || max <= 0) return 'ok';
  const total = totalWaschgaenge(stueck);
  if (total >= max) return 'reached';
  if (total >= max * 0.9) return 'near';
  return 'ok';
}
