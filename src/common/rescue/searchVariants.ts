import { normalizeName } from './normalize';
import { RescueVariant } from './types';

const DEFAULT_LIMIT = 60;

/** Alle durchsuchbaren Felder einer Variante als ein normalisierter String. */
function haystack(variant: RescueVariant): string {
  return normalizeName(
    [
      variant.makeName,
      variant.modelName,
      variant.variantName,
      variant.bodyType,
      variant.powertrain,
      variant.buildYearFrom,
      variant.buildYearUntil,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Freitextsuche über den Katalog: alle Suchbegriffe müssen vorkommen.
 * Sortiert nach Marke, Modell und Baujahr, damit die Trefferliste der
 * Reihenfolge folgt, in der man ein Fahrzeug sucht.
 */
export function searchRescueVariants(
  term: string,
  variants: RescueVariant[],
  limit: number = DEFAULT_LIMIT,
): RescueVariant[] {
  const tokens = normalizeName(term).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const found = variants.filter((variant) => {
    const text = haystack(variant);
    return tokens.every((token) => text.includes(token));
  });

  found.sort(
    (a, b) =>
      a.makeName.localeCompare(b.makeName) ||
      a.modelName.localeCompare(b.modelName) ||
      a.variantName.localeCompare(b.variantName) ||
      (a.buildYearFrom ?? 0) - (b.buildYearFrom ?? 0),
  );
  return found.slice(0, limit);
}
