/**
 * Filter der Lagerseite — rein, ohne React, damit er sich ohne Rendern
 * prüfen lässt. Läuft im Speicher über die abonnierten Artikel (siehe
 * `useGeraete`).
 */

import {
  formatLagerort,
  isBelowMinimum,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';

export interface GeraeteFilter {
  /** Freitext; jedes Wort muss in einem der Suchfelder vorkommen. */
  search: string;
  /** Leer = alle Klassen. */
  klasse1: string;
  /** Leer = alle Lagerorte. */
  lagerortKey: string;
  onlyConsumable: boolean;
  onlyBelowMinimum: boolean;
  showInactive: boolean;
}

export const DEFAULT_GERAETE_FILTER: GeraeteFilter = {
  search: '',
  klasse1: '',
  lagerortKey: '',
  onlyConsumable: false,
  onlyBelowMinimum: false,
  showInactive: false,
};

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Der Text, in dem die Suche einen Artikel findet. */
function searchText(g: Geraet): string {
  return [
    g.bezeichnung,
    g.inventarNr,
    g.zusatzInventarNr,
    g.seriennummer,
    g.externeId,
    g.hersteller,
    g.herstellerTyp,
    ...(g.barcodes ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterGeraete(
  geraete: Geraet[],
  bestaendeByGeraet: Map<string, GeraetBestand[]>,
  filter: GeraeteFilter,
): Geraet[] {
  const words = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return geraete.filter((g) => {
    if (!filter.showInactive && !g.active) return false;
    if (filter.klasse1 && g.klasse1 !== filter.klasse1) return false;
    if (filter.onlyConsumable && !g.verbrauchsmaterial) return false;
    if (filter.onlyBelowMinimum && !isBelowMinimum(g)) return false;
    if (
      filter.lagerortKey &&
      !(bestaendeByGeraet.get(g.id) ?? []).some(
        (b) => b.lagerortKey === filter.lagerortKey,
      )
    ) {
      return false;
    }
    if (words.length > 0) {
      const text = searchText(g);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

/** Die vorhandenen Werte von „Klasse 1", sortiert. */
export function klasse1Options(geraete: Geraet[]): string[] {
  const values = new Set<string>();
  for (const g of geraete) {
    if (g.klasse1?.trim()) values.add(g.klasse1);
  }
  return [...values].sort(collator.compare);
}

/** Die vorhandenen Lagerorte, je `lagerortKey` einmal, nach Anzeige sortiert. */
export function lagerortOptions(
  bestaende: GeraetBestand[],
): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const b of bestaende) {
    if (!byKey.has(b.lagerortKey)) {
      byKey.set(b.lagerortKey, formatLagerort(b.lagerort) || b.lagerortKey);
    }
  }
  return [...byKey.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

/**
 * „Nachzubestellen": aktive Artikel mit gesetztem `nachbestellenSeit` — und
 * zur Sicherheit auch die, die rechnerisch unter dem Mindestbestand liegen,
 * ohne dass die Marke schon gesetzt ist (etwa nach dem Anheben des
 * Mindestbestands). Älteste Meldung zuerst, danach nach Bezeichnung.
 */
export function reorderList(geraete: Geraet[]): Geraet[] {
  return geraete
    .filter((g) => g.active && (!!g.nachbestellenSeit || isBelowMinimum(g)))
    .sort((a, b) => {
      const sa = a.nachbestellenSeit ?? '￿';
      const sb = b.nachbestellenSeit ?? '￿';
      if (sa !== sb) return sa < sb ? -1 : 1;
      return collator.compare(a.bezeichnung, b.bezeichnung);
    });
}
