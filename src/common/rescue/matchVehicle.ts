import {
  modelNameCandidates,
  normalizeMake,
  normalizeName,
  parseRegistrationYear,
  powertrainMatches,
} from './normalize';
import { RescueVariant } from './types';

/** Die Felder der ÖBFV-Kennzeichenabfrage, die für die Zuordnung taugen. */
export interface RescueVehicleQuery {
  marke: string;
  name: string;
  antrieb?: string;
  erstzulassung?: string;
}

export interface RescueVariantMatch {
  variant: RescueVariant;
  score: number;
}

/** Mehr Treffer sind für die Auswahl am Einsatzort nicht hilfreich. */
const MAX_MATCHES = 10;

/**
 * Toleranz in Jahren um den Bauzeitraum. Die Erstzulassung liegt bei
 * Vorführ- und Lagerfahrzeugen regelmäßig ein Jahr neben dem Modelljahr.
 */
const YEAR_TOLERANCE = 1;

/**
 * Bewertet, wie gut der Modellname aus der Zulassung zum Katalognamen passt.
 * 0 bedeutet „passt nicht“ — solche Varianten fallen ganz raus.
 */
function scoreModelName(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 4;
  if (candidate.startsWith(query) || query.startsWith(candidate)) return 3;
  if (candidate.includes(query) || query.includes(candidate)) return 2;
  const queryTokens = query.split(' ');
  if (queryTokens.every((token) => candidate.includes(token))) return 1;
  return 0;
}

/**
 * Bewertet den Bauzeitraum gegen das Erstzulassungsjahr.
 * `null` heißt: die Variante kann es nicht sein.
 */
function scoreBuildYears(
  year: number | undefined,
  variant: RescueVariant,
): number | null {
  if (year === undefined || variant.buildYearFrom === undefined) return 0;
  const until = variant.buildYearUntil ?? Number.MAX_SAFE_INTEGER;
  if (year >= variant.buildYearFrom && year <= until) return 3;
  if (
    year >= variant.buildYearFrom - YEAR_TOLERANCE &&
    year <= until + YEAR_TOLERANCE
  ) {
    return 1;
  }
  return null;
}

/**
 * Ordnet einem Fahrzeug aus der Kennzeichenabfrage die Varianten des
 * Euro-Rescue-Katalogs zu, absteigend nach Passgenauigkeit. Die Marke muss
 * stimmen, der Modellname zumindest teilweise; Bauzeitraum und Antrieb
 * entscheiden zwischen mehreren Varianten desselben Modells.
 */
export function matchRescueVariants(
  query: RescueVehicleQuery,
  variants: RescueVariant[],
): RescueVariantMatch[] {
  const make = normalizeMake(query.marke);
  const modelCandidates = modelNameCandidates(query.marke, query.name);
  if (!make || modelCandidates.length === 0) return [];

  const year = parseRegistrationYear(query.erstzulassung);
  const matches: RescueVariantMatch[] = [];

  for (const variant of variants) {
    if (normalizeMake(variant.makeName) !== make) continue;

    const modelName = normalizeName(variant.modelName);
    const variantName = normalizeName(variant.variantName);
    // Basismodell und Variantenname zählen beide: das Basismodell ist bei
    // allen Varianten einer Baureihe gleich, erst der Variantenname trennt
    // den „Golf“ vom „Golf Sportsvan“.
    const nameScore = Math.max(
      ...modelCandidates.map(
        (candidate) =>
          scoreModelName(candidate, modelName) +
          scoreModelName(candidate, variantName),
      ),
    );
    if (nameScore === 0) continue;

    const yearScore = scoreBuildYears(year, variant);
    if (yearScore === null) continue;

    const powertrainScore = powertrainMatches(query.antrieb, variant.powertrain)
      ? 1
      : 0;

    matches.push({
      variant,
      score: nameScore + yearScore + powertrainScore,
    });
  }

  matches.sort(
    (a, b) =>
      b.score - a.score ||
      (b.variant.buildYearFrom ?? 0) - (a.variant.buildYearFrom ?? 0) ||
      a.variant.variantName.localeCompare(b.variant.variantName),
  );
  return matches.slice(0, MAX_MATCHES);
}
