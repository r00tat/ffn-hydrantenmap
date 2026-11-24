import type { RisikoObjekt, WgsObject } from '../gis-objects';

/**
 * Mögliche Risikoobjekte zu einem Einsatz — unscharf über Lage, Adresse und
 * Name. Weder die Koordinaten des Alarms noch die Schreibweise der Adressen
 * sind verlässlich („Wienerstraße" gegen „Wiener Straße", „Franz Liszgasse",
 * „Schrädingerstr"), deshalb zählt jedes Signal für sich und sie werden wie
 * unabhängige Hinweise verknüpft. Hintergrund: docs/objektplaene.md,
 * Abschnitt „Risikoobjekte zum Einsatz".
 */

export interface MatchPosition {
  lat: number;
  lng: number;
}

export interface MatchAddress {
  street: string;
  number?: string;
}

export interface RisikoObjektMatchQuery {
  /** Lage des Einsatzes und seiner Einsatzorte. */
  positions: MatchPosition[];
  /** Freitext: Name, Beschreibung bzw. Alarmtext, Namen der Einsatzorte. */
  texts: string[];
  /** Strukturierte Adressen, etwa aus den Einsatzorten. */
  addresses?: MatchAddress[];
  /**
   * Ortsnamen (Feuerwehr, Ort der Einsatzorte). Ihre Wörter zählen nicht als
   * Namenstreffer: „Neusiedl am See" steht in jedem Alarmtext und passte
   * sonst immer auf „BH Neusiedl am See".
   */
  placeNames?: string[];
}

export interface RisikoObjektMatch<T extends WgsObject = RisikoObjekt> {
  objekt: T;
  /** 0..1, höher ist wahrscheinlicher. */
  score: number;
  /** Kürzeste Entfernung zu einer der Positionen, wenn beide eine Lage haben. */
  distanceM?: number;
  /** `exact`: Straße und Hausnummer, `street`: nur die Straße. */
  address?: 'exact' | 'street';
  /** Der Objektname kommt im Text vor. */
  name: boolean;
}

export interface MatchOptions {
  limit?: number;
  minScore?: number;
}

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.4;

/** Bis hierher gilt die Lage als Treffer, danach fällt der Wert linear ab. */
const DISTANCE_FULL_M = 30;
/** Ab hier zählt die Lage nicht mehr. */
const DISTANCE_ZERO_M = 400;
const DISTANCE_WEIGHT = 0.85;

const STREET_THRESHOLD = 0.78;
const ADDRESS_EXACT_WEIGHT = 0.95;
/**
 * Nur die Straße. Geteilt durch die Wurzel der Zahl der Objekte in dieser
 * Straße: an der Wienerstraße liegen über ein Dutzend, dort sagt die Straße
 * allein wenig.
 */
const ADDRESS_STREET_WEIGHT = 0.55;
/** Andere Hausnummer in derselben Straße: Nachbarhaus, nur ein schwacher Hinweis. */
const ADDRESS_OTHER_NUMBER_WEIGHT = 0.3;

const NAME_WEIGHT = 0.9;
/** Unter diesem Anteil (nach Seltenheit gewichtet) zählt der Name nicht. */
const NAME_MIN_SHARE = 0.5;

/** Wörter, die in Objektnamen nichts unterscheiden. */
const NAME_STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'des', 'den', 'dem', 'von', 'vom', 'zum', 'zur',
  'ehemals', 'ehem', 'usw', 'bzw', 'gmbh', 'co', 'kg', 'ag', 'neu', 'alt',
  'am', 'im', 'an', 'in', 'bei', 'st', 'strasse', 'gasse', 'platz', 'weg',
]);

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Straßenname in kompakter Form: Umlaute ausgeschrieben, Abkürzungen
 * („Str.", „Pl.", „G.") ausgeschrieben, ohne Leerzeichen und Bindestriche.
 */
export function normalizeStreet(value: string): string {
  return fold(value)
    .replace(/str\b\.?/g, 'strasse')
    .replace(/\bpl\b\.?/g, 'platz')
    .replace(/\bg\.(?=\s|$)/g, 'gasse')
    .replace(/[^a-z0-9]/g, '');
}

const HOUSE_NUMBER = /^\d+[a-z]?(?:[/-]\d+[a-z]?)?$/i;

function normalizeNumber(value: string | undefined): string | undefined {
  const n = value?.toLowerCase().replace(/\s/g, '');
  return n ? n : undefined;
}

/** Adresse eines Objekts: Teil vor dem ersten Komma, Hausnummer am Ende. */
export function parseAddress(adresse: string | undefined): {
  street: string;
  number: string | undefined;
} {
  const head = String(adresse ?? '').split(',')[0].trim();
  const words = head.split(/\s+/).filter(Boolean);
  let number: string | undefined;
  if (words.length > 1 && HOUSE_NUMBER.test(words[words.length - 1])) {
    number = normalizeNumber(words.pop());
  }
  return { street: normalizeStreet(words.join(' ')), number };
}

function trigrams(value: string): Map<string, number> {
  const padded = `  ${value} `;
  const grams = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice-Koeffizient über Trigramme, 0..1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let common = 0;
  let total = 0;
  for (const [g, n] of ga) {
    common += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return (2 * common) / total;
}

/** Editierabstand mit Vertauschung benachbarter Zeichen (OSA). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Wie gut ein Wort des Textes ein Wort des Namens trifft. Kurze Wörter
 * („AMS", „AGM") nur exakt; längere mit Tippfehlern; ein langes Namenswort
 * auch als Teil eines zusammengesetzten Wortes, aber schwächer.
 */
function wordMatch(nameWord: string, textWord: string): number {
  if (nameWord === textWord) return 1;
  if (nameWord.length <= 4) return 0;
  const ratio = 1 - editDistance(nameWord, textWord) / Math.max(nameWord.length, textWord.length);
  if (ratio >= 0.8) return ratio;
  if (nameWord.length >= 6 && textWord.includes(nameWord)) return 0.85;
  return 0;
}

function words(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function nameWords(name: string | undefined): string[] {
  return [
    ...new Set(
      words(String(name ?? '')).filter((w) => w.length >= 2 && !NAME_STOPWORDS.has(w)),
    ),
  ];
}

interface StreetCandidate {
  street: string;
  /** Hausnummer direkt danach, sofern eine dasteht. */
  number?: string;
}

/**
 * Mögliche Straßen im Freitext: Fenster aus ein bis vier Wörtern innerhalb
 * eines Abschnitts. Abschnitte trennt `/` (Alarmtext), Komma, Strichpunkt
 * oder ein Zeilenumbruch. Die Hausnummer steht im Alarmtext im nächsten
 * Abschnitt, sonst direkt hinter der Straße.
 */
function streetCandidates(text: string): StreetCandidate[] {
  const segments = text
    .split(/[/,;\n]+/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean))
    .filter((s) => s.length > 0);
  const result: StreetCandidate[] = [];
  segments.forEach((segment, si) => {
    for (let start = 0; start < segment.length; start++) {
      for (let len = 1; len <= 4 && start + len <= segment.length; len++) {
        const windowWords = segment.slice(start, start + len);
        if (windowWords.some((w) => HOUSE_NUMBER.test(w))) break;
        const street = normalizeStreet(windowWords.join(' '));
        if (street.length < 4) continue;
        const after = segment[start + len];
        const nextSegment = segments[si + 1];
        const number =
          after !== undefined
            ? HOUSE_NUMBER.test(after)
              ? after
              : undefined
            : nextSegment && HOUSE_NUMBER.test(nextSegment[0])
              ? nextSegment[0]
              : undefined;
        result.push({ street, number: normalizeNumber(number) });
      }
    }
  });
  return result;
}

function leadingInt(n: string): number | undefined {
  const m = /^\d+/.exec(n);
  return m ? Number(m[0]) : undefined;
}

/**
 * Gleiche Hausnummer: genau gleich, gleiche Zahl („1" und „1a", „70/1") oder
 * im Bereich des Objekts („Pionierweg 1-3").
 */
export function sameHouseNumber(objekt: string, query: string): boolean {
  if (objekt === query) return true;
  const q = leadingInt(query);
  if (q === undefined) return false;
  const range = /^(\d+)[a-z]?-(\d+)[a-z]?$/.exec(objekt);
  if (range) return q >= Number(range[1]) && q <= Number(range[2]);
  return leadingInt(objekt) === q;
}

function addressScore(
  objekt: { street: string; number?: string },
  candidates: StreetCandidate[],
  objekteOnStreet: number,
): { score: number; kind?: 'exact' | 'street' } {
  if (objekt.street.length < 4) return { score: 0 };
  let best = { score: 0, kind: undefined as 'exact' | 'street' | undefined };
  for (const c of candidates) {
    const sim = similarity(objekt.street, c.street);
    if (sim < STREET_THRESHOLD) continue;
    let weight: number;
    let kind: 'exact' | 'street';
    if (objekt.number && c.number) {
      const same = sameHouseNumber(objekt.number, c.number);
      weight = same ? ADDRESS_EXACT_WEIGHT : ADDRESS_OTHER_NUMBER_WEIGHT;
      kind = same ? 'exact' : 'street';
    } else {
      weight = ADDRESS_STREET_WEIGHT / Math.sqrt(Math.max(1, objekteOnStreet));
      kind = 'street';
    }
    const score = weight * sim;
    if (score > best.score) best = { score, kind };
  }
  return best;
}

function hasPosition(o: { lat?: number; lng?: number }): o is MatchPosition {
  return (
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    !(o.lat === 0 && o.lng === 0)
  );
}

function distanceM(a: MatchPosition, b: MatchPosition): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceScore(d: number): number {
  if (d <= DISTANCE_FULL_M) return 1;
  return Math.max(0, 1 - (d - DISTANCE_FULL_M) / (DISTANCE_ZERO_M - DISTANCE_FULL_M));
}

export function matchRisikoObjekte<T extends WgsObject>(
  objekte: T[],
  query: RisikoObjektMatchQuery,
  options: MatchOptions = {},
): RisikoObjektMatch<T>[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const positions = query.positions.filter(hasPosition);
  const texts = query.texts.filter((t) => typeof t === 'string' && t.trim());

  const candidates: StreetCandidate[] = [
    ...texts.flatMap(streetCandidates),
    ...(query.addresses ?? [])
      .filter((a) => a.street?.trim())
      .map((a) => ({ street: normalizeStreet(a.street), number: normalizeNumber(a.number) })),
  ];
  const textWords = [...new Set(texts.flatMap(words).filter((w) => w.length >= 2))];
  const placeWords = new Set((query.placeNames ?? []).flatMap((p) => words(String(p ?? ''))));

  const objektAddresses = objekte.map((o) => parseAddress(o.adresse));
  const streetCount = new Map<string, number>();
  for (const a of objektAddresses) {
    if (a.street) streetCount.set(a.street, (streetCount.get(a.street) ?? 0) + 1);
  }

  // Seltenheit der Namenswörter über alle Objekte: „Autohaus" trägt weniger
  // als „Kamper".
  const objektNameWords = objekte.map((o) => nameWords(o.name));
  const df = new Map<string, number>();
  for (const ws of objektNameWords) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + objekte.length / (df.get(w) ?? 1));

  const matches: RisikoObjektMatch<T>[] = [];
  objekte.forEach((objekt, index) => {
    let distance: number | undefined;
    if (positions.length > 0 && hasPosition(objekt)) {
      distance = Math.min(...positions.map((p) => distanceM(p, objekt)));
    }
    const sDistance = distance === undefined ? 0 : DISTANCE_WEIGHT * distanceScore(distance);

    const objektAddress = objektAddresses[index];
    const address = addressScore(
      objektAddress,
      candidates,
      streetCount.get(objektAddress.street) ?? 1,
    );

    let sName = 0;
    const ws = objektNameWords[index].filter((w) => !placeWords.has(w));
    if (ws.length > 0 && textWords.length > 0) {
      let total = 0;
      let matched = 0;
      for (const w of ws) {
        const weight = idf(w);
        total += weight;
        let best = 0;
        for (const tw of textWords) best = Math.max(best, wordMatch(w, tw));
        matched += weight * best;
      }
      const share = total > 0 ? matched / total : 0;
      if (share >= NAME_MIN_SHARE) sName = NAME_WEIGHT * share;
    }

    const score = 1 - (1 - sDistance) * (1 - address.score) * (1 - sName);
    if (score < minScore) return;
    matches.push({
      objekt,
      score,
      ...(distance !== undefined ? { distanceM: Math.round(distance) } : {}),
      ...(address.kind ? { address: address.kind } : {}),
      name: sName > 0,
    });
  });

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
