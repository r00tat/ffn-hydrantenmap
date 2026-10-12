import {
  chargeKey,
  normalizeCharge,
  normalizeGroesse,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungBestand,
  type BekleidungStueck,
} from './bekleidung';

export interface LagerstandCharge {
  /** Fehlt bei Bestand ohne Charge. */
  charge?: string;
  imLager: number;
  ausgegeben: number;
}

export interface LagerstandRow {
  artikelId: string;
  groesse: string;
  imLager: number;
  ausgegeben: number;
  /** Aufteilung nach Charge, nur wenn in der Zeile eine Charge vorkommt. */
  chargen?: LagerstandCharge[];
}

const collator = new Intl.Collator('de', { numeric: true });

/**
 * Lagerstand je Artikel und Größe, sobald Chargen vorkommen auch je Charge.
 *
 * Einzelstücke zählen nur, wenn sie der Feuerwehr gehören — private Stücke
 * („Eigen") sind nicht Teil des Lagers. Bei Mengenartikeln steht der Bestand
 * im Bestandsdokument, ausgegeben ist die Summe der offenen Mengen-Ausgaben
 * der Feuerwehr — private Mengen-Ausgaben aus dem Import zählen nicht.
 */
export function computeLagerstand(
  artikel: BekleidungArtikel[],
  stuecke: BekleidungStueck[],
  bestand: BekleidungBestand[],
  ausgaben: BekleidungAusgabe[],
): LagerstandRow[] {
  const byId = new Map(artikel.map((a) => [a.id, a]));
  const rows = new Map<string, LagerstandRow>();
  const chargen = new Map<string, Map<string, LagerstandCharge>>();
  const count = (
    artikelId: string,
    groesse: string,
    charge: string | undefined,
    field: 'imLager' | 'ausgegeben',
    n: number,
  ) => {
    const normalized = normalizeGroesse(groesse);
    const key = `${artikelId}\u0000${normalized}`;
    let row = rows.get(key);
    if (!row) {
      row = { artikelId, groesse: normalized, imLager: 0, ausgegeben: 0 };
      rows.set(key, row);
      chargen.set(key, new Map());
    }
    row[field] += n;
    const byCharge = chargen.get(key)!;
    const ck = chargeKey(charge);
    let entry = byCharge.get(ck);
    if (!entry) {
      const label = normalizeCharge(charge);
      entry = { ...(label ? { charge: label } : {}), imLager: 0, ausgegeben: 0 };
      byCharge.set(ck, entry);
    }
    entry[field] += n;
  };

  for (const stueck of stuecke) {
    if (stueck.eigentum !== 'feuerwehr') continue;
    if (stueck.status === 'lager')
      count(stueck.artikelId, stueck.groesse, stueck.charge, 'imLager', 1);
    else if (stueck.status === 'ausgegeben')
      count(stueck.artikelId, stueck.groesse, stueck.charge, 'ausgegeben', 1);
  }
  for (const b of bestand) {
    count(b.artikelId, b.groesse, b.charge, 'imLager', b.anzahl);
  }
  for (const a of ausgaben) {
    if (a.zurueckAm || a.stueckId || a.eigentum === 'privat') continue;
    count(a.artikelId, a.groesse, a.charge, 'ausgegeben', a.menge);
  }

  for (const [key, row] of rows) {
    const byCharge = chargen.get(key)!;
    if ([...byCharge.keys()].every((k) => !k)) continue;
    // Ohne Charge zuletzt, sonst nach Name.
    row.chargen = [...byCharge.entries()]
      .sort(([a], [b]) => (!a ? 1 : !b ? -1 : collator.compare(a, b)))
      .map(([, entry]) => entry);
  }

  const label = (artikelId: string) => byId.get(artikelId)?.bezeichnung ?? artikelId;
  return [...rows.values()].sort(
    (x, y) =>
      collator.compare(label(x.artikelId), label(y.artikelId)) ||
      collator.compare(x.artikelId, y.artikelId) ||
      collator.compare(x.groesse, y.groesse),
  );
}
