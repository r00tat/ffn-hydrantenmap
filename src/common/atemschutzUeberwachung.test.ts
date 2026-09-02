import { describe, expect, it } from 'vitest';
import {
  PA_SAETZE,
  type AtemschutzGeraet,
  type AtemschutzTrupp,
  type Druckabfrage,
} from './atemschutz';
import {
  RESERVEDRUCK_BAR,
  RUECKZUG_VORLAUF_MIN,
  VERBRAUCH_MITTEL_L_MIN,
  berechneStand,
  dringlichkeit,
  dringlichsteWarnung,
  faelligeWarnungen,
  fortschrittProzent,
  geraetesatzVon,
  gesamtVolumenLiter,
  korrekturfaktor,
  nutzbareLuftLiter,
  naechsteWarnung,
  offeneWarnungen,
  rechnerischeEinsatzdauerMin,
  reserveLuftLiter,
  rueckmarschDruck,
  verbrauchAusPunkten,
  vorgabeGeraetesatz,
} from './atemschutzUeberwachung';

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Huber', 'Maier', 'Gruber'],
    status: 'imEinsatz',
    bereitSeit: '2026-09-02T09:00:00.000Z',
    createdAt: '2026-09-02T09:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-09-02T09:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

function flasche(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'g1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche CFK 6,8 l',
    feuerwehr: 'Neusiedl am See',
    active: true,
    createdAt: '2026-09-02T09:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-09-02T09:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

/** Minuten nach dem Abmarsch als Date — die Tests rechnen in Minuten. */
const ABMARSCH = '2026-09-02T10:00:00.000Z';
function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function abfrage(minuten: number, druck: number, amZiel = false): Druckabfrage {
  return {
    zeitpunkt: nachAbmarsch(minuten).toISOString(),
    druck,
    ...(amZiel ? { amZiel: true } : {}),
  };
}

describe('korrekturfaktor', () => {
  // „Bei Drücken von mehr als 265 bar ändert die Luft ihr
  // Kompressionsverhalten." (FH-06, S. 48)
  it('greift erst über 265 bar', () => {
    expect(korrekturfaktor(200)).toBe(1);
    expect(korrekturfaktor(265)).toBe(1);
    expect(korrekturfaktor(266)).toBeCloseTo(0.9);
    expect(korrekturfaktor(300)).toBeCloseTo(0.9);
  });
});

describe('rechnerische Einsatzdauer', () => {
  // Die drei Beispiele aus FH-06, S. 49. Die Unterlage rundet dabei
  // unterschiedlich: 23,2 wird zu 24, 25,8 zu 26 und 58,48 zu 58. Geprüft wird
  // deshalb der exakte Wert, nicht die gerundete Angabe der Unterlage.
  it('trifft das Beispiel Standard-PA 2×4 l / 200 bar', () => {
    const satz = PA_SAETZE.standard200;
    expect(gesamtVolumenLiter(satz)).toBe(8);
    expect(nutzbareLuftLiter(satz)).toBeCloseTo(1160);
    expect(reserveLuftLiter(satz)).toBeCloseTo(440);
    expect(rechnerischeEinsatzdauerMin(satz)).toBeCloseTo(23.2, 2);
  });

  it('trifft das Beispiel Standard-PA 1×6 l / 300 bar', () => {
    const satz = PA_SAETZE.standard300;
    expect(nutzbareLuftLiter(satz)).toBeCloseTo(1290);
    expect(reserveLuftLiter(satz)).toBeCloseTo(330);
    expect(rechnerischeEinsatzdauerMin(satz)).toBeCloseTo(25.8, 2);
  });

  it('trifft das Beispiel Langzeit-PA 2×6,8 l / 300 bar', () => {
    const satz = PA_SAETZE.langzeit300;
    expect(nutzbareLuftLiter(satz)).toBeCloseTo(2924);
    // Die Unterlage nennt 750 Liter, gerechnet sind es 748.
    expect(reserveLuftLiter(satz)).toBeCloseTo(748);
    expect(rechnerischeEinsatzdauerMin(satz)).toBeCloseTo(58.48, 2);
  });

  it('halbiert sich bei schwerer Arbeit nahezu', () => {
    const mittel = rechnerischeEinsatzdauerMin(PA_SAETZE.langzeit300);
    const schwer = rechnerischeEinsatzdauerMin(PA_SAETZE.langzeit300, {
      verbrauch: 100,
    });
    expect(schwer).toBeCloseTo(mittel / 2, 5);
  });

  it('rechnet mit einem abweichenden Startdruck', () => {
    // Eine halb gefüllte 300er-Flasche. Der Korrekturfaktor hängt am
    // Nenndruck und bleibt deshalb bei 0,9 — siehe `korrekturfaktor`.
    const dauer = rechnerischeEinsatzdauerMin(PA_SAETZE.standard300, {
      startdruck: 200,
    });
    expect(dauer).toBeCloseTo((6 * (200 * 0.9 - 55)) / 50, 5);
  });

  it('wird nicht negativ, wenn der Startdruck unter der Reserve liegt', () => {
    expect(
      rechnerischeEinsatzdauerMin(PA_SAETZE.standard300, { startdruck: 40 }),
    ).toBe(0);
  });
});

describe('geraetesatzVon', () => {
  it('nimmt die Vorlage des gewählten Typs', () => {
    expect(geraetesatzVon(trupp({ paTyp: 'langzeit300' }))).toEqual(
      PA_SAETZE.langzeit300,
    );
  });

  it('nimmt bei custom die Werte am Trupp', () => {
    expect(
      geraetesatzVon(
        trupp({
          paTyp: 'custom',
          flaschenAnzahl: 1,
          flaschenVolumen: 6.8,
          fuellDruck: 300,
        }),
      ),
    ).toEqual({ flaschenAnzahl: 1, flaschenVolumen: 6.8, fuellDruck: 300 });
  });

  it('fällt ohne Angabe auf den Standard-PA mit 300 bar zurück', () => {
    expect(geraetesatzVon(trupp())).toEqual(PA_SAETZE.standard300);
  });

  it('ergänzt bei unvollständigen custom-Werten die Vorgabe', () => {
    expect(geraetesatzVon(trupp({ paTyp: 'custom', flaschenVolumen: 9 }))).toEqual(
      { flaschenAnzahl: 1, flaschenVolumen: 9, fuellDruck: 300 },
    );
  });
});

describe('vorgabeGeraetesatz', () => {
  it('leitet den Satz aus dem häufigsten Flaschentyp der Gruppe ab', () => {
    const satz = vorgabeGeraetesatz([
      flasche({ id: 'a', volumenLiter: 6.8, nenndruck: 300 }),
      flasche({ id: 'b', volumenLiter: 6.8, nenndruck: 300 }),
      flasche({ id: 'c', volumenLiter: 6, nenndruck: 300 }),
      // Ein Kompressor ist keine Flasche und darf nicht mitzählen.
      flasche({ id: 'd', typ: 'fuellstation', volumenLiter: 50 }),
    ]);
    expect(satz).toEqual({
      flaschenAnzahl: 1,
      flaschenVolumen: 6.8,
      fuellDruck: 300,
    });
  });

  it('überspringt inaktive Flaschen', () => {
    const satz = vorgabeGeraetesatz([
      flasche({ id: 'a', volumenLiter: 4, nenndruck: 200, active: false }),
      flasche({ id: 'b', volumenLiter: 4, nenndruck: 200, active: false }),
      flasche({ id: 'c', volumenLiter: 6, nenndruck: 300 }),
    ]);
    expect(satz).toEqual(PA_SAETZE.standard300);
  });

  it('fällt ohne erfasste Flaschen auf den Standard-PA zurück', () => {
    expect(vorgabeGeraetesatz([])).toEqual(PA_SAETZE.standard300);
  });
});

describe('verbrauchAusPunkten', () => {
  const satz = PA_SAETZE.standard300;

  it('braucht zwei Werte', () => {
    expect(
      verbrauchAusPunkten([{ zeitpunkt: ABMARSCH, druck: 300 }], satz),
    ).toBeUndefined();
  });

  it('rechnet aus dem ersten und dem letzten Wert', () => {
    const verbrauch = verbrauchAusPunkten(
      [
        { zeitpunkt: ABMARSCH, druck: 300 },
        { zeitpunkt: nachAbmarsch(10).toISOString(), druck: 200 },
      ],
      satz,
    );
    expect(verbrauch?.barProMin).toBeCloseTo(10);
    // 10 bar/min × 6 l × 0,9 = 54 l/min — mehr als der Anhaltswert von 50.
    expect(verbrauch?.literProMin).toBeCloseTo(54);
    expect(verbrauch?.quelle).toBe('gemessen');
  });

  it('schreibt den Wert mit jeder weiteren Abfrage fort', () => {
    const punkte = [
      { zeitpunkt: ABMARSCH, druck: 300 },
      { zeitpunkt: nachAbmarsch(10).toISOString(), druck: 200 },
      { zeitpunkt: nachAbmarsch(20).toISOString(), druck: 160 },
    ];
    // Über die ganze Strecke: 140 bar in 20 Minuten.
    expect(verbrauchAusPunkten(punkte, satz)?.barProMin).toBeCloseTo(7);
  });

  it('verwirft einen gestiegenen oder gleichen Druck', () => {
    expect(
      verbrauchAusPunkten(
        [
          { zeitpunkt: ABMARSCH, druck: 200 },
          { zeitpunkt: nachAbmarsch(10).toISOString(), druck: 210 },
        ],
        satz,
      ),
    ).toBeUndefined();
  });

  it('verwirft zwei Werte zur selben Zeit', () => {
    expect(
      verbrauchAusPunkten(
        [
          { zeitpunkt: ABMARSCH, druck: 300 },
          { zeitpunkt: ABMARSCH, druck: 250 },
        ],
        satz,
      ),
    ).toBeUndefined();
  });
});

describe('rueckmarschDruck', () => {
  // „Grundsatz: Rückmarschdruck = doppelter Vormarschdruckabfall" (FH-06, S. 46)
  it('ist der doppelte Vormarschdruckabfall', () => {
    expect(rueckmarschDruck({ startdruck: 300, druckAmZiel: 200 })).toBe(200);
  });

  it('fehlt ohne Zielmeldung', () => {
    expect(rueckmarschDruck({ startdruck: 300 })).toBeUndefined();
  });

  it('ist bei einem kurzen Vormarsch klein — Beispiel 2 der Unterlage', () => {
    // Vormarschdruckabfall 20 bar, doppelt also 40 bar: unter der
    // Restdruckwarnung von 55 bar.
    expect(rueckmarschDruck({ startdruck: 300, druckAmZiel: 280 })).toBe(40);
  });
});

describe('berechneStand', () => {
  it('bleibt ohne Abmarschzeit undefiniert', () => {
    expect(berechneStand(trupp({ status: 'bereit' }), new Date())).toBeUndefined();
  });

  it('rechnet zu Beginn mit den Standardwerten', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
      }),
      nachAbmarsch(0),
    );
    expect(stand?.verbrauch.quelle).toBe('standard');
    expect(stand?.verbrauch.literProMin).toBe(VERBRAUCH_MITTEL_L_MIN);
    expect(stand?.erwarteteDauerMin).toBeCloseTo(25.8, 2);
    expect(stand?.vermuteterDruck).toBeCloseTo(300);
    expect(stand?.startdruckGeschaetzt).toBe(false);
  });

  it('schreibt den vermuteten Druck über die Zeit fort', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
      }),
      nachAbmarsch(6),
    );
    // 50 l/min ÷ (6 l × 0,9) = 9,26 bar/min, nach 6 Minuten also 55,6 bar
    // weniger.
    expect(stand?.vermuteterDruck).toBeCloseTo(244.4, 1);
  });

  it('nimmt ohne gemessenen Abmarschdruck den Nenndruck und sagt es', () => {
    const stand = berechneStand(
      trupp({ paTyp: 'standard300', abmarschZeit: ABMARSCH }),
      nachAbmarsch(0),
    );
    expect(stand?.startdruck).toBe(300);
    expect(stand?.startdruckGeschaetzt).toBe(true);
  });

  it('rechnet ab der zweiten Druckabfrage mit dem realen Verbrauch', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
        abfragen: [abfrage(10, 200)],
      }),
      nachAbmarsch(10),
    );
    expect(stand?.verbrauch.quelle).toBe('gemessen');
    expect(stand?.verbrauch.barProMin).toBeCloseTo(10);
    expect(stand?.vermuteterDruck).toBeCloseTo(200);
    // Restdruckwarnung bei 55 bar: (200 − 55) / 10 bar/min = 14,5 Minuten.
    expect(stand?.minutenBisRestdruck).toBeCloseTo(14.5, 2);
  });

  it('nimmt den doppelten Vormarschdruckabfall, wenn er zuerst greift', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
        abfragen: [abfrage(5, 200, true)],
      }),
      nachAbmarsch(5),
    );
    expect(stand?.rueckmarschDruck).toBe(200);
    expect(stand?.rueckzugsDruck).toBe(200);
    expect(stand?.rueckzugsGrund).toBe('vormarsch');
    // Der Rückzugsdruck ist schon erreicht — die Zeit liegt nicht in der
    // Zukunft.
    expect(stand?.minutenBisRueckzug).toBeCloseTo(0, 5);
  });

  it('nimmt die Restdruckwarnung, wenn der Vormarsch kurz war', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
        abfragen: [abfrage(2, 280, true)],
      }),
      nachAbmarsch(2),
    );
    // Doppelter Vormarschdruckabfall: 40 bar, also unter der Warnschwelle.
    expect(stand?.rueckmarschDruck).toBe(40);
    expect(stand?.rueckzugsDruck).toBe(RESERVEDRUCK_BAR);
    expect(stand?.rueckzugsGrund).toBe('restdruck');
    expect(stand?.rueckzugZeit).toBe(stand?.restdruckZeit);
  });

  it('legt die Drittelmarken auf die erwartete Einsatzzeit', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard200',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 200,
      }),
      nachAbmarsch(0),
    );
    // 23,2 Minuten erwartete Dauer.
    const minuten = (iso: string) =>
      (new Date(iso).getTime() - new Date(ABMARSCH).getTime()) / 60_000;
    expect(minuten(stand!.drittelZeit)).toBeCloseTo(23.2 / 3, 3);
    expect(minuten(stand!.zweiDrittelZeit)).toBeCloseTo((2 * 23.2) / 3, 3);
  });

  it('rechnet den vermuteten Druck nicht unter null', () => {
    const stand = berechneStand(
      trupp({
        paTyp: 'standard300',
        abmarschZeit: ABMARSCH,
        druckAbmarsch: 300,
      }),
      nachAbmarsch(600),
    );
    expect(stand?.vermuteterDruck).toBe(0);
  });
});

describe('faelligeWarnungen', () => {
  const basis = trupp({
    paTyp: 'standard300',
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
  });
  // Erwartete Dauer 25,8 min → Drittel bei 8,6 min, zwei Drittel bei 17,2 min.

  it('meldet nichts, solange kein Drittel um ist', () => {
    expect(faelligeWarnungen(basis, nachAbmarsch(5))).toEqual([]);
  });

  it('meldet nach einem Drittel ohne Meldung', () => {
    const keys = faelligeWarnungen(basis, nachAbmarsch(9)).map((w) => w.key);
    expect(keys).toContain('drittel');
  });

  it('schweigt, wenn der Trupp gemeldet hat', () => {
    const gemeldet = trupp({ ...basis, abfragen: [abfrage(8, 250)] });
    expect(faelligeWarnungen(gemeldet, nachAbmarsch(9))).toEqual([]);
  });

  it('erinnert nach zwei Dritteln erneut', () => {
    const gemeldet = trupp({ ...basis, abfragen: [abfrage(8, 250)] });
    const keys = faelligeWarnungen(gemeldet, nachAbmarsch(18)).map((w) => w.key);
    expect(keys).toEqual(['zweiDrittel']);
  });

  it('schweigt nach zwei Dritteln, wenn nach dem ersten Drittel gemeldet wurde', () => {
    const gemeldet = trupp({ ...basis, abfragen: [abfrage(12, 220)] });
    expect(faelligeWarnungen(gemeldet, nachAbmarsch(18))).toEqual([]);
  });

  it('warnt mit Vorlauf vor dem Rückzugszeitpunkt', () => {
    const stand = berechneStand(basis, nachAbmarsch(0));
    const rueckzugMin =
      (new Date(stand!.rueckzugZeit).getTime() - new Date(ABMARSCH).getTime()) /
      60_000;
    const keys = faelligeWarnungen(
      basis,
      nachAbmarsch(rueckzugMin - RUECKZUG_VORLAUF_MIN + 0.1),
    ).map((w) => w.key);
    expect(keys).toContain('rueckzug');
  });

  it('schweigt für einen Trupp, der nicht im Einsatz ist', () => {
    expect(
      faelligeWarnungen(
        trupp({ ...basis, status: 'zurueck', rueckkehrZeit: ABMARSCH }),
        nachAbmarsch(60),
      ),
    ).toEqual([]);
  });
});

describe('offeneWarnungen', () => {
  const basis = trupp({
    paTyp: 'standard300',
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
  });

  it('lässt eine bereits verschickte Warnung weg', () => {
    const mitVermerk = trupp({
      ...basis,
      warnungen: { drittel: nachAbmarsch(9).toISOString() },
    });
    expect(offeneWarnungen(mitVermerk, nachAbmarsch(10))).toEqual([]);
  });

  it('meldet eine noch nicht verschickte Warnung', () => {
    expect(
      offeneWarnungen(basis, nachAbmarsch(10)).map((w) => w.key),
    ).toEqual(['drittel']);
  });
});

describe('naechsteWarnung', () => {
  const basis = trupp({
    paTyp: 'standard300',
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
  });

  it('nennt beim Abmarsch die Drittelmarke als nächsten Termin', () => {
    // 1×6 l / 300 bar → 25,8 min rechnerisch, ein Drittel bei 8,6 min.
    const plan = naechsteWarnung(basis, nachAbmarsch(0));
    expect(plan?.key).toBe('drittel');
    expect(
      (new Date(plan?.faelligAb as string).getTime() -
        new Date(ABMARSCH).getTime()) /
        60_000,
    ).toBeCloseTo(8.6, 1);
  });

  it('überspringt eine verschickte Warnung', () => {
    const plan = naechsteWarnung(
      trupp({ ...basis, warnungen: { drittel: nachAbmarsch(9).toISOString() } }),
      nachAbmarsch(10),
    );
    expect(plan?.key).toBe('zweiDrittel');
  });

  it('plant den Rückzug mit Vorlauf, wenn die Erinnerungen erledigt sind', () => {
    const plan = naechsteWarnung(
      trupp({
        ...basis,
        warnungen: {
          drittel: nachAbmarsch(9).toISOString(),
          zweiDrittel: nachAbmarsch(18).toISOString(),
        },
      }),
      nachAbmarsch(19),
    );
    expect(plan?.key).toBe('rueckzug');
    // Ohne Ankunftsmeldung gilt die Restdruckwarnung bei 55 bar. Sie liegt bei
    // 26,5 min (fortgeschrieben aus dem Druck, s. „Der Reservedruck ist nicht
    // korrigiert"), abzüglich drei Minuten Vorlauf.
    expect(
      (new Date(plan?.faelligAb as string).getTime() -
        new Date(ABMARSCH).getTime()) /
        60_000,
    ).toBeCloseTo(23.5, 1);
  });

  it('nennt einen bereits fälligen Termin in der Vergangenheit', () => {
    // Ein nachgetragener Abmarsch: Der Termin ist vorbei, die Warnung noch
    // offen — der Aufrufer plant dann auf jetzt.
    const plan = naechsteWarnung(basis, nachAbmarsch(12));
    expect(plan?.key).toBe('drittel');
    expect(new Date(plan?.faelligAb as string).getTime()).toBeLessThan(
      nachAbmarsch(12).getTime(),
    );
  });

  it('plant nichts für einen Trupp, der nicht im Einsatz ist', () => {
    expect(
      naechsteWarnung(trupp({ ...basis, status: 'zurueck' }), nachAbmarsch(1)),
    ).toBeUndefined();
  });

  it('plant nichts ohne Abmarschzeit', () => {
    expect(
      naechsteWarnung(
        trupp({ ...basis, abmarschZeit: undefined }),
        nachAbmarsch(1),
      ),
    ).toBeUndefined();
  });

  it('plant nichts, wenn alle drei verschickt sind', () => {
    expect(
      naechsteWarnung(
        trupp({
          ...basis,
          warnungen: {
            drittel: ABMARSCH,
            zweiDrittel: ABMARSCH,
            rueckzug: ABMARSCH,
          },
        }),
        nachAbmarsch(25),
      ),
    ).toBeUndefined();
  });
});

describe('dringlichsteWarnung', () => {
  it('nimmt den Rückzug vor den Erinnerungen', () => {
    expect(
      dringlichsteWarnung([
        { key: 'drittel', faelligSeit: ABMARSCH },
        { key: 'rueckzug', faelligSeit: ABMARSCH },
        { key: 'zweiDrittel', faelligSeit: ABMARSCH },
      ])?.key,
    ).toBe('rueckzug');
  });

  it('ist ohne Warnung undefiniert', () => {
    expect(dringlichsteWarnung([])).toBeUndefined();
  });
});

describe('dringlichkeit und Fortschritt', () => {
  const basis = trupp({
    paTyp: 'standard300',
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
  });

  it('ist am Anfang unauffällig', () => {
    const stand = berechneStand(basis, nachAbmarsch(1))!;
    expect(dringlichkeit(stand)).toBe('ok');
    expect(fortschrittProzent(stand)).toBeLessThan(10);
  });

  it('wird kritisch im Vorlauf der Rückzugswarnung', () => {
    const stand = berechneStand(basis, nachAbmarsch(25))!;
    expect(dringlichkeit(stand)).toBe('kritisch');
  });

  it('meldet den überschrittenen Rückzugszeitpunkt', () => {
    const stand = berechneStand(basis, nachAbmarsch(40))!;
    expect(dringlichkeit(stand)).toBe('ueberschritten');
    expect(fortschrittProzent(stand)).toBe(100);
  });

  it('warnt im letzten Drittel', () => {
    const stand = berechneStand(basis, nachAbmarsch(20))!;
    expect(dringlichkeit(stand)).toBe('achtung');
  });
});
