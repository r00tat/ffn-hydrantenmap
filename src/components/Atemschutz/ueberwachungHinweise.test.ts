import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  dringlichsterHinweis,
  hinweisId,
  neueHinweise,
} from './ueberwachungHinweise';

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna', 'Bernd', 'Clara'],
    status: 'imEinsatz',
    bereitSeit: '2026-09-02T10:00:00.000Z',
    abmarschZeit: '2026-09-02T10:00:00.000Z',
    druckAbmarsch: 300,
    paTyp: 'standard300',
    flaschenAnzahl: 1,
    flaschenVolumen: 6,
    fuellDruck: 300,
    createdAt: '2026-09-02T10:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-09-02T10:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

/** 1×6 l / 300 bar ergibt rund 26 min; ein Drittel liegt bei knapp 9 min. */
const NACH_DRITTEL = new Date('2026-09-02T10:10:00.000Z');

describe('hinweisId', () => {
  it('unterscheidet Trupp und Warnung', () => {
    expect(hinweisId('t1', 'drittel')).not.toBe(hinweisId('t1', 'rueckzug'));
    expect(hinweisId('t1', 'drittel')).not.toBe(hinweisId('t2', 'drittel'));
  });
});

describe('neueHinweise', () => {
  it('meldet die fällige Warnung eines Trupps im Einsatz', () => {
    const hinweise = neueHinweise([trupp()], NACH_DRITTEL);
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0].warnung.key).toBe('drittel');
    expect(hinweise[0].id).toBe(hinweisId('t1', 'drittel'));
    // Der Stand fährt mit: Der Text der Meldung braucht Druck und Rückzugszeit.
    expect(hinweise[0].stand.vermuteterDruck).toBeLessThan(300);
  });

  it('meldet je Trupp nur die dringlichste Warnung', () => {
    // Nach dem Rückzugszeitpunkt sind Drittel, zwei Drittel und Rückzug
    // gleichzeitig fällig — auf dem Bildschirm ginge die wichtigste zwischen
    // zwei Erinnerungen unter.
    const hinweise = neueHinweise(
      [trupp()],
      new Date('2026-09-02T10:40:00.000Z'),
    );
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0].warnung.key).toBe('rueckzug');
  });

  it('lässt eine schon gemeldete Warnung weg', () => {
    const gemeldet = new Set([hinweisId('t1', 'drittel')]);
    expect(neueHinweise([trupp()], NACH_DRITTEL, { gemeldet })).toEqual([]);
  });

  it('meldet die nächste Stufe auch dann, wenn die erste gemeldet ist', () => {
    const gemeldet = new Set([hinweisId('t1', 'drittel')]);
    const hinweise = neueHinweise(
      [trupp()],
      new Date('2026-09-02T10:40:00.000Z'),
      { gemeldet },
    );
    expect(hinweise.map((h) => h.warnung.key)).toEqual(['rueckzug']);
  });

  it('ignoriert Trupps, die nicht im Einsatz sind', () => {
    expect(
      neueHinweise([trupp({ status: 'zurueck' })], NACH_DRITTEL),
    ).toEqual([]);
  });

  it('ignoriert eine Zeile ohne id — sie ließe sich nicht wiedererkennen', () => {
    expect(neueHinweise([trupp({ id: undefined })], NACH_DRITTEL)).toEqual([]);
  });

  it('schweigt, solange keine Frist erreicht ist', () => {
    expect(
      neueHinweise([trupp()], new Date('2026-09-02T10:02:00.000Z')),
    ).toEqual([]);
  });

  it('schweigt zu einem Trupp, der gemeldet hat', () => {
    // Eine erfasste Druckabfrage *ist* die Meldung nach der Drittel-Regel.
    const gemeldetHat = trupp({
      abfragen: [{ zeitpunkt: '2026-09-02T10:08:00.000Z', druck: 250 }],
    });
    expect(neueHinweise([gemeldetHat], NACH_DRITTEL)).toEqual([]);
  });
});

describe('dringlichsterHinweis', () => {
  it('ist ohne Hinweise undefined', () => {
    expect(dringlichsterHinweis([])).toBeUndefined();
  });

  it('nimmt den Rückzug vor den Erinnerungen', () => {
    const hinweise = neueHinweise(
      [
        trupp({ id: 't1' }),
        // Ein zweiter Trupp, der eine halbe Stunde unterwegs ist: Sein
        // Rückzugszeitpunkt ist überschritten.
        trupp({
          id: 't2',
          abmarschZeit: '2026-09-02T09:40:00.000Z',
          bereitSeit: '2026-09-02T09:40:00.000Z',
        }),
      ],
      NACH_DRITTEL,
    );
    expect(hinweise).toHaveLength(2);
    expect(dringlichsterHinweis(hinweise)?.warnung.key).toBe('rueckzug');
    expect(dringlichsterHinweis(hinweise)?.trupp.id).toBe('t2');
  });
});
