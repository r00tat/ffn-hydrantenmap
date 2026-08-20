import { describe, it, expect } from 'vitest';
import {
  evaluateFirecallSelection,
  rankFirecalls,
  scoreFirecall,
  type FirecallCandidate,
} from './firecall-matching';
import type { SybosEinsatzContext } from './sybos-einsatz-context';

function ctx(over: Partial<SybosEinsatzContext> = {}): SybosEinsatzContext {
  return {
    einsatzId: '98765',
    start: new Date(2026, 4, 2, 10, 15),
    dateOnly: false,
    title: 'B1 Kaminbrand',
    einsatzart: 'Brandeinsatz',
    ort: 'Hauptstraße 12',
    ...over,
  };
}

const kaminbrand: FirecallCandidate = {
  id: 'a',
  name: 'B1 Kaminbrand Hauptstraße 12',
  date: new Date(2026, 4, 2, 10, 12).toISOString(),
};

const oelspur: FirecallCandidate = {
  id: 'b',
  name: 'T1 Ölspur Seestraße',
  date: new Date(2026, 3, 24, 8, 0).toISOString(),
};

describe('scoreFirecall', () => {
  it('scores a firecall alarmed minutes before the SYBOS beginning high', () => {
    const match = scoreFirecall(ctx(), kaminbrand)!;
    expect(match.score).toBeGreaterThan(0.8);
    expect(match.mismatches).toHaveLength(0);
  });

  it('scores last week’s firecall low and names date and title as mismatches', () => {
    const match = scoreFirecall(ctx(), oelspur)!;
    expect(match.score).toBeLessThan(0.35);
    expect(match.mismatches.map((f) => f.key)).toContain('date');
    expect(match.mismatches.map((f) => f.key)).toContain('title');
  });

  it('returns null when nothing is comparable', () => {
    const match = scoreFirecall(ctx({ start: null, title: null, einsatzart: null, ort: null }), {
      id: 'a',
      name: 'Brand',
    });
    expect(match).toBeNull();
  });

  it('counts a differing Einsatzart as a mismatch', () => {
    const match = scoreFirecall(
      ctx({ title: null, ort: null }),
      { id: 'c', name: 'Technische Hilfeleistung', date: kaminbrand.date },
    )!;
    const art = match.factors.find((f) => f.key === 'einsatzart')!;
    expect(art.score).toBe(0);
  });

  it('ignores the Einsatzart when the firecall carries no recognizable one', () => {
    const match = scoreFirecall(ctx({ title: null, ort: null }), {
      id: 'c',
      name: 'Einsatz Müller',
      date: kaminbrand.date,
    })!;
    expect(match.factors.some((f) => f.key === 'einsatzart')).toBe(false);
  });

  it('ignores a missing address instead of holding it against the firecall', () => {
    const withAddress = scoreFirecall(ctx(), kaminbrand)!;
    const withoutAddress = scoreFirecall(ctx(), {
      ...kaminbrand,
      name: 'B1 Kaminbrand',
    })!;
    expect(withoutAddress.factors.some((f) => f.key === 'ort')).toBe(false);
    expect(withoutAddress.score).toBeGreaterThan(0.8);
    expect(withAddress.factors.some((f) => f.key === 'ort')).toBe(true);
  });

  it('matches the same day when SYBOS only gave a date', () => {
    const match = scoreFirecall(
      ctx({ start: new Date(2026, 4, 2, 0, 0), dateOnly: true }),
      kaminbrand,
    )!;
    const date = match.factors.find((f) => f.key === 'date')!;
    expect(date.score).toBe(1);
  });

  it('takes the description into account', () => {
    const match = scoreFirecall(ctx({ title: 'Kaminbrand', ort: null, einsatzart: null }), {
      id: 'd',
      name: 'Einsatz 12/2026',
      description: 'Kaminbrand in der Hauptstraße',
      date: kaminbrand.date,
    })!;
    expect(match.factors.find((f) => f.key === 'title')!.score).toBeGreaterThan(0);
  });
});

describe('rankFirecalls', () => {
  it('puts the best candidate first', () => {
    const ranked = rankFirecalls(ctx(), [oelspur, kaminbrand]);
    expect(ranked[0]!.firecall.id).toBe('a');
    expect(ranked).toHaveLength(2);
  });

  it('drops candidates that cannot be scored at all', () => {
    const ranked = rankFirecalls(ctx({ title: null, einsatzart: null, ort: null }), [
      kaminbrand,
      { id: 'x', name: 'Ohne Datum' },
    ]);
    expect(ranked.map((m) => m.firecall.id)).toEqual(['a']);
  });
});

describe('evaluateFirecallSelection', () => {
  const list = [kaminbrand, oelspur];

  it('confirms the selection when it is the best match', () => {
    const result = evaluateFirecallSelection(ctx(), list, 'a');
    expect(result.verdict).toBe('confirmed');
    expect(result.best!.firecall.id).toBe('a');
    expect(result.selected!.firecall.id).toBe('a');
  });

  it('warns and suggests the better firecall when a stale one is selected', () => {
    const result = evaluateFirecallSelection(ctx(), list, 'b');
    expect(result.verdict).toBe('switch');
    expect(result.best!.firecall.id).toBe('a');
    expect(result.selected!.firecall.id).toBe('b');
    expect(result.selected!.mismatches.length).toBeGreaterThan(0);
  });

  it('suggests a match when nothing is selected yet', () => {
    const result = evaluateFirecallSelection(ctx(), list, null);
    expect(result.verdict).toBe('switch');
    expect(result.best!.firecall.id).toBe('a');
    expect(result.selected).toBeNull();
  });

  it('reports an unclear assignment when no candidate fits', () => {
    const result = evaluateFirecallSelection(ctx(), [oelspur], 'b');
    expect(result.verdict).toBe('unclear');
  });

  it('stays silent without a usable SYBOS context', () => {
    const result = evaluateFirecallSelection(null, list, 'a');
    expect(result.verdict).toBe('unknown');
  });

  it('stays silent when the list is empty', () => {
    const result = evaluateFirecallSelection(ctx(), [], 'a');
    expect(result.verdict).toBe('unknown');
  });

  it('does not warn when the selection is plausible but not a clear winner', () => {
    const almost: FirecallCandidate = {
      id: 'c',
      name: 'B1 Kaminbrand Hauptstraße 12',
      date: new Date(2026, 4, 2, 10, 40).toISOString(),
    };
    const result = evaluateFirecallSelection(ctx(), [kaminbrand, almost], 'c');
    expect(result.verdict).toBe('confirmed');
  });
});
