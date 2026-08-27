import { describe, expect, it, vi } from 'vitest';
import { formatLatencySummary, startLatencyRun, tokenDetail } from './latency';

/** Uhr, die nur bei explizitem Vorrücken tickt — sonst wären die Tests flaky. */
function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('startLatencyRun', () => {
  it('misst eine asynchrone Phase und gibt das Ergebnis durch', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    const result = await run.phase('modell', async () => {
      clock.advance(120);
      return 'antwort';
    });

    expect(result).toBe('antwort');
    const summary = run.finish();
    expect(summary.phases).toEqual([
      expect.objectContaining({ name: 'modell', durationMs: 120, atMs: 0 }),
    ]);
  });

  it('misst eine Phase auch, wenn sie mit einem Fehler endet', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    await expect(
      run.phase('modell', async () => {
        clock.advance(50);
        throw new Error('kaputt');
      })
    ).rejects.toThrow('kaputt');

    const summary = run.finish();
    expect(summary.phases).toEqual([
      expect.objectContaining({ name: 'modell', durationMs: 50, failed: true }),
    ]);
  });

  it('hält Zusatzangaben zur Phase und zum Lauf fest', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    await run.phase('modell', async () => clock.advance(10), {
      promptTokens: 5000,
    });
    run.note({ items: 42 });

    const summary = run.finish();
    expect(summary.phases[0].detail).toEqual({ promptTokens: 5000 });
    expect(summary.detail).toEqual({ items: 42 });
  });

  it('misst synchrone Abschnitte', () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    const value = run.sync('kontext', () => {
      clock.advance(7);
      return 'json';
    });

    expect(value).toBe('json');
    expect(run.finish().phases[0]).toMatchObject({ name: 'kontext', durationMs: 7 });
  });

  it('hält mit mark die Lücke seit dem letzten Ereignis fest', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    await run.phase('modell', async () => clock.advance(100));
    clock.advance(30);
    run.mark('antwort angezeigt');

    const summary = run.finish();
    expect(summary.phases[1]).toMatchObject({
      name: 'antwort angezeigt',
      durationMs: 30,
      atMs: 100,
    });
  });

  it('weist nicht gemessene Zeit als Rest aus', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    await run.phase('modell', async () => clock.advance(100));
    clock.advance(25);

    const summary = run.finish();
    expect(summary.totalMs).toBe(125);
    expect(summary.unaccountedMs).toBe(25);
  });

  it('ergänzt Angaben, die erst nach der Phase bekannt sind', async () => {
    const clock = fakeClock();
    const run = startLatencyRun('test', { now: clock.now, log: vi.fn() });

    await run.phase('modell', async () => clock.advance(10), { iteration: 1 });
    run.annotateLast({ thoughtsTokens: 500 });

    expect(run.finish().phases[0].detail).toEqual({ iteration: 1, thoughtsTokens: 500 });
  });

  it('ignoriert annotateLast ohne vorangegangene Phase', () => {
    const run = startLatencyRun('test', { now: fakeClock().now, log: vi.fn() });
    expect(() => run.annotateLast({ a: 1 })).not.toThrow();
    expect(run.finish().phases).toEqual([]);
  });

  it('protokolliert beim Abschluss genau einmal', async () => {
    const clock = fakeClock();
    const log = vi.fn();
    const run = startLatencyRun('sprachbefehl', { now: clock.now, log });

    await run.phase('modell', async () => clock.advance(100));
    const first = run.finish();
    const second = run.finish();

    expect(log).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});

describe('formatLatencySummary', () => {
  it('schreibt Gesamtzeit, Phasen und Rest in eine kopierbare Übersicht', () => {
    const text = formatLatencySummary({
      label: 'sprachbefehl',
      totalMs: 4200,
      unaccountedMs: 200,
      phases: [
        { name: 'aufnahme', atMs: 0, durationMs: 150 },
        {
          name: 'transkription',
          atMs: 150,
          durationMs: 1450,
          detail: { promptTokens: 1200, thoughtsTokens: 300 },
        },
        { name: 'modell #1', atMs: 1600, durationMs: 2400, failed: true },
      ],
      detail: { audioBytes: 48000 },
    });

    expect(text).toContain('sprachbefehl');
    expect(text).toContain('4200 ms');
    expect(text).toContain('transkription');
    expect(text).toContain('1450 ms');
    expect(text).toContain('35%');
    expect(text).toContain('promptTokens=1200');
    expect(text).toContain('audioBytes=48000');
    expect(text).toContain('Rest');
    expect(text).toContain('FEHLER');
  });
});

describe('tokenDetail', () => {
  it('übersetzt die Nutzungsdaten des Modells in Messangaben', () => {
    expect(
      tokenDetail({
        promptTokenCount: 5800,
        candidatesTokenCount: 42,
        thoughtsTokenCount: 310,
        totalTokenCount: 6152,
        cachedContentTokenCount: 4096,
      })
    ).toEqual({
      promptTokens: 5800,
      antwortTokens: 42,
      thoughtsTokens: 310,
      gesamtTokens: 6152,
      cacheTokens: 4096,
    });
  });

  it('kommt ohne Nutzungsdaten aus', () => {
    expect(tokenDetail(undefined)).toEqual({});
  });
});
