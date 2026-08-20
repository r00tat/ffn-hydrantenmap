/**
 * Decide which Einsatzkarte-Einsatz belongs to the SYBOS Einsatz currently
 * open in the browser — and, more importantly, whether the one selected in
 * the panel is the wrong one.
 *
 * Transferring Mannschaft and Material writes into whichever SYBOS
 * Einsatzbericht the page shows, while the crew list comes from whichever
 * Einsatz the panel has selected. Those two are set independently, so a
 * selection left over from last week silently lands in today's report. The
 * scoring here is what lets the panel warn *before* the transfer.
 *
 * No single factor decides: dates can be off by minutes, titles are typed by
 * hand on both sides, and an Einsatzart is not always recorded. Each factor
 * contributes with a weight, and a factor that cannot be compared is left out
 * of the average rather than counted as a mismatch — the feature must not
 * produce a warning just because the Einsatzkarte carries no address.
 */

import { normalizeName } from './name-matching';
import type { SybosEinsatzContext } from './sybos-einsatz-context';

/** The subset of an Einsatz the panel's list carries (see background.ts). */
export interface FirecallCandidate {
  id: string;
  name?: string;
  date?: string;
  description?: string;
}

export type MatchFactorKey = 'date' | 'title' | 'einsatzart' | 'ort';

export interface MatchFactor {
  key: MatchFactorKey;
  /** German label for the panel, e.g. "Datum/Uhrzeit". */
  label: string;
  /** 0 (contradicts) … 1 (agrees). */
  score: number;
  weight: number;
  /** What was compared, ready to show: `SYBOS … · Einsatz …`. */
  detail: string;
}

export interface FirecallMatch {
  firecall: FirecallCandidate;
  /** Weighted average over the comparable factors, 0 … 1. */
  score: number;
  factors: MatchFactor[];
  /** Factors that actively contradict the match — the warning's reasons. */
  mismatches: MatchFactor[];
}

export type MatchVerdict =
  /** Nothing comparable — the panel behaves as it always did. */
  | 'unknown'
  /** The selection fits the SYBOS Einsatz. */
  | 'confirmed'
  /** Another Einsatz fits distinctly better — warn and offer the switch. */
  | 'switch'
  /** Nothing fits well enough to assign — hint, but do not warn. */
  | 'unclear'
  /** Plausible, but no clear statement either way. */
  | 'ok';

export interface FirecallMatchEvaluation {
  verdict: MatchVerdict;
  best: FirecallMatch | null;
  selected: FirecallMatch | null;
}

const WEIGHTS: Record<MatchFactorKey, number> = {
  date: 4,
  title: 2,
  einsatzart: 1.5,
  ort: 1,
};

const LABELS: Record<MatchFactorKey, string> = {
  date: 'Datum/Uhrzeit',
  title: 'Stichwort',
  einsatzart: 'Einsatzart',
  ort: 'Ort',
};

/** Below this a factor is reported as a reason in the warning. */
const MISMATCH_SCORE = 0.5;

/** From here the selection counts as confirmed. */
const CONFIRM_SCORE = 0.6;
/** A candidate must reach this before we suggest switching to it. */
const SUGGEST_SCORE = 0.5;
/** …and must beat the current selection by this much. */
const SWITCH_MARGIN = 0.2;
/** Below this nothing is assignable — hint instead of warning. */
const POOR_SCORE = 0.35;

const MINUTE = 60_000;

/** Words that carry no signal in either an Einsatz name or a Stichwort. */
const STOPWORDS = new Set([
  'einsatz',
  'einsatze',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'und',
  'oder',
  'in',
  'im',
  'am',
  'an',
  'auf',
  'bei',
  'von',
  'vom',
  'zu',
  'zum',
  'zur',
  'mit',
  'fur',
  'ff',
  'fw',
  'feuerwehr',
  'uhr',
]);

function normalizeText(text: string): string {
  return normalizeName(text.replace(/ß/g, 'ss'));
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
  );
}

/**
 * How much of `needle` shows up in `haystack`, blending coverage (all of the
 * SYBOS words appear in the Einsatz) with Dice similarity (both sides talk
 * about the same thing). Coverage alone would rate a one-word Stichwort as a
 * perfect match against any long name that happens to contain it.
 */
function textSimilarity(needle: string, haystack: string): number {
  const a = tokenize(needle);
  const b = tokenize(haystack);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const coverage = intersection / a.size;
  const dice = (2 * intersection) / (a.size + b.size);
  return (coverage + dice) / 2;
}

type EinsatzKategorie =
  | 'brand'
  | 'technisch'
  | 'schadstoff'
  | 'uebung'
  | 'bsw'
  | 'fehlalarm';

const KATEGORIE_LABELS: Record<EinsatzKategorie, string> = {
  brand: 'Brand',
  technisch: 'Technisch',
  schadstoff: 'Schadstoff',
  uebung: 'Übung',
  bsw: 'Brandsicherheitswache',
  fehlalarm: 'Fehlalarm',
};

/**
 * Keyword table, most specific first. Spelled-out words beat the single-letter
 * codes (`B1`, `T2`, `S1`), so a "T1 Ölspur" is read as Schadstoff on both
 * sides instead of drifting apart depending on which half we look at.
 */
const KATEGORIE_PATTERNS: [EinsatzKategorie, RegExp][] = [
  ['bsw', /sicherheitswache|\bbsw\b/],
  ['uebung', /ubung|schulung|\bu\d\b/],
  ['fehlalarm', /fehlalarm|blindalarm|tauschungsalarm/],
  ['schadstoff', /schadstoff|gefahrgut|olspur|olaustritt|olunfall|chemie/],
  ['brand', /brand|feuer|kamin|rauchentwicklung/],
  [
    'technisch',
    /technisch|hilfeleistung|verkehrsunfall|bergung|turoffnung|menschenrettung|sturm|unwetter|pumparbeit|wasser|baum|tier/,
  ],
  ['brand', /\bb\d\b/],
  ['schadstoff', /\bs\d\b/],
  ['technisch', /\bt\d\b/],
];

function einsatzKategorie(text: string | null | undefined): EinsatzKategorie | null {
  if (!text) return null;
  const normalized = normalizeText(text);
  for (const [kategorie, pattern] of KATEGORIE_PATTERNS) {
    if (pattern.test(normalized)) return kategorie;
  }
  return null;
}

function formatDateTime(date: Date, dateOnly = false): string {
  return dateOnly
    ? date.toLocaleDateString('de-AT')
    : date.toLocaleString('de-AT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Closeness in time — the strongest signal, because both sides record the
 * same alarm. SYBOS pages that only show a date are compared by calendar day.
 */
function dateScore(ctx: SybosEinsatzContext, alarm: Date): number {
  const start = ctx.start!;
  if (ctx.dateOnly) {
    if (isSameDay(start, alarm)) return 1;
    const days = Math.abs(start.getTime() - alarm.getTime()) / (24 * 60 * MINUTE);
    return days <= 1 ? 0.3 : 0;
  }

  const minutes = Math.abs(start.getTime() - alarm.getTime()) / MINUTE;
  if (minutes <= 90) return 1;
  if (minutes <= 360) return 0.7;
  if (isSameDay(start, alarm)) return 0.5;
  if (minutes <= 36 * 60) return 0.15;
  return 0;
}

function parseAlarm(date: string | undefined): Date | null {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firecallText(firecall: FirecallCandidate): string {
  return [firecall.name, firecall.description].filter(Boolean).join(' ');
}

/**
 * Score one Einsatz against the SYBOS page. Returns `null` when not a single
 * factor is comparable — such a candidate carries no information and is
 * dropped rather than ranked at zero.
 */
export function scoreFirecall(
  ctx: SybosEinsatzContext,
  firecall: FirecallCandidate
): FirecallMatch | null {
  const factors: MatchFactor[] = [];
  const text = firecallText(firecall);

  const alarm = parseAlarm(firecall.date);
  if (ctx.start && alarm) {
    factors.push({
      key: 'date',
      label: LABELS.date,
      score: dateScore(ctx, alarm),
      weight: WEIGHTS.date,
      detail: `SYBOS ${formatDateTime(ctx.start, ctx.dateOnly)} · Einsatz ${formatDateTime(alarm)}`,
    });
  }

  if (ctx.title && text) {
    factors.push({
      key: 'title',
      label: LABELS.title,
      score: textSimilarity(ctx.title, text),
      weight: WEIGHTS.title,
      detail: `SYBOS „${ctx.title}“ · Einsatz „${firecall.name || '–'}“`,
    });
  }

  const sybosKategorie = einsatzKategorie(ctx.einsatzart);
  const firecallKategorie = einsatzKategorie(text);
  if (sybosKategorie && firecallKategorie) {
    factors.push({
      key: 'einsatzart',
      label: LABELS.einsatzart,
      score: sybosKategorie === firecallKategorie ? 1 : 0,
      weight: WEIGHTS.einsatzart,
      detail: `SYBOS ${KATEGORIE_LABELS[sybosKategorie]} · Einsatz ${KATEGORIE_LABELS[firecallKategorie]}`,
    });
  }

  // An Einsatz commonly carries no address, so a missing one says nothing
  // about the match — only a matching address is evidence, and it counts only
  // then. Scoring it as zero would drag every candidate below the thresholds.
  if (ctx.ort && text) {
    const score = textSimilarity(ctx.ort, text);
    if (score > 0) {
      factors.push({
        key: 'ort',
        label: LABELS.ort,
        score,
        weight: WEIGHTS.ort,
        detail: `SYBOS „${ctx.ort}“ · Einsatz „${firecall.name || '–'}“`,
      });
    }
  }

  if (factors.length === 0) return null;

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score =
    factors.reduce((sum, f) => sum + f.weight * f.score, 0) / totalWeight;

  return {
    firecall,
    score,
    factors,
    mismatches: factors.filter((f) => f.score < MISMATCH_SCORE),
  };
}

/** Score every candidate and sort best first; unscorable ones are dropped. */
export function rankFirecalls(
  ctx: SybosEinsatzContext,
  firecalls: FirecallCandidate[]
): FirecallMatch[] {
  return firecalls
    .map((firecall) => scoreFirecall(ctx, firecall))
    .filter((match): match is FirecallMatch => match !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Judge the current selection against the open SYBOS Einsatz.
 *
 * A `null` context (SYBOS page without readable Einsatz data) yields
 * `unknown`, and so does a list nothing can be scored from — in both cases
 * the panel stays exactly as it was.
 */
export function evaluateFirecallSelection(
  ctx: SybosEinsatzContext | null,
  firecalls: FirecallCandidate[],
  selectedId: string | null
): FirecallMatchEvaluation {
  if (!ctx) return { verdict: 'unknown', best: null, selected: null };

  const ranked = rankFirecalls(ctx, firecalls);
  const best = ranked[0] ?? null;
  if (!best) return { verdict: 'unknown', best: null, selected: null };

  const selected =
    ranked.find((match) => match.firecall.id === selectedId) ?? null;

  if (!selected) {
    return {
      verdict: best.score >= SUGGEST_SCORE ? 'switch' : 'unclear',
      best,
      selected: null,
    };
  }

  if (
    best.firecall.id !== selected.firecall.id &&
    best.score >= SUGGEST_SCORE &&
    best.score - selected.score >= SWITCH_MARGIN
  ) {
    return { verdict: 'switch', best, selected };
  }

  if (selected.score >= CONFIRM_SCORE) {
    return { verdict: 'confirmed', best, selected };
  }

  return {
    verdict: selected.score < POOR_SCORE ? 'unclear' : 'ok',
    best,
    selected,
  };
}
