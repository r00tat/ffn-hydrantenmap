import { describe, it, expect } from 'vitest';
import { calculateStrength } from './fahrzeuge-utils';
import { CrewAssignment, FirecallItem } from '../firebase/firestore';

describe('calculateStrength', () => {
  it('calculates vehicle strength as besatzung + 1', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6);
    expect(result.totalAts).toBe(2);
    expect(result.totalUnits).toBe(1);
  });

  it('calculates tactical unit strength from mann field', () => {
    const items: FirecallItem[] = [
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8, ats: 4 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(8);
    expect(result.totalAts).toBe(4);
    expect(result.totalUnits).toBe(1);
  });

  it('sums across vehicles and tactical units', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
      { name: 'KLF', type: 'vehicle', besatzung: '3', ats: 0 } as any,
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8, ats: 4 } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6 + 4 + 8); // 18
    expect(result.totalAts).toBe(2 + 0 + 4); // 6
    expect(result.totalUnits).toBe(3);
  });

  it('handles vehicle with no besatzung as 1 person', () => {
    const items: FirecallItem[] = [
      { name: 'Drohne', type: 'vehicle' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(1);
    expect(result.totalAts).toBe(0);
  });

  it('ignores non-vehicle non-tacticalUnit items', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: 2 } as any,
      { name: 'Marker', type: 'marker' } as any,
      { name: 'Rohr', type: 'rohr' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6);
    expect(result.totalUnits).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const result = calculateStrength([]);
    expect(result.totalMann).toBe(0);
    expect(result.totalAts).toBe(0);
    expect(result.totalUnits).toBe(0);
  });

  it('converts string ats and mann values to numbers', () => {
    const items: FirecallItem[] = [
      { name: 'TLF', type: 'vehicle', besatzung: '5', ats: '2' } as any,
      {
        name: '1. Gruppe',
        type: 'tacticalUnit',
        mann: '8',
        ats: '4',
      } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(6 + 8); // 14
    expect(result.totalAts).toBe(2 + 4); // 6
    expect(result.rows[0].mann).toBe(6);
    expect(result.rows[0].ats).toBe(2);
    expect(result.rows[1].mann).toBe(8);
    expect(result.rows[1].ats).toBe(4);
  });

  it('uses crew count as fallback when besatzung is empty', () => {
    const items: FirecallItem[] = [
      { type: 'vehicle', name: 'TLF', id: 'v1', besatzung: '', ats: 0 } as any,
    ];
    const crew: CrewAssignment[] = [
      { recipientId: '1', name: 'A', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
      { recipientId: '2', name: 'B', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
      { recipientId: '3', name: 'C', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
    ];
    const result = calculateStrength(items, crew);
    expect(result.totalMann).toBe(3);
    expect(result.rows[0].mann).toBe(3);
  });

  it('prefers manual besatzung over crew count', () => {
    const items: FirecallItem[] = [
      { type: 'vehicle', name: 'TLF', id: 'v1', besatzung: '8', ats: 2 } as any,
    ];
    const crew: CrewAssignment[] = [
      { recipientId: '1', name: 'A', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
    ];
    const result = calculateStrength(items, crew);
    expect(result.totalMann).toBe(9);
  });

  it('counts assigned Atemschutzträger as vehicle ats', () => {
    const items: FirecallItem[] = [
      { type: 'vehicle', name: 'TLF', id: 'v1', besatzung: '', ats: 0 } as any,
    ];
    const crew: CrewAssignment[] = [
      { recipientId: '1', name: 'A', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
      { recipientId: '2', name: 'B', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
      { recipientId: '3', name: 'C', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Atemschutzträger' },
      { recipientId: '4', name: 'D', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Atemschutzträger' },
    ];
    const result = calculateStrength(items, crew);
    expect(result.rows[0].ats).toBe(2);
    expect(result.totalAts).toBe(2);
  });

  it('prefers a manually entered ats value over the assigned Atemschutzträger', () => {
    const items: FirecallItem[] = [
      { type: 'vehicle', name: 'TLF', id: 'v1', besatzung: '8', ats: 4 } as any,
    ];
    const crew: CrewAssignment[] = [
      { recipientId: '1', name: 'A', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Atemschutzträger' },
    ];
    const result = calculateStrength(items, crew);
    expect(result.rows[0].ats).toBe(4);
    expect(result.totalAts).toBe(4);
  });

  it('does not count Atemschutzträger of other vehicles', () => {
    const items: FirecallItem[] = [
      { type: 'vehicle', name: 'TLF', id: 'v1' } as any,
      { type: 'vehicle', name: 'KLF', id: 'v2' } as any,
    ];
    const crew: CrewAssignment[] = [
      { recipientId: '1', name: 'A', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Atemschutzträger' },
      { recipientId: '2', name: 'B', vehicleId: null, vehicleName: '', funktion: 'Atemschutzträger' },
    ];
    const result = calculateStrength(items, crew);
    expect(result.rows[0].ats).toBe(1);
    expect(result.rows[1].ats).toBe(0);
    expect(result.totalAts).toBe(1);
  });

  it('returns per-item strength data', () => {
    const items: FirecallItem[] = [
      {
        name: 'TLF',
        type: 'vehicle',
        besatzung: '5',
        ats: 2,
        fw: 'FF NaS',
      } as any,
      {
        name: '1. Gruppe',
        type: 'tacticalUnit',
        mann: 8,
        ats: 4,
        fw: 'FF NaS',
        unitType: 'gruppe',
      } as any,
    ];
    const result = calculateStrength(items);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      name: 'TLF',
      fw: 'FF NaS',
      typ: 'Fahrzeug',
      mann: 6,
      ats: 2,
      alarmierung: undefined,
      eintreffen: undefined,
      abruecken: undefined,
      fremd: false,
    });
    expect(result.rows[1]).toEqual({
      name: '1. Gruppe',
      fw: 'FF NaS',
      typ: 'Gruppe',
      mann: 8,
      ats: 4,
      alarmierung: undefined,
      eintreffen: undefined,
      abruecken: undefined,
      fremd: false,
    });
  });
});

describe('calculateStrength mit Kategorien', () => {
  it('zählt an einem Aufbau keinen Fahrer dazu', () => {
    const items: FirecallItem[] = [
      { name: 'WLA Bergung', type: 'vehicle' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(0);
    expect(result.rows[0].typ).toBe('Aufbau');
  });

  it('zählt an einem Anhänger keinen Fahrer dazu', () => {
    const items: FirecallItem[] = [
      { name: 'Ölwehranhänger', type: 'vehicle' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(0);
    expect(result.rows[0].typ).toBe('Anhänger');
  });

  it('folgt der gepflegten Kategorie gegen den Namen', () => {
    const items: FirecallItem[] = [
      {
        name: 'WLA Bergung',
        type: 'vehicle',
        kategorie: 'fahrzeug',
        besatzung: '2',
      } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(3);
    expect(result.rows[0].typ).toBe('Fahrzeug');
  });

  it('zählt am Boot den Bootsführer dazu', () => {
    const items: FirecallItem[] = [
      { name: 'MZB', type: 'vehicle', besatzung: '2' } as any,
    ];
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(3);
    expect(result.rows[0].typ).toBe('Boot');
  });

  it('zählt die Personen eines Aufbaus vollständig, wenn welche zugeordnet sind', () => {
    const items: FirecallItem[] = [
      { id: 'v1', name: 'WLA Bergung', type: 'vehicle' } as any,
    ];
    const crew: CrewAssignment[] = [
      { id: 'a1', recipientId: 'r1', name: 'A', vehicleId: 'v1' } as any,
      { id: 'a2', recipientId: 'r2', name: 'B', vehicleId: 'v1' } as any,
    ];
    const result = calculateStrength(items, crew);
    expect(result.totalMann).toBe(2);
  });

  it('liest die Schreibweise „1:8" im Besatzungsfeld', () => {
    const items: FirecallItem[] = [
      { name: 'TLFA 4000', type: 'vehicle', besatzung: '1:8' } as any,
    ];
    expect(calculateStrength(items).totalMann).toBe(9);
  });
});

/**
 * Fremdkräfte werden getrennt gezählt.
 *
 * Für die Einsatzleitung sind das zwei verschiedene Fragen: „wie viele eigene
 * Leute habe ich" und „wer ist sonst noch da". Eine Zahl, die beides vermengt,
 * beantwortet keine von beiden.
 */
describe('calculateStrength: eigene Kräfte und Fremdkräfte', () => {
  const items: FirecallItem[] = [
    { name: 'TLF', fw: 'FF Neusiedl', type: 'vehicle', besatzung: '5', ats: 2 } as any,
    {
      name: 'RTW',
      fw: 'Rotes Kreuz',
      type: 'vehicle',
      besatzung: '1',
      ats: 0,
      fremd: 'true',
    } as any,
  ];

  it('trennt die Zeilen nach Zugehörigkeit', () => {
    const result = calculateStrength(items);
    expect(result.eigene.rows.map((r) => r.name)).toEqual(['TLF']);
    expect(result.fremde.rows.map((r) => r.name)).toEqual(['RTW']);
  });

  it('zählt je Gruppe getrennt', () => {
    const result = calculateStrength(items);
    expect(result.eigene.totalMann).toBe(6);
    expect(result.eigene.totalAts).toBe(2);
    expect(result.fremde.totalMann).toBe(2);
    expect(result.fremde.totalAts).toBe(0);
  });

  it('behält die Gesamtsumme über beide Gruppen', () => {
    // Die Trennung nimmt nichts weg: Wer wissen will, wie viele Kräfte
    // insgesamt vor Ort sind, liest die Gesamtzeile.
    const result = calculateStrength(items);
    expect(result.totalMann).toBe(8);
    expect(result.totalUnits).toBe(2);
  });

  it('merkt sich die Zugehörigkeit an der Zeile', () => {
    const result = calculateStrength(items);
    expect(result.rows.find((r) => r.name === 'RTW')?.fremd).toBe(true);
    expect(result.rows.find((r) => r.name === 'TLF')?.fremd).toBe(false);
  });

  it('zählt die Feuerwehren je Gruppe', () => {
    const result = calculateStrength(items);
    expect(result.eigene.totalFw).toBe(1);
    expect(result.fremde.totalFw).toBe(1);
  });

  it('lässt die Fremdgruppe leer, wenn keine fremden Kräfte da sind', () => {
    const result = calculateStrength([items[0]]);
    expect(result.fremde.rows).toHaveLength(0);
    expect(result.fremde.totalMann).toBe(0);
    expect(result.eigene.totalMann).toBe(6);
  });

  it('zählt eine taktische Einheit weiterhin zu den eigenen Kräften', () => {
    // Der Schalter hängt am Fahrzeug; eine Einheit kennt ihn nicht.
    const result = calculateStrength([
      { name: '1. Gruppe', type: 'tacticalUnit', mann: 8 } as any,
    ]);
    expect(result.eigene.totalMann).toBe(8);
    expect(result.fremde.rows).toHaveLength(0);
  });
});
