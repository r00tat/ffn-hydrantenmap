'use client';

import type { FirecallItem, Line } from '../../../firebase/firestore';
import {
  PALETTE_MASSE_T,
  SAECKE_JE_PALETTE,
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
  paletten: number;
  /** LKW-Fuhren für die gefüllten Säcke auf Paletten. */
  lkwFuhrenSaecke: number;
  /** LKW-Fuhren für den losen Sand. */
  lkwFuhrenSand: number;
  /** Folienbedarf in m². */
  folieFlaeche: number;
  /** Alle eingetragenen Kräfte zusammen. */
  personal: number;
  /** Bauzeit in h des längsten Abschnitts — die Ketten arbeiten gleichzeitig. */
  bauzeit: number;
  warnings: DammWarning[];
}

/**
 * Die Summe über alle Dammlinien der Lage, oder `undefined`, wenn keine mit
 * aktivem Rechner dabei ist.
 *
 * Paletten und LKW-Fuhren werden über die **Gesamtmenge** aufgerundet und nicht
 * je Abschnitt aufsummiert: Ein halb beladener LKW fährt nicht zweimal.
 */
export function dammSumme(items: FirecallItem[]): DammSumme | undefined {
  const abschnitte: DammAbschnitt[] = [];
  let lkwNutzlast = 0;

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
    lkwNutzlast = Math.max(lkwNutzlast, view.params.lkwNutzlast);
  }

  if (abschnitte.length === 0) return undefined;

  const sum = (pick: (a: DammAbschnitt) => number) =>
    abschnitte.reduce((total, abschnitt) => total + pick(abschnitt), 0);

  const sandVolumen = sum((a) => a.bedarf.sandVolumen);
  const sandMasse = sum((a) => a.bedarf.sandMasse);
  const saecke = sum((a) => a.bedarf.saecke);
  const personal = sum((a) => a.params.dammPersonal);

  // Die Bauzeit summiert sich, sie teilt sich nicht: Jeder Abschnitt hat seine
  // eigene Kette mit seinen eigenen Kräften, und die Ketten arbeiten
  // gleichzeitig. Was zählt, ist deshalb der **längste** Abschnitt — er
  // bestimmt, wann der Damm steht.
  const bauzeit = Math.max(0, ...abschnitte.map((a) => a.bedarf.bauzeit));
  const paletten = Math.ceil(saecke / SAECKE_JE_PALETTE);

  return {
    abschnitte,
    laenge: sum((a) => a.laenge),
    saecke,
    saeckeBestellen: sum((a) => a.bedarf.saeckeBestellen),
    sandVolumen,
    sandMasse,
    paletten,
    lkwFuhrenSaecke:
      lkwNutzlast > 0
        ? Math.ceil((paletten * PALETTE_MASSE_T) / lkwNutzlast)
        : 0,
    lkwFuhrenSand: lkwNutzlast > 0 ? Math.ceil(sandMasse / lkwNutzlast) : 0,
    folieFlaeche: sum((a) => a.bedarf.folieFlaeche),
    personal,
    bauzeit,
    warnings: [
      ...new Set(abschnitte.flatMap((a) => a.bedarf.warnings)),
    ] as DammWarning[],
  };
}
