import {
  normalizeGroesse,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungBestand,
  type BekleidungStueck,
} from './bekleidung';

export interface LagerstandRow {
  artikelId: string;
  groesse: string;
  imLager: number;
  ausgegeben: number;
}

const collator = new Intl.Collator('de', { numeric: true });

/**
 * Lagerstand je Artikel und Größe.
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
  const rowFor = (artikelId: string, groesse: string): LagerstandRow => {
    const normalized = normalizeGroesse(groesse);
    const key = `${artikelId}\u0000${normalized}`;
    let row = rows.get(key);
    if (!row) {
      row = { artikelId, groesse: normalized, imLager: 0, ausgegeben: 0 };
      rows.set(key, row);
    }
    return row;
  };

  for (const stueck of stuecke) {
    if (stueck.eigentum !== 'feuerwehr') continue;
    if (stueck.status === 'lager') rowFor(stueck.artikelId, stueck.groesse).imLager += 1;
    else if (stueck.status === 'ausgegeben')
      rowFor(stueck.artikelId, stueck.groesse).ausgegeben += 1;
  }
  for (const b of bestand) {
    rowFor(b.artikelId, b.groesse).imLager += b.anzahl;
  }
  for (const a of ausgaben) {
    if (a.zurueckAm || a.stueckId || a.eigentum === 'privat') continue;
    rowFor(a.artikelId, a.groesse).ausgegeben += a.menge;
  }

  const label = (artikelId: string) => byId.get(artikelId)?.bezeichnung ?? artikelId;
  return [...rows.values()].sort(
    (x, y) =>
      collator.compare(label(x.artikelId), label(y.artikelId)) ||
      collator.compare(x.artikelId, y.artikelId) ||
      collator.compare(x.groesse, y.groesse),
  );
}
