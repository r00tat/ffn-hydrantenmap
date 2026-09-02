import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp, Druckabfrage } from '../../common/atemschutz';
import {
  RESERVEDRUCK_BAR,
  berechneStand,
} from '../../common/atemschutzUeberwachung';
import { baueDruckVerlauf } from './druckVerlaufModell';

const ABMARSCH = '2026-09-02T10:00:00.000Z';

function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function abfrage(
  minuten: number,
  druck: number,
  over: Partial<Druckabfrage> = {},
): Druckabfrage {
  return { zeitpunkt: nachAbmarsch(minuten).toISOString(), druck, ...over };
}

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Huber'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function modell(t: AtemschutzTrupp, minuten: number) {
  const jetzt = nachAbmarsch(minuten);
  const stand = berechneStand(t, jetzt)!;
  return { modell: baueDruckVerlauf(t, stand, jetzt), stand };
}

describe('baueDruckVerlauf', () => {
  it('zeichnet nichts ohne zweiten Punkt', () => {
    // Eine Grafik mit einem Punkt darin nimmt nur Platz weg.
    expect(modell(trupp(), 5).modell).toBeUndefined();
  });

  it('nimmt Abmarsch, Abfragen und Rückkehr als Messpunkte', () => {
    const { modell: m } = modell(
      trupp({
        status: 'zurueck',
        abfragen: [abfrage(5, 240, { amZiel: true }), abfrage(15, 150)],
        rueckkehrZeit: nachAbmarsch(25).toISOString(),
        druckRueckkehr: 80,
      }),
      30,
    );
    expect(m?.punkte.map((p) => [p.art, p.druck])).toEqual([
      ['abmarsch', 300],
      ['ziel', 240],
      ['abfrage', 150],
      ['rueckkehr', 80],
    ]);
  });

  it('schreibt vom letzten Messwert bis zum Rückzugsdruck fort', () => {
    // Gestrichelt in der Zeichnung: Der Wert ist eine Annahme, keine Ablesung.
    const { modell: m, stand } = modell(
      trupp({ abfragen: [abfrage(5, 240, { amZiel: true })] }),
      10,
    );
    expect(m?.prognose?.von.druck).toBe(240);
    expect(m?.prognose?.bis.druck).toBe(stand.rueckzugsDruck);
    expect(m?.prognose?.bis.t).toBe(new Date(stand.rueckzugZeit).getTime());
  });

  it('schreibt nach der Rückzugsmeldung bis zur Restdruckwarnung fort', () => {
    // Die Frist ist erfüllt; beobachtet wird die Reserve.
    const { modell: m, stand } = modell(
      trupp({ abfragen: [abfrage(12, 150, { rueckzug: true })] }),
      14,
    );
    expect(m?.prognose?.bis.druck).toBe(RESERVEDRUCK_BAR);
    expect(m?.prognose?.bis.t).toBe(new Date(stand.restdruckZeit).getTime());
  });

  it('schreibt für einen zurückgekehrten Trupp nichts fort', () => {
    const { modell: m } = modell(
      trupp({
        status: 'zurueck',
        abfragen: [abfrage(10, 180)],
        rueckkehrZeit: nachAbmarsch(20).toISOString(),
        druckRueckkehr: 90,
      }),
      30,
    );
    expect(m?.prognose).toBeUndefined();
    // Und keine „jetzt"-Marke: Die Zeile ist Protokoll, keine laufende Lage.
    expect(m?.marken.map((x) => x.key)).not.toContain('jetzt');
  });

  it('trägt Drittelmarken, rechnerisches Ende und jetzt ein', () => {
    const { modell: m, stand } = modell(
      trupp({ abfragen: [abfrage(5, 240)] }),
      9,
    );
    expect(m?.marken.map((x) => x.key)).toEqual([
      'drittel',
      'zweiDrittel',
      'ende',
      'jetzt',
    ]);
    expect(m?.marken[0].t).toBe(new Date(stand.drittelZeit).getTime());
    // Das rechnerische Ende liegt am Anhaltswert der Unterlage, nicht an der
    // Prognose aus dem gemessenen Verbrauch.
    expect(m?.marken[2].t).toBe(
      new Date(ABMARSCH).getTime() + stand.erwarteteDauerMin * 60_000,
    );
  });

  it('markiert Ankunft, angetretenen Rückzug und Rückkehr', () => {
    // Die drei gemeldeten Ereignisse sind die Zeitpunkte, an denen sich die
    // Steigung ändert — ohne sie ist aus der Kurve nicht zu lesen, ob der
    // Verbrauch am Vormarsch oder an der Arbeit am Einsatzziel hängt.
    const { modell: m } = modell(
      trupp({
        status: 'zurueck',
        abfragen: [
          abfrage(5, 240, { amZiel: true }),
          abfrage(15, 140, { rueckzug: true }),
        ],
        rueckkehrZeit: nachAbmarsch(25).toISOString(),
        druckRueckkehr: 80,
      }),
      30,
    );
    const marken = new Map(m?.marken.map((x) => [x.key, x.t]));
    expect(marken.get('ziel')).toBe(nachAbmarsch(5).getTime());
    expect(marken.get('rueckzugAn')).toBe(nachAbmarsch(15).getTime());
    expect(marken.get('zurueck')).toBe(nachAbmarsch(25).getTime());
  });

  it('markiert die Rückkehr auch ohne abgelesenen Druck', () => {
    // Die Marke hängt an der Zeit: Der Rückkehrdruck wird oft nicht mehr
    // abgefragt, der Zeitpunkt steht trotzdem im Protokoll.
    const { modell: m } = modell(
      trupp({
        status: 'zurueck',
        abfragen: [abfrage(10, 180)],
        rueckkehrZeit: nachAbmarsch(20).toISOString(),
      }),
      25,
    );
    expect(m?.marken.map((x) => x.key)).toContain('zurueck');
    expect(m?.punkte.map((p) => p.art)).not.toContain('rueckkehr');
  });

  it('markiert die erste Zielmeldung, nicht jede', () => {
    const { modell: m } = modell(
      trupp({
        abfragen: [
          abfrage(5, 240, { amZiel: true }),
          abfrage(15, 140, { amZiel: true }),
        ],
      }),
      16,
    );
    expect(m?.marken.filter((x) => x.key === 'ziel')).toEqual([
      { key: 'ziel', t: nachAbmarsch(5).getTime() },
    ]);
  });

  it('zeigt Rückzugsdruck und Reserve als getrennte Linien', () => {
    const { modell: m } = modell(
      // 300 → 240 am Ziel: doppelter Vormarschdruckabfall 120 bar, klar über
      // der Restdruckwarnung.
      trupp({ abfragen: [abfrage(5, 240, { amZiel: true })] }),
      10,
    );
    expect(m?.linien).toEqual([
      { key: 'rueckzug', druck: 120 },
      { key: 'reserve', druck: RESERVEDRUCK_BAR },
    ]);
  });

  it('zeigt nur eine Linie, wenn die Restdruckwarnung maßgeblich ist', () => {
    // Kurzer Vormarsch: doppelter Abfall 40 bar, also unter 55 bar.
    const { modell: m } = modell(
      trupp({ abfragen: [abfrage(2, 280, { amZiel: true })] }),
      5,
    );
    expect(m?.linien).toEqual([{ key: 'rueckzug', druck: RESERVEDRUCK_BAR }]);
  });

  it('reicht mit der Achse bis zur spätesten Marke', () => {
    const { modell: m } = modell(
      trupp({ abfragen: [abfrage(5, 240, { amZiel: true })] }),
      6,
    );
    const spaeteste = Math.max(...(m?.marken.map((x) => x.t) ?? []));
    expect(m!.tEnde).toBeGreaterThanOrEqual(spaeteste);
    expect(m!.tStart).toBe(new Date(ABMARSCH).getTime());
  });
});
