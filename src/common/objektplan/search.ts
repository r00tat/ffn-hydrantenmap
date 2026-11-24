/**
 * Suche über alle Unterlagen eines Risikoobjekts: Melder aus dem Index und
 * Volltext aus dem gespeicherten Seitentext. Läuft im Client auf den
 * Firestore-Daten und damit auch offline.
 */
import {
  melderMatchRank,
  parseMelderQuery,
  searchPageTexts,
  type MelderEntry,
  type MelderQuery,
} from './melderIndex';
import type { ObjektDokument } from './objektDokument';

export interface MelderResult {
  dokumentId: string;
  dokumentName: string;
  seite: number;
  /** Alle passenden Melder einer Gruppe auf dieser Seite — sie werden gemeinsam markiert. */
  entries: MelderEntry[];
  /** Güte des Treffers (`melderMatchRank`), 0 = Gruppe genau. */
  rank: number;
}

export interface TextResult {
  dokumentId: string;
  dokumentName: string;
  seite: number;
  count: number;
  snippet: string;
}

export interface ObjektSearchResult {
  query: MelderQuery | null;
  melder: MelderResult[];
  text: TextResult[];
}

export function searchObjektDokumente(
  dokumente: ObjektDokument[],
  term: string,
): ObjektSearchResult {
  const trimmed = term.trim();
  if (!trimmed) return { query: null, melder: [], text: [] };

  const query = parseMelderQuery(trimmed);
  const melder: MelderResult[] = [];
  if (query) {
    // Je Seite und Gruppe ein Treffer: „10" findet auch 310, und die soll
    // nicht mit 10 zusammen markiert werden. Genaue Treffer zuerst, sonst in
    // der Reihenfolge der Unterlagen und Seiten.
    const ordered: Array<MelderResult & { order: number }> = [];
    dokumente.forEach((d, dokIndex) => {
      const byPageGroup = new Map<string, MelderResult>();
      for (const entry of d.melder ?? []) {
        const rank = melderMatchRank(entry, query);
        if (rank === null) continue;
        const key = `${entry.seite}/${entry.gruppe}`;
        const hit = byPageGroup.get(key);
        if (hit) hit.entries.push(entry);
        else byPageGroup.set(key, { dokumentId: d.id, dokumentName: d.name, seite: entry.seite, entries: [entry], rank });
      }
      for (const hit of byPageGroup.values()) ordered.push({ ...hit, order: dokIndex });
    });
    ordered.sort(
      (a, b) =>
        a.rank - b.rank ||
        a.order - b.order ||
        a.seite - b.seite ||
        a.entries[0].gruppe - b.entries[0].gruppe,
    );
    for (const { order: _order, ...hit } of ordered) melder.push(hit);
  }

  // Ein vollständiger Melder („3/05") stünde im Text noch einmal — als
  // doppelter Treffer ohne Mehrwert. Eine bloße Zahl kann aber auch ein Raum sein.
  const text: TextResult[] = [];
  if (query?.melder === undefined) {
    for (const d of dokumente) {
      for (const hit of searchPageTexts(d.seitenText ?? [], trimmed)) {
        text.push({ dokumentId: d.id, dokumentName: d.name, ...hit });
      }
    }
  }

  return { query, melder, text };
}
