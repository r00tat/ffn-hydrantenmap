import type { Diary } from '../../../firebase/firestore';
import type { DammSumme } from './dammSumme';
import type { DammbauView } from './sandsack';

/**
 * Labels für den Tagebucheintrag. Werden vom Aufrufer übergeben, der Zugriff auf
 * `useTranslations` hat — so bleibt dieses Modul rein und testbar. Gleiches
 * Muster wie `buildFoerderungDiaryEntry`.
 */
export interface DammbauDiaryLabels {
  title: (name: string) => string;
  section: (laenge: number, hoehe: number, bauweise: string) => string;
  bags: (count: number, reserve: number) => string;
  sand: (tons: number, cubic: number) => string;
  pallets: (count: number) => string;
  trucksBags: (count: number) => string;
  trucksSand: (count: number) => string;
  foil: (squareMetres: number) => string;
  work: (hours: number, personal: number) => string;
  targetTime: (hours: number, personal: number) => string;
  totalTitle: (count: number) => string;
  totalBags: (count: number) => string;
  totalSand: (tons: number) => string;
  totalTrucks: (count: number) => string;
}

export interface DammbauDiaryInput {
  dammName?: string;
  view: DammbauView;
  timestamp: string;
  /** Die übersetzte Bauweise — der Schlüssel taugt nicht als Aufschrift. */
  bauweiseLabel: string;
  /** Alle Dammabschnitte der Lage, falls es mehr als diesen gibt. */
  summe?: DammSumme;
  labels: DammbauDiaryLabels;
}

const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Reiner Builder für den Einsatztagebuch-Eintrag der Materialanforderung.
 *
 * Genau **ein** Eintrag, und nur auf Knopfdruck: Am Regler wird probiert, in den
 * Verlauf gehört die Menge, die tatsächlich nachgefordert wurde.
 *
 * Die Anforderungsmenge ist die **mit** Reserve — nachgefordert wird, was
 * gebraucht wird, und nicht das rechnerische Minimum.
 */
export function buildDammbauDiaryEntry(input: DammbauDiaryInput): Diary {
  const { view, labels, summe } = input;
  const { bedarf, params } = view;

  const lines = [
    labels.section(
      Math.round(view.laenge),
      round(params.dammHoehe, 2),
      input.bauweiseLabel
    ),
    labels.bags(bedarf.saecke, bedarf.saeckeBestellen),
    labels.sand(round(bedarf.sandMasse), round(bedarf.sandVolumen)),
    labels.pallets(bedarf.paletten),
    labels.trucksBags(bedarf.lkwFuhrenSaecke),
    labels.trucksSand(bedarf.lkwFuhrenSand),
    labels.foil(Math.round(bedarf.folieFlaeche)),
    labels.work(round(bedarf.bauzeit), Math.round(params.dammPersonal)),
    labels.targetTime(
      round(params.dammZielzeit),
      bedarf.personalFuerZielzeit
    ),
  ];

  // Nur bei mehreren Abschnitten: Bei einem einzigen wäre die Summe eine
  // Wiederholung der Zeilen darüber.
  if (summe && summe.abschnitte.length > 1) {
    lines.push(
      '',
      labels.totalTitle(summe.abschnitte.length),
      labels.totalBags(summe.saeckeBestellen),
      labels.totalSand(round(summe.sandMasse)),
      labels.totalTrucks(summe.lkwFuhrenSaecke)
    );
  }

  return {
    type: 'diary',
    art: 'M',
    datum: input.timestamp,
    name: labels.title(input.dammName || ''),
    beschreibung: lines.join('\n'),
  };
}
