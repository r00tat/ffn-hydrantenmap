import {
  chargeKey,
  normalizeCharge,
  normalizeGroesse,
  type BekleidungAusgabe,
  type BekleidungStueck,
} from './bekleidung';

export interface ConversionPlan {
  /** Neuer Mengenbestand je Größe und Charge, aus den Lagerstücken der Feuerwehr. */
  bestand: { groesse: string; charge?: string; anzahl: number }[];
  /** Ausgaben mit Stückbezug: verlieren ihn, tragen Charge und Eigentum des Stücks. */
  ausgaben: { id: string; charge?: string; privat: boolean }[];
  /** Stücke, die keine Entsprechung als Menge haben und wegfallen. */
  dropped: { privat: number; ausgeschieden: number; ohnePerson: number };
  /** In der App erfasste Wäschen — die hingen am Stück und gingen verloren. */
  hasWaeschen: boolean;
}

const collator = new Intl.Collator('de', { numeric: true });

/**
 * Was aus den Stücken eines Einzelartikels wird, wenn er künftig als Menge
 * geführt wird. Für den Bestätigungsdialog und die Server Action dieselbe
 * Rechnung:
 *
 * - Lagerstück der Feuerwehr → +1 Bestand in Größe und Charge
 * - ausgegebenes Stück mit Ausgabe → die Ausgabe bleibt als Mengen-Ausgabe
 * - privates Lagerstück, ausgeschiedenes oder nicht auffindbares Stück und ein
 *   ausgegebenes ohne Ausgabe (Import ohne Person) → entfällt
 *
 * Auch geschlossene Ausgaben (Verlauf) verlieren den Stückbezug.
 */
export function planConversionToMenge(
  stuecke: BekleidungStueck[],
  ausgaben: BekleidungAusgabe[],
): ConversionPlan {
  const byId = new Map(stuecke.map((s) => [s.id, s]));
  const bestand = new Map<string, { groesse: string; charge?: string; anzahl: number }>();
  const dropped = { privat: 0, ausgeschieden: 0, ohnePerson: 0 };

  for (const s of stuecke) {
    if (s.status === 'lager') {
      if (s.eigentum === 'privat') {
        dropped.privat += 1;
        continue;
      }
      const groesse = normalizeGroesse(s.groesse);
      const charge = normalizeCharge(s.charge);
      const key = `${groesse}\u0000${chargeKey(charge)}`;
      const entry = bestand.get(key) ?? { groesse, ...(charge ? { charge } : {}), anzahl: 0 };
      entry.anzahl += 1;
      bestand.set(key, entry);
    } else if (s.status === 'ausgegeben') {
      if (!s.ausgabeId) dropped.ohnePerson += 1;
    } else {
      dropped.ausgeschieden += 1;
    }
  }

  const planAusgaben: ConversionPlan['ausgaben'] = [];
  for (const a of ausgaben) {
    if (!a.id || !a.stueckId) continue;
    const s = byId.get(a.stueckId);
    planAusgaben.push({
      id: a.id,
      charge: normalizeCharge(s?.charge),
      privat: s?.eigentum === 'privat',
    });
  }

  return {
    bestand: [...bestand.values()].sort(
      (x, y) =>
        collator.compare(x.groesse, y.groesse) ||
        (!x.charge ? -1 : !y.charge ? 1 : collator.compare(x.charge, y.charge)),
    ),
    ausgaben: planAusgaben,
    dropped,
    hasWaeschen: stuecke.some((s) => s.waschgaenge > 0),
  };
}
