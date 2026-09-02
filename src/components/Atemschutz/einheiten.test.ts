import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  ALLE_EINHEITEN,
  ASSP_EINHEIT,
  OHNE_EINHEIT,
  einheitOptionen,
  einheitTabs,
  istEinheitName,
  truppPasstZuEinheit,
  zuordnungKey,
} from './einheiten';

type Zeile = Pick<
  AtemschutzTrupp,
  'entsendetAn' | 'ueberwachungSeit' | 'ueberwachungBis'
>;

const SEIT = '2026-09-02T10:00:00.000Z';

describe('zuordnungKey', () => {
  it('nennt die eingetragene Einheit', () => {
    expect(zuordnungKey({ entsendetAn: ' RLFA-ND ' })).toBe('RLFA-ND');
  });

  it('zählt einen nie übernommenen Trupp zum Sammelplatz', () => {
    // Vor der Übernahme ist der Trupp Sache des Sammelplatzes — dort wird er
    // ausgerüstet, und dort steht er bereit (FH-06 5.3.4).
    expect(zuordnungKey({})).toBe(ASSP_EINHEIT);
  });

  it('zählt einen zurückgegebenen Trupp ohne Einheit zum Sammelplatz', () => {
    expect(zuordnungKey({ ueberwachungSeit: SEIT, ueberwachungBis: SEIT })).toBe(
      ASSP_EINHEIT,
    );
  });

  it('nennt einen überwachten Trupp ohne Einheit „nicht zugeordnet"', () => {
    // Jemand führt die Zeitkontrolle, hat aber nicht gesagt, für welche
    // Einheit — genau die Lücke, die sichtbar werden soll.
    expect(zuordnungKey({ ueberwachungSeit: SEIT })).toBe(OHNE_EINHEIT);
  });

  it('lässt die eingetragene Einheit auch nach der Rückgabe stehen', () => {
    // Die Zeile bleibt der Nachweis über den Einsatz *dieser* Einheit; dass
    // der Trupp danach zum Sammelplatz ging, sagt der Zeitstempel.
    expect(
      zuordnungKey({
        entsendetAn: 'RLFA-ND',
        ueberwachungSeit: SEIT,
        ueberwachungBis: SEIT,
      }),
    ).toBe('RLFA-ND');
  });
});

describe('istEinheitName', () => {
  it('unterscheidet echte Einheiten von den Sammelkategorien', () => {
    expect(istEinheitName('RLFA-ND')).toBe(true);
    expect(istEinheitName(ASSP_EINHEIT)).toBe(false);
    expect(istEinheitName(OHNE_EINHEIT)).toBe(false);
    expect(istEinheitName(ALLE_EINHEITEN)).toBe(false);
  });
});

describe('einheitOptionen', () => {
  it('nimmt die Fahrzeuge des Einsatzes auf, auch ohne Trupp daran', () => {
    // Der wichtigste Fall: Beim ersten Trupp eines Einsatzes gibt es noch
    // keine Zuordnung — die Liste wäre sonst leer und die Wahl unmöglich.
    expect(
      einheitOptionen({ trupps: [], bekannt: ['RLFA-ND', 'KDOF'] }),
    ).toEqual(['KDOF', 'RLFA-ND']);
  });

  it('vereinigt zugeordnete und bekannte Einheiten', () => {
    expect(
      einheitOptionen({
        trupps: [{ entsendetAn: 'Abschnitt Ost' }, { entsendetAn: 'RLFA-ND' }, {}],
        bekannt: ['RLFA-ND', 'TLFA'],
      }),
    ).toEqual(['Abschnitt Ost', 'RLFA-ND', 'TLFA']);
  });

  it('fasst dieselbe Einheit trotz anderer Schreibweise zusammen', () => {
    expect(
      einheitOptionen({ trupps: [{ entsendetAn: 'rlfa-nd' }], bekannt: ['RLFA-ND'] }),
    ).toEqual(['rlfa-nd']);
  });

  it('behält eine gewählte Einheit, an der noch kein Trupp hängt', () => {
    expect(
      einheitOptionen({ trupps: [], bekannt: [], gewaehlt: 'RLFA-ND' }),
    ).toEqual(['RLFA-ND']);
  });

  it('übergeht Leeres und die Sammelkategorien', () => {
    expect(
      einheitOptionen({
        trupps: [{ entsendetAn: '  ' }],
        bekannt: ['', '   ', ASSP_EINHEIT],
        gewaehlt: ALLE_EINHEITEN,
      }),
    ).toEqual([]);
  });
});

describe('einheitTabs', () => {
  const zeile = (over: Zeile = {}): Zeile => over;

  it('stellt die eigene Einheit voran und „alle" ans Ende', () => {
    // Der Fokus gehört auf die eigenen Trupps: Wer am Fahrzeug steht, sucht
    // zuerst seine eigenen und nicht die Gesamtlage.
    const tabs = einheitTabs({
      trupps: [
        zeile({ entsendetAn: 'TLFA', ueberwachungSeit: SEIT }),
        zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT }),
      ],
      aktuell: [zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT })],
      gewaehlt: 'RLFA-ND',
    });
    expect(tabs.map((t) => t.key)).toEqual(['RLFA-ND', 'TLFA', ALLE_EINHEITEN]);
  });

  it('zählt die aktuellen Bereitstellungen, nicht das Protokoll', () => {
    // Die Zahl am Reiter ist „so viele Trupps sind das jetzt" — die alten
    // Zeilen desselben Trupps würden sie vervielfachen.
    const tabs = einheitTabs({
      trupps: [
        zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT }),
        zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT }),
      ],
      aktuell: [zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT })],
    });
    expect(tabs[0]).toEqual({ key: 'RLFA-ND', name: 'RLFA-ND', anzahl: 1 });
    expect(tabs.at(-1)).toEqual({ key: ALLE_EINHEITEN, anzahl: 1 });
  });

  it('zeigt Sammelplatz und Nicht-zugeordnet nur, wenn es sie gibt', () => {
    const ohne = einheitTabs({
      trupps: [zeile({ entsendetAn: 'RLFA-ND', ueberwachungSeit: SEIT })],
      aktuell: [],
    });
    expect(ohne.map((t) => t.key)).toEqual(['RLFA-ND', ALLE_EINHEITEN]);

    const mit = einheitTabs({
      trupps: [zeile(), zeile({ ueberwachungSeit: SEIT })],
      aktuell: [zeile()],
    });
    expect(mit.map((t) => t.key)).toEqual([
      ASSP_EINHEIT,
      OHNE_EINHEIT,
      ALLE_EINHEITEN,
    ]);
  });

  it('behält die eigene Einheit als Reiter, auch ohne Trupp daran', () => {
    // Sonst wäre die Wahl „meine Einheit" ohne Wirkung, solange niemand einen
    // Trupp erfasst hat — und der erste Trupp entsteht genau dort.
    const tabs = einheitTabs({ trupps: [], aktuell: [], gewaehlt: 'RLFA-ND' });
    expect(tabs).toEqual([
      { key: 'RLFA-ND', name: 'RLFA-ND', anzahl: 0 },
      { key: ALLE_EINHEITEN, anzahl: 0 },
    ]);
  });
});

describe('truppPasstZuEinheit', () => {
  it('zeigt ohne Auswahl alles', () => {
    expect(truppPasstZuEinheit({ entsendetAn: 'RLFA-ND' }, ALLE_EINHEITEN)).toBe(
      true,
    );
  });

  it('trennt die Einheiten scharf', () => {
    // Auch für „Zurück" und „Protokoll": Vorher rutschten Trupps ohne
    // Zuordnung durch jeden Filter, und damit änderten sich die unteren
    // Abschnitte bei der Wahl einer Einheit nicht.
    expect(truppPasstZuEinheit({ entsendetAn: ' rlfa-nd ' }, 'RLFA-ND')).toBe(
      true,
    );
    expect(truppPasstZuEinheit({ entsendetAn: 'TLFA' }, 'RLFA-ND')).toBe(false);
    expect(truppPasstZuEinheit({}, 'RLFA-ND')).toBe(false);
  });

  it('sammelt die Trupps des Sammelplatzes und die ohne Zuordnung', () => {
    expect(truppPasstZuEinheit({}, ASSP_EINHEIT)).toBe(true);
    expect(
      truppPasstZuEinheit({ ueberwachungSeit: SEIT }, OHNE_EINHEIT),
    ).toBe(true);
    expect(truppPasstZuEinheit({ ueberwachungSeit: SEIT }, ASSP_EINHEIT)).toBe(
      false,
    );
  });
});
