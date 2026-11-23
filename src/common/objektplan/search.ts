/**
 * Suche über alle Unterlagen eines Risikoobjekts: Melder aus dem Index und
 * Volltext aus dem gespeicherten Seitentext. Läuft im Client auf den
 * Firestore-Daten und damit auch offline.
 */
import {
  matchesMelderQuery,
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
  /** Alle passenden Melder dieser Seite — sie werden gemeinsam markiert. */
  entries: MelderEntry[];
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
    for (const d of dokumente) {
      const byPage = new Map<number, MelderEntry[]>();
      for (const entry of d.melder ?? []) {
        if (!matchesMelderQuery(entry, query)) continue;
        byPage.set(entry.seite, [...(byPage.get(entry.seite) ?? []), entry]);
      }
      for (const [seite, entries] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
        melder.push({ dokumentId: d.id, dokumentName: d.name, seite, entries });
      }
    }
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
