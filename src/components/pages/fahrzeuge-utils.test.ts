import { describe, it, expect } from 'vitest';
import { calculateStrength, filterStrength } from './fahrzeuge-utils';
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

describe('calculateStrength — Element-ID', () => {
  it('führt die ID des Elements an der Zeile', () => {
    const items = [
      { id: 'v1', name: 'TLF', type: 'vehicle' },
      { id: 'u1', name: '1. Zug', type: 'tacticalUnit' },
    ] as FirecallItem[];
    expect(calculateStrength(items).rows.map((r) => r.id)).toEqual(['v1', 'u1']);
  });
});

describe('filterStrength', () => {
  const items: FirecallItem[] = [
    { id: 'v1', name: 'TLF', fw: 'FF Neusiedl', type: 'vehicle', besatzung: '5', ats: 2 } as any,
    { id: 'v2', name: 'KLF', fw: 'FF Weiden', type: 'vehicle', besatzung: '3', ats: 0 } as any,
    { id: 'v3', name: 'RTW', fw: 'Rotes Kreuz', type: 'vehicle', besatzung: '1', fremd: 'true' } as any,
    { id: 'u1', name: '1. Gruppe', type: 'tacticalUnit', unitType: 'gruppe', mann: 8, ats: 4 } as any,
  ];
  const summary = calculateStrength(items);

  it('lässt ohne Suchbegriff alles stehen', () => {
    expect(filterStrength(summary, '')).toBe(summary);
    expect(filterStrength(summary, '   ')).toBe(summary);
  });

  it('findet nach Bezeichnung, ohne Groß- und Kleinschreibung', () => {
    const result = filterStrength(summary, 'tlf');
    expect(result.rows.map((r) => r.name)).toEqual(['TLF']);
  });

  it('findet nach Feuerwehr als Teilwort', () => {
    const result = filterStrength(summary, 'weid');
    expect(result.rows.map((r) => r.name)).toEqual(['KLF']);
  });

  it('findet nach dem Typ der Zeile', () => {
    const typ = summary.rows.find((r) => r.id === 'u1')!.typ;
    const result = filterStrength(summary, typ);
    expect(result.rows.map((r) => r.id)).toContain('u1');
  });

  it('verlangt jedes Wort des Suchbegriffs', () => {
    expect(filterStrength(summary, 'ff tlf').rows.map((r) => r.name)).toEqual(['TLF']);
    expect(filterStrength(summary, 'weiden tlf').rows).toEqual([]);
  });

  it('bezieht zusätzlichen Text je Zeile ein, etwa den Einsatzort', () => {
    const result = filterStrength(summary, 'hauptplatz', (row) =>
      row.id === 'v2' ? 'Keller Hauptplatz' : '',
    );
    expect(result.rows.map((r) => r.name)).toEqual(['KLF']);
  });

  it('rechnet die Summen über die gefilterten Zeilen', () => {
    const result = filterStrength(summary, 'ff');
    expect(result.totalUnits).toBe(2);
    expect(result.totalMann).toBe(6 + 4);
    expect(result.totalAts).toBe(2);
    expect(result.totalFw).toBe(2);
    expect(result.eigene.totalUnits).toBe(2);
    expect(result.fremde.rows).toEqual([]);
  });

  it('teilt gefilterte Fremdkräfte weiter ab', () => {
    const result = filterStrength(summary, 'kreuz');
    expect(result.fremde.rows.map((r) => r.name)).toEqual(['RTW']);
    expect(result.eigene.rows).toEqual([]);
  });
});

describe('calculateStrength — Fahrzeuge unter einer taktischen Einheit', () => {
  const zug = {
    id: 'u1',
    name: 'Zug Nord',
    type: 'tacticalUnit',
    mann: 20,
    ats: 9,
  } as FirecallItem;
  const tlf = {
    id: 'v1',
    name: 'TLF',
    type: 'vehicle',
    besatzung: '8',
    ats: 4,
    tacticalUnitId: 'u1',
  } as FirecallItem;
  const klf = {
    id: 'v2',
    name: 'KLF',
    type: 'vehicle',
    besatzung: '2',
    ats: 0,
    tacticalUnitId: 'u1',
  } as FirecallItem;

  it('reiht die Fahrzeuge direkt unter ihre Einheit', () => {
    const result = calculateStrength([tlf, zug, klf]);
    expect(result.rows.map((r) => r.id)).toEqual(['u1', 'v1', 'v2']);
    expect(result.rows[1].parentId).toBe('u1');
    expect(result.rows[2].parentId).toBe('u1');
    expect(result.rows[0].childCount).toBe(2);
  });

  it('nimmt als Stärke der Einheit die Summe ihrer Fahrzeuge', () => {
    const result = calculateStrength([zug, tlf, klf]);
    expect(result.rows[0].mann).toBe(9 + 3);
    expect(result.rows[0].ats).toBe(4);
  });

  it('zählt jede Person in der Gesamtsumme nur einmal', () => {
    const result = calculateStrength([zug, tlf, klf]);
    expect(result.totalMann).toBe(12);
    expect(result.totalAts).toBe(4);
    expect(result.totalUnits).toBe(3);
  });

  it('behält die gepflegte Stärke einer Einheit ohne Fahrzeuge', () => {
    const result = calculateStrength([zug]);
    expect(result.rows[0].mann).toBe(20);
    expect(result.rows[0].childCount).toBeUndefined();
  });

  it('führt ein Fahrzeug, dessen Einheit fehlt, ohne Einheit', () => {
    const result = calculateStrength([tlf]);
    expect(result.rows[0].parentId).toBeUndefined();
    expect(result.totalMann).toBe(9);
  });

  it('zählt eine Einheit aus lauter fremden Fahrzeugen zu den Fremdkräften', () => {
    const result = calculateStrength([
      zug,
      { ...tlf, fremd: 'true' } as FirecallItem,
    ]);
    expect(result.fremde.rows.map((r) => r.id)).toEqual(['u1', 'v1']);
    expect(result.eigene.rows).toEqual([]);
    expect(result.fremde.totalMann).toBe(9);
  });
});

describe('filterStrength — Einheiten mit Fahrzeugen', () => {
  const items = [
    { id: 'u1', name: 'Zug Nord', type: 'tacticalUnit' },
    { id: 'v1', name: 'TLF', type: 'vehicle', besatzung: '8', tacticalUnitId: 'u1' },
    { id: 'v2', name: 'KLF', type: 'vehicle', besatzung: '2', tacticalUnitId: 'u1' },
    { id: 'v3', name: 'RLF', type: 'vehicle', besatzung: '5' },
  ] as FirecallItem[];

  it('zeigt zur passenden Einheit ihre Fahrzeuge', () => {
    const result = filterStrength(calculateStrength(items), 'nord');
    expect(result.rows.map((r) => r.id)).toEqual(['u1', 'v1', 'v2']);
    expect(result.totalMann).toBe(12);
  });

  it('zeigt zum passenden Fahrzeug seine Einheit, ohne doppelt zu zählen', () => {
    const result = filterStrength(calculateStrength(items), 'TLF');
    expect(result.rows.map((r) => r.id)).toEqual(['u1', 'v1']);
    expect(result.totalMann).toBe(9);
  });
});

describe('calculateStrength — Einheiten unter Einheiten', () => {
  const bereitschaft = {
    id: 'b1',
    name: 'KHD Bereitschaft',
    type: 'tacticalUnit',
    unitType: 'bereitschaft',
    mann: 99,
  } as FirecallItem;
  const zug1 = { id: 'z1', name: '1. Zug', type: 'tacticalUnit', tacticalUnitId: 'b1' } as FirecallItem;
  const zug2 = {
    id: 'z2',
    name: '2. Zug',
    type: 'tacticalUnit',
    mann: 7,
    ats: 2,
    tacticalUnitId: 'b1',
  } as FirecallItem;
  const tlf = { id: 'v1', name: 'TLF', type: 'vehicle', besatzung: '8', ats: 4, tacticalUnitId: 'z1' } as FirecallItem;
  const klf = { id: 'v2', name: 'KLF', type: 'vehicle', besatzung: '2', tacticalUnitId: 'z1' } as FirecallItem;

  it('reiht Züge unter die Bereitschaft und Fahrzeuge unter ihren Zug', () => {
    const result = calculateStrength([klf, zug2, tlf, zug1, bereitschaft]);
    expect(result.rows.map((r) => [r.id, r.depth ?? 0])).toEqual([
      ['b1', 0],
      ['z2', 1],
      ['z1', 1],
      ['v2', 2],
      ['v1', 2],
    ]);
    expect(result.rows.find((r) => r.id === 'z1')?.parentId).toBe('b1');
    expect(result.rows.find((r) => r.id === 'b1')?.childCount).toBe(2);
  });

  it('rechnet die Stärke über alle Ebenen ohne Doppelzählung', () => {
    const result = calculateStrength([bereitschaft, zug1, zug2, tlf, klf]);
    const byId = new Map(result.rows.map((r) => [r.id, r]));
    // 1. Zug aus seinen Fahrzeugen, 2. Zug mit gepflegter Stärke
    expect(byId.get('z1')?.mann).toBe(9 + 3);
    expect(byId.get('b1')?.mann).toBe(12 + 7);
    expect(byId.get('b1')?.ats).toBe(4 + 2);
    expect(result.totalMann).toBe(19);
    expect(result.totalAts).toBe(6);
  });

  it('übersteht einen Zyklus in den Daten', () => {
    const a = { id: 'a', name: 'A', type: 'tacticalUnit', mann: 3, tacticalUnitId: 'b' } as FirecallItem;
    const b = { id: 'b', name: 'B', type: 'tacticalUnit', mann: 4, tacticalUnitId: 'a' } as FirecallItem;
    const result = calculateStrength([a, b]);
    expect(result.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(result.totalMann).toBe(7);
  });

  it('filtert mit der ganzen Kette darüber und dem Zweig darunter', () => {
    const summary = calculateStrength([bereitschaft, zug1, zug2, tlf, klf]);
    expect(filterStrength(summary, 'TLF').rows.map((r) => r.id)).toEqual(['b1', 'z1', 'v1']);
    expect(filterStrength(summary, 'TLF').totalMann).toBe(9);
    expect(filterStrength(summary, 'KHD').rows.map((r) => r.id)).toEqual([
      'b1',
      'z1',
      'v1',
      'v2',
      'z2',
    ]);
  });
});
