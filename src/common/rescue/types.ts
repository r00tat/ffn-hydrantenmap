/**
 * Typen des Euro-Rescue-Katalogs von Euro NCAP.
 *
 * Die Rettungskarten selbst werden nie gespiegelt: wir halten ausschließlich
 * die Metadaten und verlinken die PDFs unter ihrer Original-URL bei Euro NCAP.
 * Siehe docs/rettungskarten.md.
 */

/** ISO-639-1-Code in Großbuchstaben, wie ihn die API liefert (`DE`, `EN`, …). */
export type RescueLanguage = string;

/**
 * `sheet` ist die fahrzeugspezifische Rettungskarte nach ISO 17840,
 * `guide` die markenweite Notfall-Anleitung (Rescue Guide).
 */
export type RescueDocumentType = 'sheet' | 'guide';

export interface RescueDocument {
  url: string;
  language: RescueLanguage;
  type: RescueDocumentType;
}

/** Eine Fahrzeugvariante des Katalogs, auf das Nötige reduziert. */
export interface RescueVariant {
  id: string;
  makeName: string;
  /** Basismodell, z.B. „A3“. */
  modelName: string;
  /** Vollständiger Variantenname, z.B. „A3 Sportback e-tron“. */
  variantName: string;
  bodyType?: string;
  buildYearFrom?: number;
  /** Fehlt, solange die Variante gebaut wird. */
  buildYearUntil?: number;
  doors?: string;
  powertrain?: string;
  pictureUrl?: string;
  documents: RescueDocument[];
}

/**
 * Anzeigemodell für Client-Komponenten: die Dokumente sind bereits auf die
 * Sprache des Benutzers aufgelöst, damit nicht 25 Sprachvarianten je Fahrzeug
 * über die Leitung gehen.
 */
export interface RescueSheetView {
  id: string;
  makeName: string;
  modelName: string;
  variantName: string;
  bodyType?: string;
  buildYearFrom?: number;
  buildYearUntil?: number;
  doors?: string;
  powertrain?: string;
  pictureUrl?: string;
  /** URL der Rettungskarte; fehlt bei den wenigen Varianten ohne Sheet. */
  sheetUrl?: string;
  sheetLanguage?: RescueLanguage;
  guideUrl?: string;
  guideLanguage?: RescueLanguage;
}
