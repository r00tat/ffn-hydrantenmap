import type { RisikoObjekt } from '../gis-objects';

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss');
}

/**
 * Risikoobjekte nach Ortschaft und Name sortiert, gefiltert auf Objekte, die
 * jedes Wort des Suchbegriffs in Name, Adresse, Ortschaft, Risikogruppe oder
 * Einsatzplannummer enthalten. Die Nummer liegt im Import teils als Zahl vor.
 */
export function filterRisikoObjekte(objekte: RisikoObjekt[], term: string): RisikoObjekt[] {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  return objekte
    .filter((o) => {
      if (words.length === 0) return true;
      const haystack = normalize(
        [o.name, o.adresse, o.ortschaft, o.risikogruppe, o.einsatzplanummer].join(' '),
      );
      return words.every((w) => haystack.includes(w));
    })
    .sort(
      (a, b) =>
        (a.ortschaft ?? '').localeCompare(b.ortschaft ?? '', 'de') ||
        (a.name ?? '').localeCompare(b.name ?? '', 'de'),
    );
}
