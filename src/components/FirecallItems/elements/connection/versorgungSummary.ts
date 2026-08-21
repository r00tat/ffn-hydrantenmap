'use client';

import type { Connection } from '../../../firebase/firestore';
import { foerderungSummary, foerderungView } from './foerderung/foerderung';
import { versorgungsart } from './pendel/pendelRoute';
import { pendelSummary, pendelView } from './pendel/pendelverkehr';
import { versorgungVergleich } from './pendel/versorgungVergleich';

/**
 * Die Zeile für Kartenpopup und Elementliste — je nachdem, welche Variante der
 * Rechner an dieser Leitung zeigt.
 *
 * Im Vergleich steht die Empfehlung und nicht beide Mengen: Die getroffene
 * Entscheidung ist, was ein Blick auf die Karte beantworten soll.
 */
export function versorgungSummary(item: Connection): string | undefined {
  switch (versorgungsart(item)) {
    case 'pendel':
      return pendelSummary(item);
    case 'vergleich': {
      const vergleich = versorgungVergleich(
        foerderungView(item),
        pendelView(item),
        {
          verlegeleistung: item.verlegeleistung,
          pumpenRuestzeit: item.pumpenRuestzeit,
        }
      );
      switch (vergleich.empfehlung) {
        case 'pendel':
          return 'Vergleich: Pendelverkehr trägt';
        case 'foerderung':
          return 'Vergleich: Förderung trägt';
        case 'keine':
          return `Vergleich: keine Variante trägt ${vergleich.sollMenge} l/min`;
        default:
          return undefined;
      }
    }
    default:
      return foerderungSummary(item);
  }
}
