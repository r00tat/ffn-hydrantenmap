import { describe, expect, it } from 'vitest';
import {
  formatDdm,
  formatDecimal,
  formatDms,
  parseCoordinatePair,
  parseCoordinateValue,
} from './coordinates';

/** Der Kirchturm von Neusiedl am See, gerundet. */
const NEUSIEDL = { lat: 47.94829, lng: 16.84822 };

describe('parseCoordinatePair', () => {
  it.each([
    ['Dezimalgrad mit Komma', '47.94829, 16.84822'],
    ['Dezimalgrad mit Leerzeichen', '47.94829 16.84822'],
    ['Dezimalgrad mit Semikolon', '47.94829; 16.84822'],
    ['deutsches Dezimalkomma', '47,94829 16,84822'],
    ['Gradzeichen und nachgestellte Himmelsrichtung', '47.94829° N, 16.84822° E'],
    ['vorangestellte Himmelsrichtung', 'N 47.94829 E 16.84822'],
    ['Grad/Minuten/Sekunden', '47°56\'53.8"N 16°50\'53.6"E'],
    ['Grad/Minuten/Sekunden mit Leerzeichen', '47° 56\' 53.8" N, 16° 50\' 53.6" E'],
    ['Grad/Minuten/Sekunden ohne Zeichen', '47 56 53.8 N 16 50 53.6 E'],
    ['Grad/Dezimalminuten', "N 47°56.897' E 16°50.893'"],
  ])('liest %s', (_name, input) => {
    const pair = parseCoordinatePair(input);
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
    expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
  });

  it('nimmt die Himmelsrichtung und nicht die Reihenfolge', () => {
    // Manche Stellen melden erst die Länge. Steht die Richtung dabei, ist die
    // Reihenfolge belanglos — ohne sie gilt weiterhin „Breite zuerst".
    const pair = parseCoordinatePair('E 16.84822 N 47.94829');
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
    expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
  });

  it('liest Süd und West als negative Werte', () => {
    const pair = parseCoordinatePair('S 33.8688 W 151.2093');
    expect(pair?.lat).toBeCloseTo(-33.8688, 4);
    expect(pair?.lng).toBeCloseTo(-151.2093, 4);
  });

  it('liest negative Vorzeichen', () => {
    const pair = parseCoordinatePair('-33.8688, -151.2093');
    expect(pair?.lat).toBeCloseTo(-33.8688, 4);
    expect(pair?.lng).toBeCloseTo(-151.2093, 4);
  });

  it.each([
    ['leer', ''],
    ['Text', 'irgendwas'],
    ['nur ein Wert', '47.94829'],
    ['Breite außerhalb des Bereichs', '95.0, 16.0'],
    ['Länge außerhalb des Bereichs', '47.0, 200.0'],
    ['zweimal dieselbe Achse', 'N 47.94829 N 16.84822'],
    ['Minuten über 60', "47°75'00\"N 16°50'00\"E"],
  ])('nimmt %s nicht an', (_name, input) => {
    expect(parseCoordinatePair(input)).toBeUndefined();
  });
});

describe('parseCoordinateValue', () => {
  it('liest einen einzelnen Dezimalwert', () => {
    expect(parseCoordinateValue('47.94829', 'lat')).toBeCloseTo(47.94829, 5);
  });

  it('liest auch Grad/Minuten/Sekunden in einem Feld', () => {
    expect(parseCoordinateValue('47°56\'53.8"N', 'lat')).toBeCloseTo(
      47.94829,
      4
    );
  });

  it('prüft den Wertebereich je Achse', () => {
    expect(parseCoordinateValue('100', 'lat')).toBeUndefined();
    expect(parseCoordinateValue('100', 'lng')).toBeCloseTo(100, 5);
    expect(parseCoordinateValue('200', 'lng')).toBeUndefined();
  });
});

describe('Formatierung', () => {
  it('schreibt Dezimalgrad auf fünf Nachkommastellen', () => {
    // Fünf Stellen sind gut ein Meter — feiner als jede Meldung, die hereinkommt.
    expect(formatDecimal(NEUSIEDL.lat, NEUSIEDL.lng)).toBe('47.94829, 16.84822');
  });

  it('schreibt Grad/Minuten/Sekunden', () => {
    expect(formatDms(NEUSIEDL.lat, NEUSIEDL.lng)).toBe(
      '47°56\'53.8"N 16°50\'53.6"E'
    );
  });

  it('schreibt Grad/Dezimalminuten', () => {
    expect(formatDdm(NEUSIEDL.lat, NEUSIEDL.lng)).toBe(
      "N 47°56.897' E 16°50.893'"
    );
  });

  it('schreibt Süd und West mit der Himmelsrichtung statt mit Vorzeichen', () => {
    expect(formatDms(-33.8688, -151.2093)).toBe('33°52\'7.7"S 151°12\'33.5"W');
  });

  it('trägt beim Runden über', () => {
    // 59,98 Sekunden dürfen nicht als 60" stehen bleiben.
    const grenze = 47 + 59 / 60 + 59.98 / 3600;
    expect(formatDms(grenze, 16)).toBe('48°0\'0.0"N 16°0\'0.0"E');
  });

  it('liest zurück, was es geschrieben hat', () => {
    for (const fmt of [formatDecimal, formatDms, formatDdm]) {
      const pair = parseCoordinatePair(fmt(NEUSIEDL.lat, NEUSIEDL.lng));
      expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
      expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
    }
  });
});

describe('parseCoordinatePair mit Links', () => {
  // So kommt eine Position heute meistens an: als geteilter Standort aus
  // WhatsApp, als Kartenlink aus einer Mail, als `geo:` aus einer App.
  const cases: [string, string][] = [
    ['geo-URI', 'geo:47.94829,16.84822'],
    ['geo-URI mit Zoom', 'geo:47.94829,16.84822?z=17'],
    ['geo-URI mit Suchbegriff', 'geo:0,0?q=47.94829,16.84822(Einsatzort)'],
    ['Google-Maps-Link', 'https://maps.google.com/?q=47.94829,16.84822'],
    [
      'Google-Maps-Ort',
      'https://www.google.com/maps/place/Neusiedl+am+See/@47.94829,16.84822,17z/data=!3m1',
    ],
    ['Apple-Maps-Link', 'https://maps.apple.com/?ll=47.94829,16.84822&q=Einsatzort'],
    [
      'OpenStreetMap-Marker',
      'https://www.openstreetmap.org/?mlat=47.94829&mlon=16.84822#map=17/47.94829/16.84822',
    ],
    ['OpenStreetMap-Ausschnitt', 'https://www.openstreetmap.org/#map=17/47.94829/16.84822'],
  ];

  it.each(cases)('liest die Position aus einem %s', (_name, link) => {
    const pair = parseCoordinatePair(link);
    expect(pair?.lat).toBeCloseTo(NEUSIEDL.lat, 4);
    expect(pair?.lng).toBeCloseTo(NEUSIEDL.lng, 4);
  });

  it('gibt einen Kurzlink auf, statt zu raten', () => {
    // `maps.app.goo.gl` trägt die Position nicht, sie steht erst hinter der
    // Weiterleitung. Offline ist daraus nichts zu holen.
    expect(parseCoordinatePair('https://maps.app.goo.gl/abc123')).toBeUndefined();
  });

  it('nimmt keinen Link ohne Position', () => {
    expect(
      parseCoordinatePair('https://www.google.com/maps/search/Feuerwehr')
    ).toBeUndefined();
  });
});
