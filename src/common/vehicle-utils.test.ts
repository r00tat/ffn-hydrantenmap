import { describe, expect, it } from 'vitest';
import {
  countCrewByVehicle,
  einsatzmittelKategorie,
  einsatzmittelStaerke,
  formatBesatzung,
  getEffectiveAts,
  getEffectiveBesatzung,
  hatEigeneBesatzung,
  nimmtBesatzung,
  parseBesatzung,
} from './vehicle-utils';

describe('getEffectiveBesatzung', () => {
  it('returns manual besatzung when set', () => {
    expect(getEffectiveBesatzung('5', 0)).toBe(5);
    expect(getEffectiveBesatzung('3', 8)).toBe(3);
  });

  it('returns crewCount - 1 when besatzung is empty and crew assigned', () => {
    expect(getEffectiveBesatzung(undefined, 6)).toBe(5);
    expect(getEffectiveBesatzung('', 6)).toBe(5);
    expect(getEffectiveBesatzung('0', 6)).toBe(5);
  });

  it('returns 0 when only 1 crew member assigned', () => {
    expect(getEffectiveBesatzung(undefined, 1)).toBe(0);
  });

  it('returns 0 when no besatzung and no crew', () => {
    expect(getEffectiveBesatzung(undefined, 0)).toBe(0);
    expect(getEffectiveBesatzung('', 0)).toBe(0);
  });
});

describe('getEffectiveAts', () => {
  it('returns the manual ats value when set', () => {
    expect(getEffectiveAts(4, 0)).toBe(4);
    expect(getEffectiveAts(4, 2)).toBe(4);
  });

  it('accepts string values from firestore', () => {
    expect(getEffectiveAts('4', 0)).toBe(4);
  });

  it('falls back to the assigned ats crew when no manual value is set', () => {
    expect(getEffectiveAts(undefined, 3)).toBe(3);
    expect(getEffectiveAts(0, 3)).toBe(3);
    expect(getEffectiveAts('', 3)).toBe(3);
  });

  it('returns 0 without manual value and without ats crew', () => {
    expect(getEffectiveAts(undefined, 0)).toBe(0);
    expect(getEffectiveAts(0, 0)).toBe(0);
  });

  it('ignores invalid manual values', () => {
    expect(getEffectiveAts('abc', 2)).toBe(2);
    expect(getEffectiveAts(-1, 2)).toBe(2);
  });
});

describe('countCrewByVehicle', () => {
  it('counts crew and ats per vehicle', () => {
    const { crewCount, atsCount } = countCrewByVehicle([
      { vehicleId: 'v1', funktion: 'Gruppenkommandant' },
      { vehicleId: 'v1', funktion: 'Maschinist' },
      { vehicleId: 'v1', funktion: 'Atemschutzträger' },
      { vehicleId: 'v1', funktion: 'Atemschutzträger' },
      { vehicleId: 'v2', funktion: 'Atemschutzträger' },
    ]);
    expect(crewCount.get('v1')).toBe(4);
    expect(atsCount.get('v1')).toBe(2);
    expect(crewCount.get('v2')).toBe(1);
    expect(atsCount.get('v2')).toBe(1);
  });

  it('ignores unassigned crew members', () => {
    const { crewCount, atsCount } = countCrewByVehicle([
      { vehicleId: null, funktion: 'Atemschutzträger' },
    ]);
    expect(crewCount.size).toBe(0);
    expect(atsCount.size).toBe(0);
  });

  it('returns empty maps for an empty crew list', () => {
    const { crewCount, atsCount } = countCrewByVehicle([]);
    expect(crewCount.size).toBe(0);
    expect(atsCount.size).toBe(0);
  });

  it('does not report ats for vehicles without ats crew', () => {
    const { atsCount } = countCrewByVehicle([
      { vehicleId: 'v1', funktion: 'Feuerwehrmann' },
    ]);
    expect(atsCount.get('v1')).toBeUndefined();
  });
});

describe('parseBesatzung', () => {
  it('liest die nackte Zahl', () => {
    expect(parseBesatzung('8')).toBe(8);
    expect(parseBesatzung(' 8 ')).toBe(8);
  });

  it('liest die Zahl hinter dem Doppelpunkt', () => {
    expect(parseBesatzung('1:8')).toBe(8);
    expect(parseBesatzung('1 : 8')).toBe(8);
  });

  it('liest auch die deutsche Schrägstrich-Schreibweise', () => {
    expect(parseBesatzung('1/8')).toBe(8);
    // Dreiteilig mit Gesamtsumme — die Mannschaft steht in der Mitte.
    expect(parseBesatzung('1/8/9')).toBe(8);
  });

  it('ergibt 0 ohne verwertbare Zahl', () => {
    expect(parseBesatzung(undefined)).toBe(0);
    expect(parseBesatzung('')).toBe(0);
    expect(parseBesatzung('viele')).toBe(0);
    expect(parseBesatzung('-3')).toBe(0);
  });
});

describe('einsatzmittelKategorie', () => {
  it('nimmt die gepflegte Kategorie', () => {
    expect(einsatzmittelKategorie({ name: 'WLA Bergung', kategorie: 'fahrzeug' })).toBe(
      'fahrzeug',
    );
  });

  it('ordnet WLA-Aufbauten als Aufbau ein', () => {
    expect(einsatzmittelKategorie({ name: 'WLA Bergung' })).toBe('aufbau');
    expect(einsatzmittelKategorie({ name: 'WLA-Wasser' })).toBe('aufbau');
  });

  it('erkennt Anhänger und Boote am Namen', () => {
    expect(einsatzmittelKategorie({ name: 'Ölwehranhänger' })).toBe('anhaenger');
    expect(einsatzmittelKategorie({ name: 'MZB' })).toBe('boot');
    // Ein Bootsanhänger ist ein Anhänger, kein Boot.
    expect(einsatzmittelKategorie({ name: 'Bootsanhänger' })).toBe('anhaenger');
  });

  it('ist im Zweifel ein Fahrzeug', () => {
    expect(einsatzmittelKategorie({ name: 'TLFA 4000' })).toBe('fahrzeug');
    expect(einsatzmittelKategorie({ name: '' })).toBe('fahrzeug');
  });

  it('ignoriert einen unbekannten Wert im Feld', () => {
    expect(
      einsatzmittelKategorie({ name: 'WLA Bergung', kategorie: 'quatsch' as never }),
    ).toBe('aufbau');
  });
});

describe('hatEigeneBesatzung', () => {
  it('gilt für alles, was selbst fährt', () => {
    expect(hatEigeneBesatzung('fahrzeug')).toBe(true);
    expect(hatEigeneBesatzung('boot')).toBe(true);
  });

  it('gilt nicht für Aufbauten und Anhänger', () => {
    expect(hatEigeneBesatzung('aufbau')).toBe(false);
    expect(hatEigeneBesatzung('anhaenger')).toBe(false);
  });
});

describe('einsatzmittelStaerke', () => {
  it('zählt die Führungskraft zur Besatzung', () => {
    expect(einsatzmittelStaerke(8, 'fahrzeug')).toBe(9);
    expect(einsatzmittelStaerke(0, 'fahrzeug')).toBe(1);
    expect(einsatzmittelStaerke(2, 'boot')).toBe(3);
  });

  it('zählt am Aufbau und am Anhänger niemanden dazu', () => {
    expect(einsatzmittelStaerke(0, 'aufbau')).toBe(0);
    expect(einsatzmittelStaerke(0, 'anhaenger')).toBe(0);
    expect(einsatzmittelStaerke(2, 'aufbau')).toBe(2);
  });
});

describe('formatBesatzung', () => {
  it('schreibt die Besatzung eines Fahrzeugs als 1:x', () => {
    expect(formatBesatzung(8, 'fahrzeug')).toBe('1:8');
    expect(formatBesatzung(0, 'fahrzeug')).toBe('1:0');
    expect(formatBesatzung(2, 'boot')).toBe('1:2');
  });

  it('schreibt am Aufbau und am Anhänger keine Führungskraft an', () => {
    expect(formatBesatzung(0, 'aufbau')).toBe('');
    expect(formatBesatzung(0, 'anhaenger')).toBe('');
    expect(formatBesatzung(2, 'aufbau')).toBe('2');
  });
});

describe('getEffectiveBesatzung mit Kategorie', () => {
  it('liest die Schreibweise „1:8" als 8', () => {
    expect(getEffectiveBesatzung('1:8', 0)).toBe(8);
  });

  it('zieht am Fahrzeug die Führungskraft von der Zuordnung ab', () => {
    expect(getEffectiveBesatzung(undefined, 9, 'fahrzeug')).toBe(8);
  });

  it('zählt am Aufbau jede zugeordnete Person zur Besatzung', () => {
    expect(getEffectiveBesatzung(undefined, 2, 'aufbau')).toBe(2);
    expect(getEffectiveBesatzung(undefined, 2, 'anhaenger')).toBe(2);
  });
});

describe('nimmtBesatzung', () => {
  it('lässt am Fahrzeug und am Boot Personen zu', () => {
    expect(nimmtBesatzung({ name: 'TLFA 4000' })).toBe(true);
    expect(nimmtBesatzung({ name: 'MZB' })).toBe(true);
  });

  it('lässt am Aufbau und am Anhänger keine Personen zu', () => {
    expect(nimmtBesatzung({ name: 'WLA Bergung' })).toBe(false);
    expect(nimmtBesatzung({ name: 'Ölwehranhänger' })).toBe(false);
  });

  it('folgt der gepflegten Kategorie', () => {
    expect(nimmtBesatzung({ name: 'WLA Bergung', kategorie: 'fahrzeug' })).toBe(
      true,
    );
  });
});
