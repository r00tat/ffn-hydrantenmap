import {
  formatRescueBuildYears,
  formatRescueSheetTitle,
} from '../../common/rescue/sheetView';
import { RescueSheetView } from '../../common/rescue/types';
import { Diary } from '../../components/firebase/firestore';
import { KennzeichenSystem } from './logEntry';
import { Vehicle } from './parseVehicleData';

/**
 * Localized labels for the diary entry. Passed in by the caller (which has
 * access to `useTranslations`) so this module stays pure and testable.
 */
export interface KennzeichenDiaryLabels {
  title: (plate: string) => string;
  titleUebung: (plate: string) => string;
  noResult: string;
  vehicleHeading: (n: number) => string;
  fields: Record<keyof Vehicle, string>;
  rescueSheet: string;
}

export interface KennzeichenDiaryInput {
  platePrefix: string;
  plateNumber: string;
  system: KennzeichenSystem;
  vehicles: Vehicle[];
  /**
   * Rettungskarten-Treffer je Fahrzeug, positionsgleich mit `vehicles`.
   * Übernommen wird der beste Treffer, damit im Tagebuch nachvollziehbar
   * bleibt, welche Karte im Einsatz vorlag.
   */
  rescueSheets?: RescueSheetView[][];
  noResult: boolean;
  timestamp: string;
  labels: KennzeichenDiaryLabels;
}

/** Field order as displayed on the query page. */
const FIELD_ORDER: (keyof Vehicle)[] = [
  'antrieb',
  'marke',
  'name',
  'type',
  'hoechstMasse',
  'erstzulassung',
  'fin',
  'variante',
  'version',
];

function formatVehicle(
  vehicle: Vehicle,
  fields: Record<keyof Vehicle, string>
): string[] {
  return FIELD_ORDER.filter((key) => vehicle[key]?.trim()).map(
    (key) => `${fields[key]}: ${vehicle[key].trim()}`
  );
}

/**
 * Zeile mit dem Link auf die Rettungskarte des besten Treffers. Ohne Treffer
 * oder ohne hinterlegtes Dokument bleibt sie weg.
 */
function formatRescueSheet(
  sheets: RescueSheetView[] | undefined,
  label: string
): string[] {
  const best = sheets?.find((sheet) => sheet.sheetUrl);
  if (!best?.sheetUrl) return [];
  const years = formatRescueBuildYears(best);
  const title = formatRescueSheetTitle(best) + (years ? ` (${years})` : '');
  return [`${label}: ${title}: ${best.sheetUrl}`];
}

/**
 * Pure builder — assembles the Einsatztagebuch entry documenting a plate
 * query and its result. Multiple vehicles (Wechselkennzeichen) are rendered
 * as separate blocks, each with a heading.
 */
export function buildKennzeichenDiaryEntry(
  input: KennzeichenDiaryInput
): Diary {
  const { labels } = input;
  const plate = `${input.platePrefix.trim().toUpperCase()} ${input.plateNumber
    .trim()
    .toUpperCase()}`.trim();

  const name =
    input.system === 'uebung' ? labels.titleUebung(plate) : labels.title(plate);

  let beschreibung: string;
  if (input.noResult || input.vehicles.length === 0) {
    beschreibung = labels.noResult;
  } else if (input.vehicles.length === 1) {
    beschreibung = [
      ...formatVehicle(input.vehicles[0], labels.fields),
      ...formatRescueSheet(input.rescueSheets?.[0], labels.rescueSheet),
    ].join('\n');
  } else {
    beschreibung = input.vehicles
      .map((vehicle, idx) =>
        [
          labels.vehicleHeading(idx + 1),
          ...formatVehicle(vehicle, labels.fields),
          ...formatRescueSheet(input.rescueSheets?.[idx], labels.rescueSheet),
        ].join('\n')
      )
      .join('\n\n');
  }

  return {
    type: 'diary',
    art: 'M',
    datum: input.timestamp,
    name,
    beschreibung,
  };
}
