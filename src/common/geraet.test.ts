import { describe, expect, it } from 'vitest';
import {
  GERAET_BESTAND_COLLECTION,
  GERAET_BUCHUNG_COLLECTION,
  GERAET_COLLECTION,
  GERAET_EINSATZ_COLLECTION,
  GERAET_MAX_MENGE,
  deviationKey,
  formatLagerort,
  isBelowMinimum,
  isContainer,
  isValidMenge,
  lagerortKey,
  parseMenge,
} from './geraet';

describe('Collections', () => {
  it('heißen wie im Datenmodell', () => {
    expect(GERAET_COLLECTION).toBe('geraet');
    expect(GERAET_BESTAND_COLLECTION).toBe('geraetBestand');
    expect(GERAET_BUCHUNG_COLLECTION).toBe('geraetBuchung');
    expect(GERAET_EINSATZ_COLLECTION).toBe('geraetEinsatz');
  });
});

describe('lagerortKey', () => {
  it('setzt Fahrzeug und Laderaum zusammen', () => {
    expect(
      lagerortKey({ art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' }),
    ).toBe('fahrzeug|srf|gr 2');
  });

  it('setzt Standort und Raum zusammen', () => {
    expect(
      lagerortKey({ art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' }),
    ).toBe('raum|feuerwehrhaus|lager');
  });

  it('kennt den Set-Artikel ohne weitere Angaben', () => {
    expect(lagerortKey({ art: 'set' })).toBe('set');
  });

  it('ist unempfindlich gegen Groß-/Kleinschreibung und Leerraum', () => {
    expect(
      lagerortKey({ art: 'fahrzeug', fahrzeug: '  srf ', laderaum: 'GR   2' }),
    ).toBe(
      lagerortKey({ art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' }),
    );
  });

  it('lässt Bemerkung und Fahrzeugverknüpfung außen vor', () => {
    // Die Identität eines Lagerorts beim Folgeimport darf nicht daran hängen,
    // ob jemand eine Bemerkung geändert oder ein Fahrzeug verknüpft hat.
    expect(
      lagerortKey({
        art: 'fahrzeug',
        fahrzeug: 'SRF',
        laderaum: 'GR 2',
        bemerkung: 'oben links',
        vehicleId: 'v1',
      }),
    ).toBe('fahrzeug|srf|gr 2');
  });

  it('hält leere Teile an ihrem Platz', () => {
    // Ohne Laderaum ist es ein anderer Lagerort als mit.
    expect(lagerortKey({ art: 'fahrzeug', fahrzeug: 'SRF' })).toBe(
      'fahrzeug|srf|',
    );
    expect(lagerortKey({ art: 'raum', raum: 'Lager' })).toBe('raum||lager');
  });
});

describe('deviationKey', () => {
  it('stellt die Artikel-ID voran', () => {
    expect(
      deviationKey({ geraetId: '4711', lagerortKey: 'fahrzeug|srf|gr 2' }),
    ).toBe('4711|fahrzeug|srf|gr 2');
  });
});

describe('formatLagerort', () => {
  it('zeigt Fahrzeug und Laderaum', () => {
    expect(
      formatLagerort({ art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' }),
    ).toBe('SRF · GR 2');
  });

  it('zeigt Standort und Raum', () => {
    expect(
      formatLagerort({ art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' }),
    ).toBe('Feuerwehrhaus · Lager');
  });

  it('lässt fehlende Teile weg', () => {
    expect(formatLagerort({ art: 'fahrzeug', fahrzeug: 'SRF' })).toBe('SRF');
    expect(formatLagerort({ art: 'raum', raum: 'Lager' })).toBe('Lager');
  });

  it('benennt den Set-Artikel', () => {
    expect(formatLagerort({ art: 'set' })).toBe('Set-Artikel');
  });
});

describe('isBelowMinimum', () => {
  it('ist ohne Mindestbestand nie unterschritten', () => {
    expect(isBelowMinimum({ bestandGesamt: -3 })).toBe(false);
  });

  it('vergleicht den Gesamtbestand mit dem Mindestbestand', () => {
    expect(isBelowMinimum({ bestandGesamt: 4, mindestbestand: 5 })).toBe(true);
    expect(isBelowMinimum({ bestandGesamt: 5, mindestbestand: 5 })).toBe(false);
    expect(isBelowMinimum({ bestandGesamt: 6, mindestbestand: 5 })).toBe(false);
  });

  it('wertet einen negativen Bestand bei Mindestbestand 0 als unterschritten', () => {
    expect(isBelowMinimum({ bestandGesamt: -1, mindestbestand: 0 })).toBe(true);
  });
});

describe('isValidMenge', () => {
  it('nimmt endliche Mengen von 0 bis zur Obergrenze an, auch Kommazahlen', () => {
    expect(isValidMenge(0)).toBe(true);
    expect(isValidMenge(2.5)).toBe(true);
    expect(isValidMenge(GERAET_MAX_MENGE)).toBe(true);
  });

  it('lehnt negative, unendliche, zu große und Nicht-Zahlen ab', () => {
    expect(isValidMenge(-1)).toBe(false);
    expect(isValidMenge(Number.NaN)).toBe(false);
    expect(isValidMenge(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidMenge(1e308)).toBe(false);
    expect(isValidMenge(GERAET_MAX_MENGE + 1)).toBe(false);
    expect(isValidMenge('3')).toBe(false);
  });
});

describe('parseMenge', () => {
  it('liest ganze Zahlen und Kommazahlen mit Komma oder Punkt', () => {
    expect(parseMenge('12')).toBe(12);
    expect(parseMenge(' 2,5 ')).toBe(2.5);
    expect(parseMenge('7.5')).toBe(7.5);
    expect(parseMenge('0')).toBe(0);
  });

  it('leer, negativ, zu groß oder kein Zahlwert: undefined', () => {
    expect(parseMenge('')).toBeUndefined();
    expect(parseMenge('  ')).toBeUndefined();
    expect(parseMenge('-1')).toBeUndefined();
    expect(parseMenge('1e308')).toBeUndefined();
    expect(parseMenge('abc')).toBeUndefined();
  });
});

describe('Container als Lagerort', () => {
  it('schlüsselt nach der Artikel-ID, nicht nach dem Namen', () => {
    expect(
      lagerortKey({ art: 'container', container: 'Ölsperren 1', containerId: '93599' }),
    ).toBe('container|93599');
    expect(
      lagerortKey({ art: 'container', container: 'Umbenannt', containerId: '93599' }),
    ).toBe('container|93599');
  });

  it('zeigt die Bezeichnung des Containers', () => {
    expect(
      formatLagerort({ art: 'container', container: 'Ölsperren 1', containerId: '93599' }),
    ).toBe('Ölsperren 1');
  });

  it('erkennt Container an der Sybos-Kategorie', () => {
    expect(isContainer({ kategorie: 'Container' })).toBe(true);
    expect(isContainer({ kategorie: ' container ' })).toBe(true);
    expect(isContainer({ kategorie: 'Gerät' })).toBe(false);
    expect(isContainer({})).toBe(false);
  });
});
