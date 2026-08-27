import type {
  FirecallItem,
  TacticalUnitType,
} from '../../components/firebase/firestore';
import { itemFields, LAGEKARTE_ICON_BASE, type ItemPatch } from './types';

export interface IconTarget {
  /** Ordner unter `src/img`, z.B. `'oenorm'` */
  folder: string;
  file: string;
  /**
   * `true` = das Symbol entspricht unserem Zeichen genau und wird beim Import
   * zurückgemappt. `false` = Näherung; die genaue Bezeichnung steht nur in
   * `infoData.bezeichnung` und wird beim Import NICHT zurückgemappt.
   */
  exact: boolean;
}

const oenorm = (file: string, exact = true): IconTarget => ({
  folder: 'oenorm',
  file,
  exact,
});
const oebfv = (file: string, exact = true): IconTarget => ({
  folder: 'oebfv',
  file,
  exact,
});
const geraete = (file: string, exact = true): IconTarget => ({
  folder: 'geraete',
  file,
  exact,
});

/**
 * Unsere 48 taktischen Zeichen aus `elements/icons.ts` → lagekarte-Symbol.
 *
 * Die ÖNORM-Reihe deckt fast alles ab; für „Person unter Atem- oder
 * Körperschutz", „Person in Kommandantenfunktion", Elektrizität und
 * Verrauchung gibt es nur ÖBFV-Zeichen. Die Feuerwehr-Hierarchie über der
 * Kompanie (Abschnitt, Bezirk, LFV, ÖBFV) hat gar keine Entsprechung — dort
 * das Grundzeichen als Näherung.
 */
export const ZEICHEN_ICON_MAP: Record<string, IconTarget> = {
  // Einrichtungen und Führung
  Ständige_ortsfeste_Einrichtung: oenorm(
    '4.1_staendige_ortsfeste_einrichtung.svg',
  ),
  Vorübergehende_anlassbezogene_Einrichtung: oenorm(
    '4.2_voruebergehende_anlassbezogene_einrichtung.svg',
  ),
  // exact: false, obwohl das Symbol genau passt — es kollidiert mit dem Typ `el`,
  // der beim Import gewinnen soll, weil er spezifischer ist.
  Befehls_Führungs_Leitstelle: oenorm(
    '3.1_grundzeichen_befehls_fuehrungs_leitstellen.svg',
    false,
  ),

  // Formation von Kräften
  Einheit: oenorm('2.1_grundzeichen_formation_von_kraeften.svg'),
  Trupp: oenorm('2.1.1_formation_trupp.svg'),
  Gruppe: oenorm('2.1.2_formation_gruppe.svg'),
  Zug: oenorm('2.1.3_formation_zug.svg'),
  Bereitschaft: oenorm('2.1.4_formation_kompanie.svg', false),
  Abschnitt: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  Bezirk: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  LFV: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  ÖBFV: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),

  // Personen
  Person: oenorm('1.1_grundzeichen_person.svg'),
  Person_in_Kommandantenfunktion: oebfv('1.7_person_kommandaten.svg'),
  Person_in_Zwangslage: oenorm('1.4_person_in_zwangslage.svg'),
  'Person_unter_Atem-_oder_Körperschutz': oebfv('1.6_person_schutz.svg'),
  Person_tot: oenorm('1.3_person_tot.svg'),
  Person_verletzt: oenorm('1.2_person_verletzt.svg'),
  Person_vermisst: oenorm('1.5_person_vermisst.svg'),

  // Gefahren
  Ansteckungsgefahr: oenorm('9.2_gefahr_ansteckung.svg'),
  Brandgefahr: oenorm('9.3_gefahr_brand.svg'),
  Chemiegefahr: oenorm('9.4_gefahr_chemie.svg'),
  Explosionsgefahr: oenorm('9.9_gefahr_explosion.svg'),
  Gasgefahr: oenorm('9.5_gefahr_gas.svg'),
  Gefahr_allgemein: oenorm('9.1_gefahr_allgemein.svg'),
  Gefahr_durch_Elektrizität: oebfv('9.10_gefahr_durch_elektrizitaet.svg'),
  Gefahr_durch_Verrauchung: oebfv('9.11_gefahr_durch_rauch.svg'),
  'Lawinen-,_Muren-_oder_Felssturzgefahr': oenorm(
    '9.6_gefahr_lawinen_muren_felssturz.svg',
  ),
  Strahlengefahr: oenorm(
    '9.7_strahlengefahr_oder_gefahr_durch_radioaktive_stoffe.svg',
  ),
  // Das Leerzeichen vor dem Unterstrich ist im Dateinamen auf lagekarte.info
  // wirklich so — HTTP-verifiziert, nicht abtippen ohne zu prüfen.
  Überflutungsgefahr: oenorm('9.8 _gefahr_ueberflutung.svg'),

  // Schäden
  Beschädigt: oenorm(
    '10.9.1_beschaedigt_angeschlagen_in_der_funktion_beeintraechtigt.svg',
  ),
  Chemieaustritt: oenorm('10.4_chemieaustritt.svg'),
  'Entstehungsbrand,_Schwelbrand': oenorm(
    '10.3.1_entstehungsbrand_schwelbrand.svg',
  ),
  Entwickelter_Brand: oenorm('10.3.2_entwickelter_brand.svg'),
  Gasaustritt: oenorm('10.5_gasaustritt.svg'),
  'Lawine,_Mure,_Felssturz': oenorm('10.6_lawinen_muren_felssturz.svg'),
  Schaden_allgemein: oenorm('10.1_schaden_allgemein.svg'),
  // Näherung, weil `Verseuchung` dasselbe Symbol exakt trifft — beim Import
  // gewinnt dort `Verseuchung`.
  Strahlung_oder_radioaktive_Kontamination: oenorm('10.2_verseuchung.svg', false),
  Teilzerstört: oenorm(
    '10.9.2_teilzerstoert_teilweise_zusammengebrochen_ausser_funktion_gesetzt.svg',
  ),
  Überflutung: oenorm('10.8_ueberflutung.svg'),
  'Unterbrochen,_blockiert,_gesperrt': oenorm(
    '10.9.4_unterbrochen_blockiert_gesperrt.svg',
  ),
  Verseuchung: oenorm('10.2_verseuchung.svg'),
  Vollbrand: oenorm('10.3.3_vollbrand.svg'),
  Zerstört: oenorm(
    '10.9.3_zerstoert_voellig_zusammengebrochen_ausser_funktion_gesetzt.svg',
  ),

  // Schiene, Wasser, Luft
  Flächenflugzeug: oenorm('8.1_grundzeichen_flaechenflugzeug.svg'),
  Hubschrauber: oenorm('8.2_grundzeichen_hubschrauber.svg'),
  Schienenfahrzeug: oenorm('6.1_grundzeichen_schienenfahrzeug.svg'),
  Wasserfahrzeug: oenorm('7.1_grundzeichen_wasserfahrzeug.svg'),
};

const UNIT_TYPE_ICON_MAP: Record<TacticalUnitType, IconTarget> = {
  einheit: oenorm('2.1_grundzeichen_formation_von_kraeften.svg'),
  trupp: oenorm('2.1.1_formation_trupp.svg'),
  gruppe: oenorm('2.1.2_formation_gruppe.svg'),
  zug: oenorm('2.1.3_formation_zug.svg'),
  bereitschaft: oenorm('2.1.4_formation_kompanie.svg', false),
  abschnitt: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  bezirk: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  lfv: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
  oebfv: oenorm('2.1_grundzeichen_formation_von_kraeften.svg', false),
};

export function unitTypeIconTarget(unitType?: string): IconTarget | undefined {
  return UNIT_TYPE_ICON_MAP[(unitType ?? 'zug') as TacticalUnitType];
}

const DEFAULT_VEHICLE_ICON = oebfv('5.01.01_grundzeichen_kraftfahrzeug.svg');

/** Symbol für ein Item, abhängig von Typ und typspezifischen Feldern. */
export function itemIconTarget(item: FirecallItem): IconTarget | undefined {
  const rec = itemFields(item);
  switch (item.type) {
    case 'marker':
      return typeof rec.zeichen === 'string'
        ? ZEICHEN_ICON_MAP[rec.zeichen]
        : undefined;
    case 'tacticalUnit':
      return unitTypeIconTarget(rec.unitType as string | undefined);
    case 'vehicle':
      return DEFAULT_VEHICLE_ICON;
    case 'rohr':
      return rec.art === 'Wasserwerfer'
        ? geraete('werfer.svg')
        : geraete('strahlrohr.svg');
    case 'hydrant':
      return rec.typ === 'Unterflurhydrant'
        ? geraete('unterflurhydrant.svg')
        : geraete('ueberflurhydrant.svg');
    case 'assp':
      return oenorm('4.2.1_atemschutzsammelplatz.svg');
    case 'el':
      return oenorm('3.1_grundzeichen_befehls_fuehrungs_leitstellen.svg');
    case 'location':
      return oenorm('4.2_voruebergehende_anlassbezogene_einrichtung.svg', false);
    default:
      return undefined;
  }
}

export function iconUrlFor(target: IconTarget): string {
  return `${LAGEKARTE_ICON_BASE}/${target.folder}/${target.file}`;
}

/** Ordner + Datei aus einem relativen oder absoluten lagekarte-Icon-Pfad. */
export function splitIconUrl(
  iconUrl: string,
): { folder: string; file: string } | undefined {
  const match = /(?:^|\/)img\/([^/]+)\/([^/?#]+)$/.exec(iconUrl);
  return match
    ? { folder: match[1], file: decodeURIComponent(match[2]) }
    : undefined;
}

/** Reverse-Zuordnung: nur exakte Einträge, aufgebaut aus ZEICHEN_ICON_MAP. */
const REVERSE_ZEICHEN: Record<string, string> = Object.fromEntries(
  Object.entries(ZEICHEN_ICON_MAP)
    .filter(([, t]) => t.exact)
    .map(([zeichen, t]) => [`${t.folder}/${t.file}`, zeichen]),
);

const GERAETE_TO_ITEM: Record<string, ItemPatch> = {
  'strahlrohr.svg': { type: 'rohr' },
  'werfer.svg': { type: 'rohr', art: 'Wasserwerfer' },
  'ueberflurhydrant.svg': { type: 'hydrant', typ: 'Überflurhydrant' },
  'unterflurhydrant.svg': { type: 'hydrant', typ: 'Unterflurhydrant' },
};

/**
 * Ein lagekarte-Symbol auf unseren Typ zurückführen. `undefined` heißt:
 * unbekannt — der Aufrufer legt dann einen `marker` mit `iconUrl` an.
 */
export function lagekarteIconToItem(iconUrl: string): ItemPatch | undefined {
  const split = splitIconUrl(iconUrl);
  if (!split) return undefined;
  const { folder, file } = split;

  if (folder === 'geraete') {
    const hit = GERAETE_TO_ITEM[file];
    return hit ? { ...hit } : undefined;
  }

  if (folder === 'oenorm' && file === '4.2.1_atemschutzsammelplatz.svg') {
    return { type: 'assp' };
  }
  if (
    folder === 'oenorm' &&
    file === '3.1_grundzeichen_befehls_fuehrungs_leitstellen.svg'
  ) {
    return { type: 'el' };
  }
  // Die Fahrzeugsymbole liegen in zwei Ordnern: `oebfv` unter der Nummer 5.01
  // (Kraftfahrzeuge der ÖBFV-Reihe) und `fahrzeuge` (Drehleiter & Co.).
  if (folder === 'fahrzeuge' || (folder === 'oebfv' && file.startsWith('5.01'))) {
    return { type: 'vehicle' };
  }

  const zeichen = REVERSE_ZEICHEN[`${folder}/${file}`];
  return zeichen ? { type: 'marker', zeichen } : undefined;
}
