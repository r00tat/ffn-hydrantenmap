import { describe, expect, it } from 'vitest';
import {
  REPORT_MAX_DAYS,
  ReportPeriodError,
  type ReportPeriodErrorKey,
  type ReportPeriodRequest,
  resolveReportPeriod,
} from './weeklyReportPeriod';

/** Montag, 10.08.2026, 07:15 Ortszeit Wien (= 05:15 UTC). */
const MONDAY_KW33 = new Date('2026-08-10T05:15:00.000Z');

/**
 * Der Schlüssel eines Aufrufs, der scheitern muss — und unterwegs die Prüfung,
 * dass es überhaupt ein `ReportPeriodError` war.
 *
 * Geprüft wird der Schlüssel und nicht die Meldung: Der Schlüssel ist der
 * Vertrag, an dem der Aufrufer seine Antwort entscheidet, die Meldung ist
 * Prosa fürs Log und darf umformuliert werden, ohne Tests zu brechen.
 */
function rejectionKey(request: ReportPeriodRequest): ReportPeriodErrorKey {
  try {
    resolveReportPeriod(request);
  } catch (err) {
    expect(err).toBeInstanceOf(ReportPeriodError);
    return (err as ReportPeriodError).key;
  }
  throw new Error(
    `resolveReportPeriod(${JSON.stringify(request)}) hat nicht geworfen`,
  );
}

describe('resolveReportPeriod', () => {
  it('nimmt ohne Angabe die letzte abgeschlossene ISO-Woche', () => {
    const period = resolveReportPeriod(undefined, MONDAY_KW33);
    expect(period).toMatchObject({
      from: '2026-08-03',
      to: '2026-08-09',
      isoYear: 2026,
      week: 32,
    });
  });

  it('nimmt auch mit leerem Objekt die Vorwoche', () => {
    expect(resolveReportPeriod({}, MONDAY_KW33).from).toBe('2026-08-03');
  });

  it('rechnet die Vorwoche über den Jahreswechsel in die Woche 53', () => {
    // Montag der KW1/2027 — davor liegt die KW53/2026, die es gibt, weil der
    // 01.01.2026 ein Donnerstag war.
    const period = resolveReportPeriod(
      undefined,
      new Date('2027-01-04T06:00:00.000Z'),
    );
    expect(period).toMatchObject({
      from: '2026-12-28',
      to: '2027-01-03',
      isoYear: 2026,
      week: 53,
    });
  });

  it('legt die Abfragegrenzen auf die Ortszeit Wien (Sommerzeit)', () => {
    const period = resolveReportPeriod({ year: 2026, week: 32 });
    expect(period.fromIso).toBe('2026-08-02T22:00:00.000Z');
    expect(period.toIso).toBe('2026-08-09T21:59:59.999Z');
  });

  it('legt die Abfragegrenzen auf die Ortszeit Wien (Winterzeit)', () => {
    const period = resolveReportPeriod({ year: 2026, week: 2 });
    expect(period.from).toBe('2026-01-05');
    expect(period.fromIso).toBe('2026-01-04T23:00:00.000Z');
  });

  it('nimmt eine ausdrücklich angegebene Woche', () => {
    expect(resolveReportPeriod({ year: 2026, week: 32 })).toMatchObject({
      from: '2026-08-03',
      to: '2026-08-09',
      week: 32,
    });
  });

  it('akzeptiert die Woche 53 in einem Jahr, das sie hat', () => {
    expect(resolveReportPeriod({ year: 2026, week: 53 }).from).toBe(
      '2026-12-28',
    );
  });

  it('lehnt die Woche 53 in einem Jahr ohne 53. Woche ab', () => {
    // 2025 hat 52 Wochen; ohne Prüfung wäre der „Montag der KW53" der
    // 29.12.2025 — der Montag der KW1/2026. Der Bericht trüge eine Woche,
    // die es nicht gibt, und deckte eine Woche des Folgejahres ab.
    expect(rejectionKey({ year: 2025, week: 53 })).toBe('invalidWeek');
  });

  it.each([
    [{ year: 2026, week: 0 }],
    [{ year: 2026, week: 54 }],
    [{ year: 1999, week: 5 }],
    [{ year: 2026 }],
    [{ week: 32 }],
    [{ year: 2026.5, week: 5 }],
  ])('lehnt unbrauchbare Wochenangaben ab: %o', (request) => {
    expect(rejectionKey(request)).toBe('invalidWeek');
  });

  it('nimmt einen freien Zeitraum und trägt dessen Kalenderwoche', () => {
    const period = resolveReportPeriod({
      from: '2026-08-03',
      to: '2026-08-16',
    });
    expect(period).toMatchObject({
      from: '2026-08-03',
      to: '2026-08-16',
      week: 32,
    });
  });

  it('lehnt einen unmöglichen Tag ab', () => {
    expect(rejectionKey({ from: '2026-02-30', to: '2026-03-02' })).toBe(
      'invalidDay',
    );
  });

  it('lehnt einen halben Zeitraum ab', () => {
    expect(rejectionKey({ from: '2026-08-03' })).toBe('invalidDay');
  });

  it('lehnt einen verdrehten Zeitraum ab', () => {
    expect(rejectionKey({ from: '2026-08-09', to: '2026-08-03' })).toBe(
      'periodReversed',
    );
  });

  it('lehnt einen zu langen Zeitraum ab', () => {
    expect(rejectionKey({ from: '2026-01-01', to: '2026-12-31' })).toBe(
      'periodTooLong',
    );
  });

  it('lässt genau die Höchstspanne zu', () => {
    // 92 Tage ab 01.01. ist der 02.04.2026.
    expect(REPORT_MAX_DAYS).toBe(92);
    expect(
      resolveReportPeriod({ from: '2026-01-01', to: '2026-04-02' }).to,
    ).toBe('2026-04-02');
  });

  it('lehnt gemischte Angaben ab', () => {
    expect(
      rejectionKey({
        year: 2026,
        week: 32,
        from: '2026-08-03',
        to: '2026-08-09',
      }),
    ).toBe('conflictingPeriod');
  });

  it('trennt den Schlüssel von einer lesbaren Meldung', () => {
    try {
      resolveReportPeriod({ from: '2026-08-09', to: '2026-08-03' });
      expect.unreachable('sollte werfen');
    } catch (err) {
      const error = err as ReportPeriodError;
      expect(error.key).toBe('periodReversed');
      expect(error.name).toBe('ReportPeriodError');
      // Wer nur `message` protokolliert, soll einen Satz sehen und nicht den
      // Schlüssel — sonst steht `periodReversed` in einer Cron-Logzeile.
      expect(error.message).toBe('Der letzte Tag liegt vor dem ersten');
      expect(error.message).not.toBe(error.key);
    }
  });

  it('nennt in der Meldung zum langen Zeitraum die Höchstspanne', () => {
    try {
      resolveReportPeriod({ from: '2026-01-01', to: '2026-12-31' });
      expect.unreachable('sollte werfen');
    } catch (err) {
      expect((err as ReportPeriodError).message).toBe(
        `Der Zeitraum überschreitet die Höchstspanne von ${REPORT_MAX_DAYS} Tagen`,
      );
    }
  });
});
