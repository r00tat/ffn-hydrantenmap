'use client';

import type { FirecallItem, Line } from '../../../firebase/firestore';
import {
  dammbauView,
  isDammbauEnabled,
  type DammWarning,
  type DammbauView,
} from './sandsack';

/**
 * Alle Dammabschnitte einer Lage in einer Summe.
 *
 * Ein Damm wird selten in einem Stück gebaut: Die Uferstraße bekommt 80 cm, die
 * Hofeinfahrt einen Dammbalken-Ersatz, der Feldweg 50 cm. Nachgefordert wird
 * aber **einmal** — und dann zählt die Gesamtmenge, nicht die des Abschnitts,
 * den man gerade angeklickt hat.
 */

export interface DammAbschnitt {
  id?: string;
  name: string;
  laenge: number;
  bedarf: DammbauView['bedarf'];
  params: DammbauView['params'];
}

export interface DammSumme {
  abschnitte: DammAbschnitt[];
  /** Gesamtlänge in m. */
  laenge: number;
  saecke: number;
  saeckeBestellen: number;
  /** Sandbedarf in m³. */
  sandVolumen: number;
  /** Sandbedarf in t. */
  sandMasse: number;
  fuhren: number;
  /** Folienbedarf in m². */
  folieFlaeche: number;
  personenstunden: number;
  /** Alle eingetragenen Kräfte zusammen. */
  personal: number;
  /** Bauzeit in h, wenn alle Kräfte auf alle Abschnitte gehen. */
  bauzeit: number;
  warnings: DammWarning[];
}

/**
 * Die Summe über alle Dammlinien der Lage, oder `undefined`, wenn keine mit
 * aktivem Rechner dabei ist.
 *
 * Die LKW-Fuhren werden über die **Gesamtmenge** aufgerundet und nicht je
 * Abschnitt aufsummiert: Ein halb beladener LKW fährt nicht zweimal.
 */
export function dammSumme(items: FirecallItem[]): DammSumme | undefined {
  const abschnitte: DammAbschnitt[] = [];
  let fuhrenVolumen = 0;

  for (const item of items) {
    if (item.deleted === true) continue;
    if (item.type !== 'line') continue;
    const line = item as Line;
    if (!isDammbauEnabled(line)) continue;

    const view = dammbauView(line);
    if (!view || view.bedarf.saecke <= 0) continue;

    abschnitte.push({
      id: line.id,
      name: line.name || '',
      laenge: view.laenge,
      bedarf: view.bedarf,
      params: view.params,
    });
    // Der größte gesetzte Wert gewinnt: Gefahren wird mit dem LKW, der da ist,
    // und der ist für die ganze Lage derselbe.
    fuhrenVolumen = Math.max(fuhrenVolumen, view.params.fuhrenVolumen);
  }

  if (abschnitte.length === 0) return undefined;

  const sum = (pick: (a: DammAbschnitt) => number) =>
    abschnitte.reduce((total, abschnitt) => total + pick(abschnitt), 0);

  const sandVolumen = sum((a) => a.bedarf.sandVolumen);
  const personenstunden = sum((a) => a.bedarf.personenstunden);
  const personal = sum((a) => a.params.dammPersonal);

  return {
    abschnitte,
    laenge: sum((a) => a.laenge),
    saecke: sum((a) => a.bedarf.saecke),
    saeckeBestellen: sum((a) => a.bedarf.saeckeBestellen),
    sandVolumen,
    sandMasse: sum((a) => a.bedarf.sandMasse),
    fuhren: fuhrenVolumen > 0 ? Math.ceil(sandVolumen / fuhrenVolumen) : 0,
    folieFlaeche: sum((a) => a.bedarf.folieFlaeche),
    personenstunden,
    personal,
    bauzeit: personal > 0 ? personenstunden / personal : 0,
    warnings: [
      ...new Set(abschnitte.flatMap((a) => a.bedarf.warnings)),
    ] as DammWarning[],
  };
}
