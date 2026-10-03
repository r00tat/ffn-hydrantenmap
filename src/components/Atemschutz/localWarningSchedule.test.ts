import { describe, expect, it } from 'vitest';
import { PA_SAETZE, type AtemschutzTrupp } from '../../common/atemschutz';
import { hinweisId } from './ueberwachungHinweise';
import {
  earliestLocalWarning,
  nextLocalWarningFor,
  nextLocalWarnings,
} from './localWarningSchedule';

const ABMARSCH = '2026-09-02T10:00:00.000Z';
const opts = { vorgabe: PA_SAETZE.standard300 };

function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna', 'Bernd', 'Clara'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    createdAt: ABMARSCH,
    createdBy: 'u1',
    updatedAt: ABMARSCH,
    updatedBy: 'u1',
    ...over,
  };
}

describe('nextLocalWarningFor', () => {
  it('plant kurz nach dem Abmarsch das erste Drittel', () => {
    // Erwartete Dauer 25,8 min, das erste Drittel also bei 8,6 min.
    const plan = nextLocalWarningFor(trupp(), nachAbmarsch(1), opts);
    expect(plan?.key).toBe('drittel');
    expect(plan?.truppId).toBe('t1');
    expect(plan?.id).toBe(hinweisId('t1', 'drittel'));
    const minuten = ((plan?.at.getTime() ?? 0) - new Date(ABMARSCH).getTime()) / 60_000;
    expect(minuten).toBeCloseTo(8.6, 0);
  });

  it('überspringt, was dieses Gerät schon gezeigt hat', () => {
    const plan = nextLocalWarningFor(trupp(), nachAbmarsch(9), {
      ...opts,
      gemeldet: new Set([hinweisId('t1', 'drittel')]),
    });
    expect(plan?.key).toBe('zweiDrittel');
  });

  it('überspringt eine vergangene, aber durch eine Meldung erledigte Marke', () => {
    // Nach 9 min liegt das Drittel in der Vergangenheit; eine Druckabfrage
    // hat es erledigt. Ohne Überspringen käme der Zeitgeber sofort zurück.
    const plan = nextLocalWarningFor(
      trupp({
        abfragen: [{ zeitpunkt: nachAbmarsch(5).toISOString(), druck: 250 }],
      }),
      nachAbmarsch(9),
      opts,
    );
    expect(plan).toBeDefined();
    expect(plan!.at.getTime()).toBeGreaterThan(nachAbmarsch(9).getTime());
    expect(plan!.key).not.toBe('drittel');
  });

  it('beachtet die Buchführung des Servers', () => {
    const plan = nextLocalWarningFor(
      trupp({ warnungen: { drittel: nachAbmarsch(9).toISOString() } }),
      nachAbmarsch(1),
      opts,
    );
    expect(plan?.key).toBe('zweiDrittel');
  });

  it('plant für einen Trupp außerhalb des Einsatzes nichts', () => {
    expect(
      nextLocalWarningFor(trupp({ status: 'zurueck' }), nachAbmarsch(1), opts),
    ).toBeUndefined();
  });

  it('plant nichts mehr, wenn alles gezeigt ist', () => {
    const gemeldet = new Set(
      (['drittel', 'zweiDrittel', 'rueckzug'] as const).map((k) => hinweisId('t1', k)),
    );
    expect(nextLocalWarningFor(trupp(), nachAbmarsch(1), { ...opts, gemeldet })).toBeUndefined();
  });
});

describe('nextLocalWarnings / earliestLocalWarning', () => {
  it('liefert je Trupp einen Termin und daraus den frühesten', () => {
    const spaeter = trupp({
      id: 't2',
      abmarschZeit: nachAbmarsch(5).toISOString(),
    });
    const plans = nextLocalWarnings([spaeter, trupp()], nachAbmarsch(1), opts);
    expect(plans.map((p) => p.truppId).sort()).toEqual(['t1', 't2']);
    expect(earliestLocalWarning(plans)?.truppId).toBe('t1');
  });

  it('liefert ohne Termine nichts', () => {
    expect(earliestLocalWarning([])).toBeUndefined();
  });
});
