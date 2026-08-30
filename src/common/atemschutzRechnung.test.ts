import { describe, expect, it } from 'vitest';
import type { AtemschutzFuellung } from './atemschutz';
import {
  DEFAULT_RECHNUNG_CONFIG,
  TARIF_BIS_6L,
  TARIF_UEBER_6L,
  empfaengerFuerFeuerwehr,
  empfaengerKopie,
  fuellungenNachFeuerwehr,
  naechsteRechnungsnummer,
  offeneFuellungen,
  rechnungPositionen,
  rechnungStatusErlaubt,
  rechnungConfigLuecken,
  rechnungStatusFarbe,
  rechnungSumme,
  zahlungszielDatum,
  zeitraumDerPositionen,
  zeitraumText,
  type AtemschutzEmpfaenger,
} from './atemschutzRechnung';

const PREISE = { [TARIF_BIS_6L]: 4.3, [TARIF_UEBER_6L]: 6.4 };

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'f1',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Muster',
    zeitpunkt: '2026-03-12T09:00:00.000Z',
    firecallId: '',
    verrechnen: true,
    feuerwehr: 'Winden am See',
    createdAt: '2026-03-12T09:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-03-12T09:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

function empfaenger(over: Partial<AtemschutzEmpfaenger> = {}): AtemschutzEmpfaenger {
  return {
    id: 'e1',
    feuerwehr: 'Winden am See',
    name: 'Freiwillige Feuerwehr Winden am See',
    adresse: 'Hauptstraße 1, 7093 Winden am See',
    email: 'kdo@ff-winden.at',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

describe('offeneFuellungen', () => {
  it('nimmt nur zu verrechnende ohne Rechnung', () => {
    const liste = [
      fuellung({ id: 'a' }),
      fuellung({ id: 'b', verrechnen: false }),
      fuellung({ id: 'c', rechnungId: 'r1' }),
    ];
    expect(offeneFuellungen(liste).map((f) => f.id)).toEqual(['a']);
  });
});

describe('fuellungenNachFeuerwehr', () => {
  it('bündelt je Feuerwehr mit Anzahl und Zeitraum', () => {
    const buendel = fuellungenNachFeuerwehr(
      [
        fuellung({ id: 'a', anzahl: 2, zeitpunkt: '2026-03-12T09:00:00.000Z' }),
        fuellung({ id: 'b', anzahl: 1, zeitpunkt: '2026-03-01T09:00:00.000Z' }),
        fuellung({ id: 'c', feuerwehr: 'Jois' }),
      ],
      PREISE,
      DEFAULT_RECHNUNG_CONFIG.vorgabeTarif,
    );

    expect(buendel).toHaveLength(2);
    expect(buendel[1]).toMatchObject({
      feuerwehr: 'Winden am See',
      flaschen: 3,
      summe: 12.9,
      von: '2026-03-01T09:00:00.000Z',
      bis: '2026-03-12T09:00:00.000Z',
    });
    expect(buendel[0].feuerwehr).toBe('Jois');
  });

  it('fasst Schreibweisen derselben Wehr zusammen', () => {
    const buendel = fuellungenNachFeuerwehr(
      [
        fuellung({ id: 'a', feuerwehr: 'Winden am See' }),
        fuellung({ id: 'b', feuerwehr: 'winden-am-see' }),
      ],
      PREISE,
      DEFAULT_RECHNUNG_CONFIG.vorgabeTarif,
    );
    expect(buendel).toHaveLength(1);
    expect(buendel[0].flaschen).toBe(2);
  });

  it('sammelt Füllungen ohne Feuerwehr unter einem eigenen Bündel', () => {
    const buendel = fuellungenNachFeuerwehr(
      [fuellung({ id: 'a', feuerwehr: undefined })],
      PREISE,
      DEFAULT_RECHNUNG_CONFIG.vorgabeTarif,
    );
    expect(buendel[0].feuerwehr).toBe('');
  });
});

describe('rechnungPositionen', () => {
  it('nimmt den Vorgabetarif, auch wenn die Flasche größer ist', () => {
    const [position] = rechnungPositionen(
      [{ fuellung: fuellung(), volumenLiter: 6.8 }],
      PREISE,
      TARIF_BIS_6L,
    );
    expect(position.rateId).toBe(TARIF_BIS_6L);
    expect(position.einzelpreis).toBe(4.3);
    expect(position.volumenLiter).toBe(6.8);
  });

  it('lässt den Tarif je Position übersteuern', () => {
    const [position] = rechnungPositionen(
      [{ fuellung: fuellung(), tarifId: TARIF_UEBER_6L }],
      PREISE,
      TARIF_BIS_6L,
    );
    expect(position.rateId).toBe(TARIF_UEBER_6L);
    expect(position.einzelpreis).toBe(6.4);
  });

  it('rechnet die Sammelerfassung mit der Anzahl', () => {
    const [position] = rechnungPositionen(
      [{ fuellung: fuellung({ anzahl: 3 }) }],
      PREISE,
      TARIF_BIS_6L,
    );
    expect(position.summe).toBe(12.9);
  });

  it('rundet auf Cent', () => {
    const [position] = rechnungPositionen(
      [{ fuellung: fuellung({ anzahl: 3 }) }],
      { [TARIF_BIS_6L]: 4.31 },
      TARIF_BIS_6L,
    );
    expect(position.summe).toBe(12.93);
  });

  it('wirft, wenn der Tarif keinen Preis hat', () => {
    expect(() => rechnungPositionen([{ fuellung: fuellung() }], {}, TARIF_BIS_6L)).toThrow(/5\.01/);
  });
});

describe('rechnungSumme', () => {
  it('summiert auf Cent genau', () => {
    const positionen = rechnungPositionen(
      [
        { fuellung: fuellung({ id: 'a' }) },
        { fuellung: fuellung({ id: 'b' }), tarifId: TARIF_UEBER_6L },
      ],
      PREISE,
      TARIF_BIS_6L,
    );
    expect(rechnungSumme(positionen)).toBe(10.7);
  });
});

describe('zeitraumDerPositionen', () => {
  it('liefert frühesten und spätesten Zeitpunkt', () => {
    const positionen = rechnungPositionen(
      [
        {
          fuellung: fuellung({
            id: 'a',
            zeitpunkt: '2026-03-12T09:00:00.000Z',
          }),
        },
        {
          fuellung: fuellung({
            id: 'b',
            zeitpunkt: '2026-03-01T09:00:00.000Z',
          }),
        },
      ],
      PREISE,
      TARIF_BIS_6L,
    );
    expect(zeitraumDerPositionen(positionen)).toEqual({
      von: '2026-03-01T09:00:00.000Z',
      bis: '2026-03-12T09:00:00.000Z',
    });
  });
});

describe('empfaengerFuerFeuerwehr', () => {
  it('findet über die vereinheitlichte Schreibweise', () => {
    const gefunden = empfaengerFuerFeuerwehr(
      [empfaenger({ feuerwehr: 'winden-am-see' })],
      'Winden am See',
    );
    expect(gefunden?.id).toBe('e1');
  });

  it('übergeht inaktive Einträge', () => {
    expect(
      empfaengerFuerFeuerwehr([empfaenger({ active: false })], 'Winden am See'),
    ).toBeUndefined();
  });
});

describe('empfaengerKopie', () => {
  it('lässt Systemfelder und id weg', () => {
    const kopie = empfaengerKopie(empfaenger({ telefon: '0699 1234567' }));
    expect(kopie).toEqual({
      feuerwehr: 'Winden am See',
      name: 'Freiwillige Feuerwehr Winden am See',
      adresse: 'Hauptstraße 1, 7093 Winden am See',
      email: 'kdo@ff-winden.at',
      telefon: '0699 1234567',
    });
  });
});

describe('naechsteRechnungsnummer', () => {
  it('baut ATS-Jahr-laufend mit drei Stellen', () => {
    expect(naechsteRechnungsnummer(2026, 0)).toBe('ATS-2026-001');
    expect(naechsteRechnungsnummer(2026, 41)).toBe('ATS-2026-042');
  });

  it('bricht bei vierstelligen Nummern nicht ab', () => {
    expect(naechsteRechnungsnummer(2026, 1233)).toBe('ATS-2026-1234');
  });
});

describe('rechnungStatusErlaubt', () => {
  it('lässt den Weg Entwurf → verschickt → bezahlt zu', () => {
    expect(rechnungStatusErlaubt('draft', 'sent')).toBe(true);
    expect(rechnungStatusErlaubt('sent', 'paid')).toBe(true);
  });

  it('erlaubt Storno aus jedem nicht stornierten Status', () => {
    expect(rechnungStatusErlaubt('draft', 'cancelled')).toBe(true);
    expect(rechnungStatusErlaubt('sent', 'cancelled')).toBe(true);
    expect(rechnungStatusErlaubt('paid', 'cancelled')).toBe(true);
  });

  it('kennt keinen Weg aus dem Storno heraus', () => {
    expect(rechnungStatusErlaubt('cancelled', 'draft')).toBe(false);
    expect(rechnungStatusErlaubt('cancelled', 'sent')).toBe(false);
  });

  it('lässt bezahlt nicht überspringen', () => {
    expect(rechnungStatusErlaubt('draft', 'paid')).toBe(false);
  });
});

describe('rechnungStatusFarbe', () => {
  it('gibt je Status eine MUI-Farbe', () => {
    expect(rechnungStatusFarbe('draft')).toBe('default');
    expect(rechnungStatusFarbe('sent')).toBe('primary');
    expect(rechnungStatusFarbe('paid')).toBe('success');
    expect(rechnungStatusFarbe('cancelled')).toBe('error');
  });
});

describe('zahlungszielDatum', () => {
  it('rechnet die Tage auf das Rechnungsdatum', () => {
    expect(zahlungszielDatum('2026-03-05T00:00:00.000Z', 14)).toBe('2026-03-19T00:00:00.000Z');
  });

  it('verschiebt sich an der Zeitumstellung nicht', () => {
    // 20.03. + 14 Tage überspringt den Beginn der Sommerzeit. In Ortszeit
    // gerechnet käme hier 02.04. 23:00 UTC heraus — auf einem UTC-Server
    // stünde dann der 2. statt des 3. April auf der Rechnung.
    expect(zahlungszielDatum('2026-03-20T00:00:00.000Z', 14)).toBe('2026-04-03T00:00:00.000Z');
  });

  it('lässt das Ziel weg, wenn keine Frist gesetzt ist', () => {
    expect(zahlungszielDatum('2026-03-20T00:00:00.000Z', 0)).toBeUndefined();
  });

  it('erfindet kein Datum aus einer unlesbaren Eingabe', () => {
    expect(zahlungszielDatum('kein Datum', 14)).toBeUndefined();
    expect(zahlungszielDatum('', 14)).toBeUndefined();
  });
});

describe('rechnungConfigLuecken', () => {
  const vollstaendig = {
    ...DEFAULT_RECHNUNG_CONFIG,
    absenderName: 'FF Neusiedl am See',
    absenderAdresse: 'Satzgasse 9',
    iban: 'AT40 3300 0000 0202 0402',
  };

  it('meldet nichts, wenn Absender und Konto stehen', () => {
    expect(rechnungConfigLuecken(vollstaendig)).toEqual([]);
  });

  it('nimmt den Gruppennamen als Absender an', () => {
    expect(rechnungConfigLuecken({ ...vollstaendig, absenderName: '' }, 'Neusiedl am See')).toEqual(
      [],
    );
  });

  it('benennt die fehlenden Felder', () => {
    expect(rechnungConfigLuecken(DEFAULT_RECHNUNG_CONFIG)).toEqual([
      'absenderName',
      'absenderAdresse',
      'iban',
    ]);
  });

  it('stürzt an einem Dokument ohne die neuen Felder nicht ab', () => {
    const alt = { vorgabeTarif: TARIF_BIS_6L } as never;
    expect(rechnungConfigLuecken(alt)).toEqual(['absenderName', 'absenderAdresse', 'iban']);
  });
});

describe('zeitraumText', () => {
  const tag = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

  it('zeigt bei gleichem Tag nur ein Datum', () => {
    expect(zeitraumText('2026-03-12T08:00:00.000Z', '2026-03-12T16:00:00.000Z', tag)).toBe(
      '12.03.2026',
    );
  });

  it('zeigt sonst die Spanne', () => {
    expect(zeitraumText('2026-03-01T08:00:00.000Z', '2026-03-12T16:00:00.000Z', tag)).toBe(
      '01.03.2026 – 12.03.2026',
    );
  });

  it('kommt mit einem fehlenden Ende zurecht', () => {
    expect(zeitraumText('2026-03-12T08:00:00.000Z', '', tag)).toBe('12.03.2026');
    expect(zeitraumText('', '2026-03-12T08:00:00.000Z', tag)).toBe('12.03.2026');
    expect(zeitraumText('', '', tag)).toBe('');
  });
});
