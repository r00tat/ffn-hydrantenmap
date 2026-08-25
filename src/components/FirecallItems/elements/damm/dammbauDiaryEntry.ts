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
  /**
   * Die Anforderungsmenge zuerst: Der Eintrag ist eine **Materialanforderung**,
   * und was angefordert wird, ist die Menge mit Reserve. Der reine Bedarf steht
   * daneben, damit die Zahl nachprüfbar bleibt.
   */
  bags: (order: number, needed: number, reserve: number) => string;
  /** Sackformat, Füllgrad und das Gewicht, das getragen werden muss. */
  bagFormat: (format: string, fillLevel: number, weightWet: number) => string;
  sand: (tons: number, cubic: number) => string;
  pallets: (count: number) => string;
  trucksBags: (count: number) => string;
  trucksSand: (count: number) => string;
  foil: (squareMetres: number) => string;
  tools: (shovels: number, funnels: number) => string;
  /** Wasserstand, den der Damm mit dem Freibord hält. */
  waterLevel: (level: number, freeboard: number) => string;
  /** Querschnitt: Basis, Krone, Lagen. */
  crossSection: (base: number, crown: number, layers: number) => string;
  work: (hours: number, personal: number) => string;
  /** Aufteilung der Kräfte auf Füllen, Transport und Verbauen. */
  split: (fill: number, transport: number, lay: number) => string;
  /** Trageweite der Kette und die Helfer dafür. */
  carry: (metres: number, helpers: number) => string;
  /** Woher die Sackzahl kommt — Tabelle oder Handeingabe. */
  source: string;
  /**
   * Woher die Dammhöhe kommt — nur gesetzt, wenn sie aus dem
   * Wasserstandsmodell übernommen wurde.
   *
   * Als Text und nicht als Schalter: dieser Builder trägt keinen einzigen
   * eigenen Satz, alle Wörter kommen vom Aufrufer. Ein hier eingebauter
   * deutscher String wäre in der englischen Fassung deutsch.
   */
  heightSource?: string;
  /** Nur wenn eine Füllhilfe im Einsatz ist. */
  funnel: string;
  /** Nur wenn die Säcke zugebunden werden. */
  tie: string;
  totalTitle: (count: number) => string;
  totalBags: (count: number) => string;
  totalSand: (tons: number) => string;
  totalTrucks: (count: number) => string;
  totalPersonnel: (count: number, hours: number) => string;
}

export interface DammbauDiaryInput {
  dammName?: string;
  view: DammbauView;
  timestamp: string;
  /** Die übersetzte Bauweise — der Schlüssel taugt nicht als Aufschrift. */
  bauweiseLabel: string;
  /** Das übersetzte Sackformat, aus demselben Grund. */
  formatLabel: string;
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
    // Erst der Damm, dann das Material, dann die Kräfte — in der Reihenfolge,
    // in der die Anforderung gelesen wird.
    // Woher die Höhe kommt, gehört in die Materialanforderung: eine Zahl aus
    // dem Modell ist im Führungsvorgang etwas anderes als eine geschätzte.
    labels.section(
      Math.round(view.laenge),
      round(params.dammHoehe, 2),
      input.bauweiseLabel
    ) + (labels.heightSource ? ` (${labels.heightSource})` : ''),
    labels.waterLevel(
      round(bedarf.wasserstand, 2),
      round(params.freibord, 2)
    ),
    labels.crossSection(
      round(bedarf.querschnitt.basisbreite, 2),
      round(bedarf.querschnitt.kronenbreite, 2),
      bedarf.lagen
    ),
    labels.source,
    '',
    labels.bags(
      bedarf.saeckeBestellen,
      bedarf.saecke,
      round(params.dammReserve, 0)
    ),
    labels.bagFormat(
      input.formatLabel,
      round(params.sackFuellgrad, 0),
      round(bedarf.masseJeSackNass)
    ),
    labels.sand(round(bedarf.sandMasse), round(bedarf.sandVolumen)),
    labels.pallets(bedarf.paletten),
    labels.trucksBags(bedarf.lkwFuhrenSaecke),
    labels.trucksSand(bedarf.lkwFuhrenSand),
    labels.foil(Math.round(bedarf.folieFlaeche)),
    labels.tools(bedarf.schaufeln, bedarf.fuellhilfen),
    '',
    labels.work(round(bedarf.bauzeit), bedarf.kraefte),
    labels.split(
      bedarf.personalVerteilung.fuellen,
      bedarf.personalVerteilung.transport,
      bedarf.personalVerteilung.verbauen
    ),
    labels.carry(round(params.transportWeite), bedarf.kettenHelfer),
  ];

  // Nur, was von der Vorbelegung abweicht: Ein Eintrag „ohne Füllhilfe, nicht
  // zugebunden" ist keine Auskunft. Beides ändert die Füllleistung und damit
  // die Bauzeit, deshalb steht es dabei, wenn es zutrifft.
  if (params.fuellTrichter) lines.push(labels.funnel);
  if (params.saeckeRoedeln) lines.push(labels.tie);

  // Nur bei mehreren Abschnitten: Bei einem einzigen wäre die Summe eine
  // Wiederholung der Zeilen darüber.
  if (summe && summe.abschnitte.length > 1) {
    lines.push(
      '',
      labels.totalTitle(summe.abschnitte.length),
      labels.totalBags(summe.saeckeBestellen),
      labels.totalSand(round(summe.sandMasse)),
      labels.totalTrucks(summe.lkwFuhrenSaecke),
      // Neben dem Material die zweite Nachforderung: Gebraucht wird die Summe
      // über alle Abschnitte, nicht die dieses einen.
      labels.totalPersonnel(summe.personal, round(summe.bauzeit))
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
