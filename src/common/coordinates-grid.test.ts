import { describe, expect, it } from 'vitest';
import { formatBmn, formatUtm, parseBmn, parseUtm } from './coordinates-grid';

/** Der Kirchturm von Neusiedl am See, gerundet. */
const NEUSIEDL = { lat: 47.94829, lng: 16.84822 };

/**
 * Ein echter Hydrant aus dem Burgenland-GIS.
 *
 * `hydrantenCsvConverter.test.ts` führt dieselbe Stelle als GK-East
 * (EPSG:31256) mit x = 37648.217, y = 310270.421. BMN M34 ist dieselbe
 * Abbildung mit dem falschen Rechtswert 750000 — die Zahlen sind also
 * gegengeprüft und nicht aus dieser Implementierung gewonnen.
 */
const HYDRANT = {
  lat: 47.92995,
  lng: 16.83597,
  rechtswert: 750000 + 37648.217,
  hochwert: 310270.421,
};

/** Die drei Zahlen einer Gitterangabe, ohne die Kennung davor. */
function numbers(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

describe('formatUtm', () => {
  it('schreibt Zone, Rechtswert und Hochwert in ganzen Metern', () => {
    // Gegenprobe von Hand über den Meridianbogen und die Reihenentwicklung:
    // rund 638 000 / 5 312 200 für den Kirchturm.
    const text = formatUtm(NEUSIEDL.lat, NEUSIEDL.lng);
    expect(text).toMatch(/^33T \d{6} \d{7}$/);
    const [, east, north] = numbers(text);
    expect(east).toBeCloseTo(638004, -2);
    expect(north).toBeCloseTo(5312206, -2);
  });

  it('wählt die Zone nach der Länge und das Band nach der Breite', () => {
    // Österreich liegt in zwei Zonen; die Grenze verläuft bei 12° Ost. Das
    // Band wechselt bei 48° Nord — so steht es auch auf der ÖK.
    expect(formatUtm(47.5031, 9.7471)).toMatch(/^32T /); // Bregenz
    expect(formatUtm(48.2085, 16.3738)).toMatch(/^33U /); // Wien
  });

  it('schreibt auch die Südhalbkugel mit ihrem Band', () => {
    expect(formatUtm(-33.8688, 151.2093)).toMatch(/^56H /);
  });
});

describe('parseUtm', () => {
  it('liest zurück, was formatUtm geschrieben hat', () => {
    const pair = parseUtm(formatUtm(NEUSIEDL.lat, NEUSIEDL.lng));
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
    expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
  });

  it('nimmt die Zone mit jedem Bandbuchstaben und auch ohne', () => {
    // Manche Systeme schreiben statt des Bandes die Halbkugel: `33N`. Beides
    // bedeutet hier nördlich, und mehr braucht die Umrechnung nicht.
    for (const text of ['33T 638004 5312206', '33N 638004 5312206', '33 638004 5312206']) {
      const pair = parseUtm(text);
      expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 3);
      expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 3);
    }
  });

  it('nimmt ohne Zone die mitgegebene an', () => {
    // Beim Ändern der Zahl im Feld bleibt die Zone, die dort schon stand.
    const pair = parseUtm('638004 5312206', 33);
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 3);
  });

  it('verlangt eine Zone, wenn keine bekannt ist', () => {
    expect(parseUtm('638004 5312206')).toBeUndefined();
  });

  it('nimmt kein Unsinn', () => {
    expect(parseUtm('keine Koordinate')).toBeUndefined();
    expect(parseUtm('61N 638004 5312206')).toBeUndefined();
    expect(parseUtm('33N 638004')).toBeUndefined();
  });
});

describe('formatBmn', () => {
  it('schreibt den Meridianstreifen dazu', () => {
    const text = formatBmn(HYDRANT.lat, HYDRANT.lng);
    expect(text).toMatch(/^M34 \d{6} \d{6}$/);
    const [, rechts, hoch] = numbers(text);
    expect(rechts).toBeCloseTo(HYDRANT.rechtswert, -1);
    expect(hoch).toBeCloseTo(HYDRANT.hochwert, -1);
  });

  it('wählt den Streifen nach der Länge', () => {
    expect(formatBmn(47.2692, 11.3933)).toMatch(/^M28 /); // Innsbruck
    expect(formatBmn(47.8095, 13.055)).toMatch(/^M31 /); // Salzburg
    expect(formatBmn(47.0707, 15.4395)).toMatch(/^M34 /); // Graz
  });
});

describe('parseBmn', () => {
  it('liest den Hydranten aus dem Burgenland-GIS', () => {
    const pair = parseBmn(`M34 ${HYDRANT.rechtswert} ${HYDRANT.hochwert}`);
    expect(pair?.lat).toBeCloseTo(HYDRANT.lat, 4);
    expect(pair?.lng).toBeCloseTo(HYDRANT.lng, 4);
  });

  it('erkennt den Streifen am Rechtswert, auch ohne Kennung', () => {
    // Der falsche Rechtswert ist je Streifen ein anderer — 150/450/750 km.
    // Die Zahl trägt den Streifen also schon in sich.
    const pair = parseBmn(`${HYDRANT.rechtswert} ${HYDRANT.hochwert}`);
    expect(pair?.lat).toBeCloseTo(HYDRANT.lat, 4);
    expect(pair?.lng).toBeCloseTo(HYDRANT.lng, 4);
  });

  it('nimmt R/H-Kennungen und deutsche Dezimalkommas', () => {
    const pair = parseBmn('R 787648,217 H 310270,421');
    expect(pair?.lat).toBeCloseTo(HYDRANT.lat, 4);
    expect(pair?.lng).toBeCloseTo(HYDRANT.lng, 4);
  });

  it('nimmt keine UTM-Angabe, die ins falsche Feld geraten ist', () => {
    // Der Rechtswert sähe passend aus, der Hochwert liegt aber um fünf
    // Millionen daneben — das ergäbe eine Breite jenseits des Pols.
    expect(parseBmn('638004 5312206')).toBeUndefined();
  });

  it('liest zurück, was formatBmn geschrieben hat', () => {
    const pair = parseBmn(formatBmn(NEUSIEDL.lat, NEUSIEDL.lng));
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
    expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
  });
});
