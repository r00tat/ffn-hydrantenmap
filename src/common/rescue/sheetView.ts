import { Locale } from '../../i18n/config';
import {
  RescueDocument,
  RescueDocumentType,
  RescueSheetView,
  RescueVariant,
} from './types';

/**
 * Sprachreihenfolge für die Dokumentauswahl: die Sprache des Benutzers, dann
 * die jeweils andere App-Sprache, dann irgendeine — eine Rettungskarte in
 * fremder Sprache ist im Einsatz immer noch besser als gar keine.
 */
function languagePreference(locale: Locale): string[] {
  return locale === 'en' ? ['EN', 'DE'] : ['DE', 'EN'];
}

function pickDocument(
  documents: RescueDocument[],
  type: RescueDocumentType,
  locale: Locale,
): RescueDocument | undefined {
  const candidates = documents.filter((doc) => doc.type === type);
  for (const language of languagePreference(locale)) {
    const hit = candidates.find(
      (doc) => doc.language.toUpperCase() === language,
    );
    if (hit) return hit;
  }
  return candidates[0];
}

/**
 * Wandelt eine Katalogvariante in das Anzeigemodell für den Client: die
 * Dokumente sind auf die Sprache des Benutzers aufgelöst, damit nicht alle
 * 25 Sprachvarianten je Fahrzeug über die Leitung gehen.
 */
export function toRescueSheetView(
  variant: RescueVariant,
  locale: Locale,
): RescueSheetView {
  const sheet = pickDocument(variant.documents, 'sheet', locale);
  const guide = pickDocument(variant.documents, 'guide', locale);
  return {
    id: variant.id,
    makeName: variant.makeName,
    modelName: variant.modelName,
    variantName: variant.variantName,
    bodyType: variant.bodyType,
    buildYearFrom: variant.buildYearFrom,
    buildYearUntil: variant.buildYearUntil,
    doors: variant.doors,
    powertrain: variant.powertrain,
    pictureUrl: variant.pictureUrl,
    sheetUrl: sheet?.url,
    sheetLanguage: sheet?.language,
    guideUrl: guide?.url,
    guideLanguage: guide?.language,
  };
}

/**
 * Bezeichnung der Variante für Listen, Tagebucheinträge und Links:
 * Marke plus Variantenname, der das Basismodell bereits enthält.
 */
export function formatRescueSheetTitle(view: RescueSheetView): string {
  const model = view.variantName || view.modelName;
  return [view.makeName, model].filter(Boolean).join(' ').trim();
}

/**
 * Bauzeitraum als `2012–2020` bzw. `2019–` für eine noch laufende Baureihe.
 * Sprachneutral, damit die Formatierung ohne Übersetzung auskommt.
 */
export function formatRescueBuildYears(view: RescueSheetView): string {
  if (view.buildYearFrom === undefined) return '';
  return `${view.buildYearFrom}–${view.buildYearUntil ?? ''}`;
}

/**
 * Die Adresse, unter der die Oberfläche das Fahrzeugbild holt.
 *
 * Bewusst nicht `view.pictureUrl`: Euro NCAP liefert seine PNGs mit
 * `Content-Type: application/pdf`, und Chrome verwirft eine solche
 * cross-origin-Antwort per Opaque Response Blocking
 * (`net::ERR_BLOCKED_BY_ORB`), ohne die Bytes anzusehen. Über den eigenen
 * Origin greift ORB nicht. Siehe docs/rettungskarten.md.
 */
export function rescuePictureSrc(view: RescueSheetView): string | undefined {
  if (!view.pictureUrl || !view.id) return undefined;
  return `/api/rettungskarten/bild/${encodeURIComponent(view.id)}`;
}
