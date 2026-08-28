import 'server-only';

import {
  matchRescueVariants,
  RescueVehicleQuery,
} from '../../common/rescue/matchVehicle';
import { searchRescueVariants } from '../../common/rescue/searchVariants';
import { toRescueSheetView } from '../../common/rescue/sheetView';
import { RescueSheetView } from '../../common/rescue/types';
import { Locale } from '../../i18n/config';
import { loadRescueCatalog } from './euroRescueCatalog';

/**
 * Rettungskarten zu den Fahrzeugen einer Kennzeichenabfrage. Das Ergebnis ist
 * positionsgleich mit der Eingabe: `result[i]` gehört zu `vehicles[i]` und ist
 * absteigend nach Passgenauigkeit sortiert.
 *
 * Fällt der Katalog aus, kommen leere Listen zurück — die Kennzeichenabfrage
 * darf an einer Zusatzinformation nicht scheitern.
 */
export async function lookupRescueSheets(
  vehicles: RescueVehicleQuery[],
  locale: Locale,
): Promise<RescueSheetView[][]> {
  if (vehicles.length === 0) return [];
  try {
    const catalog = await loadRescueCatalog();
    return vehicles.map((vehicle) =>
      matchRescueVariants(vehicle, catalog).map((match) =>
        toRescueSheetView(match.variant, locale),
      ),
    );
  } catch (err) {
    console.error('Euro Rescue lookup failed:', err);
    return vehicles.map(() => []);
  }
}

/** Freitextsuche im Katalog für die Seite „Rettungskarten“. */
export async function searchRescueSheets(
  term: string,
  locale: Locale,
): Promise<RescueSheetView[]> {
  if (!term.trim()) return [];
  const catalog = await loadRescueCatalog();
  return searchRescueVariants(term, catalog).map((variant) =>
    toRescueSheetView(variant, locale),
  );
}

/** Alle Marken des Katalogs, alphabetisch — Einstieg für die Suche. */
export async function listRescueMakes(): Promise<string[]> {
  const catalog = await loadRescueCatalog();
  return [...new Set(catalog.map((variant) => variant.makeName))].sort((a, b) =>
    a.localeCompare(b),
  );
}
