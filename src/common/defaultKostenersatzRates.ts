/**
 * Default Kostenersatz (Cost Recovery) Rates
 *
 * Based on Burgenland fire brigade cost recovery regulations
 * Landesgesetzblatt Nr. 77/2023
 *
 * These rates are used to seed the Firestore database and can be
 * reset by admins if needed.
 */

import { KostenersatzRate, KostenersatzVersion } from './kostenersatz';

export const DEFAULT_VERSION_ID = 'LGBl_77_2023';

export const DEFAULT_VERSION: KostenersatzVersion = {
  id: DEFAULT_VERSION_ID,
  name: 'LGBl. Nr. 77/2023',
  validFrom: '2023-01-01',
  isActive: true,
  createdAt: new Date().toISOString(),
  createdBy: 'system',
};

/**
 * Default tariff rates based on LGBl. Nr. 77/2023
 *
 * Categories:
 * A - Personalaufwand (Personnel costs)
 * B - Fahrzeuge und Geräte (Vehicles and equipment)
 * C - Verbrauchsmaterial (Consumables)
 * D - Sonstige Leistungen (Other services)
 *
 * Category numbers 1-12 map to specific tariff sections
 */
export const DEFAULT_RATES: Omit<KostenersatzRate, 'version' | 'validFrom'>[] = [
  // ==========================================================================
  // Category 1: Mannschaft und Fahrtkostenersatz (Personnel & Travel)
  // ==========================================================================
  {
    id: '1.01',
    category: 'A',
    categoryNumber: 1,
    categoryName: 'Mannschaft und Fahrtkostenersatz',
    description: 'Personalaufwand je Person',
    unit: 'Person/Stunde',
    price: 32.40,
    pricePauschal: 162.00,
    isExtendable: false,
    sortOrder: 1,
  },
  {
    id: '1.02',
    category: 'A',
    categoryNumber: 1,
    categoryName: 'Mannschaft und Fahrtkostenersatz',
    description: 'Kommissionsdienst je Person',
    unit: 'Person/Stunde',
    price: 48.60,
    pricePauschal: 243.00,
    isExtendable: false,
    sortOrder: 2,
  },

  // ==========================================================================
  // Category 2: Fahrzeuge und Anhänger (Vehicles & Trailers)
  // ==========================================================================
  {
    id: '2.01',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Kommandofahrzeug (KDO)',
    unit: 'Fahrzeug/Stunde',
    price: 21.60,
    pricePauschal: 108.00,
    isExtendable: false,
    sortOrder: 10,
  },
  {
    id: '2.02',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Mannschaftstransportfahrzeug (MTF)',
    unit: 'Fahrzeug/Stunde',
    price: 27.00,
    pricePauschal: 135.00,
    isExtendable: false,
    sortOrder: 11,
  },
  {
    id: '2.03',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Kleinlöschfahrzeug (KLF)',
    unit: 'Fahrzeug/Stunde',
    price: 43.20,
    pricePauschal: 216.00,
    isExtendable: false,
    sortOrder: 12,
  },
  {
    id: '2.04',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Löschfahrzeug (LF)',
    unit: 'Fahrzeug/Stunde',
    price: 54.00,
    pricePauschal: 270.00,
    isExtendable: false,
    sortOrder: 13,
  },
  {
    id: '2.05',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Tanklöschfahrzeug (TLF)',
    unit: 'Fahrzeug/Stunde',
    price: 63.70,
    pricePauschal: 318.50,
    isExtendable: false,
    sortOrder: 14,
  },
  {
    id: '2.06',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Rüstlöschfahrzeug (RLF)',
    unit: 'Fahrzeug/Stunde',
    price: 75.60,
    pricePauschal: 378.00,
    isExtendable: false,
    sortOrder: 15,
  },
  {
    id: '2.07',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Schweres Rüstfahrzeug (SRF)',
    unit: 'Fahrzeug/Stunde',
    price: 86.40,
    pricePauschal: 432.00,
    isExtendable: false,
    sortOrder: 16,
  },
  {
    id: '2.08',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Hubrettungsfahrzeug (DL/TMB)',
    unit: 'Fahrzeug/Stunde',
    price: 108.00,
    pricePauschal: 540.00,
    isExtendable: false,
    sortOrder: 17,
  },
  {
    id: '2.09',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Wechselladefahrzeug (WLF)',
    unit: 'Fahrzeug/Stunde',
    price: 64.80,
    pricePauschal: 324.00,
    isExtendable: false,
    sortOrder: 18,
  },
  {
    id: '2.10',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Versorgungsfahrzeug (VF)',
    unit: 'Fahrzeug/Stunde',
    price: 43.20,
    pricePauschal: 216.00,
    isExtendable: false,
    sortOrder: 19,
  },
  {
    id: '2.11',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Lastfahrzeug (LKW)',
    unit: 'Fahrzeug/Stunde',
    price: 54.00,
    pricePauschal: 270.00,
    isExtendable: false,
    sortOrder: 20,
  },
  {
    id: '2.12',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Anhänger',
    unit: 'Anhänger/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 21,
  },
  {
    id: '2.13',
    category: 'B',
    categoryNumber: 2,
    categoryName: 'Fahrzeuge und Anhänger',
    description: 'Boot',
    unit: 'Boot/Stunde',
    price: 32.40,
    pricePauschal: 162.00,
    isExtendable: false,
    sortOrder: 22,
  },

  // ==========================================================================
  // Category 3: Löschgeräte, Schläuche und Armaturen
  // ==========================================================================
  {
    id: '3.01',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Tragkraftspritze (TS)',
    unit: 'Gerät/Stunde',
    price: 16.20,
    pricePauschal: 81.00,
    isExtendable: false,
    sortOrder: 30,
  },
  {
    id: '3.02',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Tauchpumpe',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 31,
  },
  {
    id: '3.03',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Druckschlauch B (je angefangene 20m)',
    unit: 'Stück/Einsatz',
    price: 5.40,
    isExtendable: false,
    sortOrder: 32,
  },
  {
    id: '3.04',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Druckschlauch C (je angefangene 15m)',
    unit: 'Stück/Einsatz',
    price: 4.30,
    isExtendable: false,
    sortOrder: 33,
  },
  {
    id: '3.05',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Saugschlauch (je angefangene 2m)',
    unit: 'Stück/Einsatz',
    price: 3.20,
    isExtendable: false,
    sortOrder: 34,
  },
  {
    id: '3.06',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Strahlrohr',
    unit: 'Stück/Einsatz',
    price: 2.70,
    isExtendable: false,
    sortOrder: 35,
  },
  {
    id: '3.07',
    category: 'B',
    categoryNumber: 3,
    categoryName: 'Löschgeräte, Schläuche und Armaturen',
    description: 'Wasserwerfer',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 36,
  },

  // ==========================================================================
  // Category 4: Atemschutz und Chemikalienschutz
  // ==========================================================================
  {
    id: '4.01',
    category: 'B',
    categoryNumber: 4,
    categoryName: 'Atemschutz und Chemikalienschutz',
    description: 'Pressluftatmer (PA)',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 40,
  },
  {
    id: '4.02',
    category: 'B',
    categoryNumber: 4,
    categoryName: 'Atemschutz und Chemikalienschutz',
    description: 'Chemikalienschutzanzug (CSA)',
    unit: 'Anzug/Einsatz',
    price: 54.00,
    isExtendable: false,
    sortOrder: 41,
  },
  {
    id: '4.03',
    category: 'B',
    categoryNumber: 4,
    categoryName: 'Atemschutz und Chemikalienschutz',
    description: 'Atemluftflasche (Füllung)',
    unit: 'Flasche',
    price: 10.80,
    isExtendable: false,
    sortOrder: 42,
  },

  // ==========================================================================
  // Category 5: Technische Geräte
  // ==========================================================================
  {
    id: '5.01',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Hydraulisches Rettungsgerät (Satz)',
    unit: 'Satz/Stunde',
    price: 21.60,
    pricePauschal: 108.00,
    isExtendable: false,
    sortOrder: 50,
  },
  {
    id: '5.02',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Motorkettensäge',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 51,
  },
  {
    id: '5.03',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Trennschleifer',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 52,
  },
  {
    id: '5.04',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Stromaggregat',
    unit: 'Gerät/Stunde',
    price: 16.20,
    pricePauschal: 81.00,
    isExtendable: false,
    sortOrder: 53,
  },
  {
    id: '5.05',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Lichtmast/Beleuchtungssatz',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 54,
  },
  {
    id: '5.06',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Lüfter',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 55,
  },
  {
    id: '5.07',
    category: 'B',
    categoryNumber: 5,
    categoryName: 'Technische Geräte',
    description: 'Wärmebildkamera',
    unit: 'Gerät/Stunde',
    price: 16.20,
    pricePauschal: 81.00,
    isExtendable: false,
    sortOrder: 56,
  },

  // ==========================================================================
  // Category 6: Absperr- und Sicherungsmaterial
  // ==========================================================================
  {
    id: '6.01',
    category: 'B',
    categoryNumber: 6,
    categoryName: 'Absperr- und Sicherungsmaterial',
    description: 'Verkehrsleitkegel (je 10 Stück)',
    unit: 'Satz/Einsatz',
    price: 5.40,
    isExtendable: false,
    sortOrder: 60,
  },
  {
    id: '6.02',
    category: 'B',
    categoryNumber: 6,
    categoryName: 'Absperr- und Sicherungsmaterial',
    description: 'Warnleuchte',
    unit: 'Stück/Einsatz',
    price: 2.70,
    isExtendable: false,
    sortOrder: 61,
  },
  {
    id: '6.03',
    category: 'B',
    categoryNumber: 6,
    categoryName: 'Absperr- und Sicherungsmaterial',
    description: 'Absperrband (je 100m)',
    unit: 'Rolle',
    price: 5.40,
    isExtendable: false,
    sortOrder: 62,
  },

  // ==========================================================================
  // Category 7: Sanitätsmaterial
  // ==========================================================================
  {
    id: '7.01',
    category: 'C',
    categoryNumber: 7,
    categoryName: 'Sanitätsmaterial',
    description: 'Erste-Hilfe-Koffer (Verbrauch)',
    unit: 'pauschal',
    price: 27.00,
    isExtendable: false,
    sortOrder: 70,
  },
  {
    id: '7.02',
    category: 'C',
    categoryNumber: 7,
    categoryName: 'Sanitätsmaterial',
    description: 'Krankentrage',
    unit: 'Stück/Einsatz',
    price: 5.40,
    isExtendable: false,
    sortOrder: 71,
  },

  // ==========================================================================
  // Category 8: Löschmittel
  // ==========================================================================
  {
    id: '8.01',
    category: 'C',
    categoryNumber: 8,
    categoryName: 'Löschmittel',
    description: 'Wasser (je 1000 Liter)',
    unit: '1000 Liter',
    price: 5.40,
    isExtendable: false,
    sortOrder: 80,
  },
  {
    id: '8.02',
    category: 'C',
    categoryNumber: 8,
    categoryName: 'Löschmittel',
    description: 'Schaummittel (je Liter)',
    unit: 'Liter',
    price: 10.80,
    isExtendable: false,
    sortOrder: 81,
  },
  {
    id: '8.03',
    category: 'C',
    categoryNumber: 8,
    categoryName: 'Löschmittel',
    description: 'Löschpulver (je kg)',
    unit: 'kg',
    price: 8.10,
    isExtendable: false,
    sortOrder: 82,
  },
  {
    id: '8.04',
    category: 'C',
    categoryNumber: 8,
    categoryName: 'Löschmittel',
    description: 'CO2 (je kg)',
    unit: 'kg',
    price: 10.80,
    isExtendable: false,
    sortOrder: 83,
  },

  // ==========================================================================
  // Category 9: Bindemittel und Ölsperren
  // ==========================================================================
  {
    id: '9.01',
    category: 'C',
    categoryNumber: 9,
    categoryName: 'Bindemittel und Ölsperren',
    description: 'Ölbindemittel (je 25 kg Sack)',
    unit: 'Sack',
    price: 27.00,
    isExtendable: false,
    sortOrder: 90,
  },
  {
    id: '9.02',
    category: 'C',
    categoryNumber: 9,
    categoryName: 'Bindemittel und Ölsperren',
    description: 'Ölsperre (je laufenden Meter)',
    unit: 'Meter',
    price: 10.80,
    isExtendable: false,
    sortOrder: 91,
  },
  {
    id: '9.03',
    category: 'C',
    categoryNumber: 9,
    categoryName: 'Bindemittel und Ölsperren',
    description: 'Ölschlängel',
    unit: 'Stück',
    price: 21.60,
    isExtendable: false,
    sortOrder: 92,
  },

  // ==========================================================================
  // Category 10: Abrollbehälter und Container
  // ==========================================================================
  {
    id: '10.01',
    category: 'B',
    categoryNumber: 10,
    categoryName: 'Abrollbehälter und Container',
    description: 'Abrollbehälter Atemschutz (AB-AS)',
    unit: 'Behälter/Stunde',
    price: 32.40,
    pricePauschal: 162.00,
    isExtendable: false,
    sortOrder: 100,
  },
  {
    id: '10.02',
    category: 'B',
    categoryNumber: 10,
    categoryName: 'Abrollbehälter und Container',
    description: 'Abrollbehälter Gefahrgut (AB-G)',
    unit: 'Behälter/Stunde',
    price: 43.20,
    pricePauschal: 216.00,
    isExtendable: false,
    sortOrder: 101,
  },
  {
    id: '10.03',
    category: 'B',
    categoryNumber: 10,
    categoryName: 'Abrollbehälter und Container',
    description: 'Abrollbehälter Rüst (AB-R)',
    unit: 'Behälter/Stunde',
    price: 32.40,
    pricePauschal: 162.00,
    isExtendable: false,
    sortOrder: 102,
  },
  {
    id: '10.04',
    category: 'B',
    categoryNumber: 10,
    categoryName: 'Abrollbehälter und Container',
    description: 'Abrollbehälter Tank (AB-Tank)',
    unit: 'Behälter/Stunde',
    price: 27.00,
    pricePauschal: 135.00,
    isExtendable: false,
    sortOrder: 103,
  },
  {
    id: '10.05',
    category: 'B',
    categoryNumber: 10,
    categoryName: 'Abrollbehälter und Container',
    description: 'Sonstiger Abrollbehälter',
    unit: 'Behälter/Stunde',
    price: 21.60,
    pricePauschal: 108.00,
    isExtendable: false,
    sortOrder: 104,
  },

  // ==========================================================================
  // Category 11: Sondergeräte
  // ==========================================================================
  {
    id: '11.01',
    category: 'B',
    categoryNumber: 11,
    categoryName: 'Sondergeräte',
    description: 'Drohne',
    unit: 'Gerät/Stunde',
    price: 21.60,
    pricePauschal: 108.00,
    isExtendable: false,
    sortOrder: 110,
  },
  {
    id: '11.02',
    category: 'B',
    categoryNumber: 11,
    categoryName: 'Sondergeräte',
    description: 'Messgeräte (Gasmessgerät etc.)',
    unit: 'Gerät/Stunde',
    price: 10.80,
    pricePauschal: 54.00,
    isExtendable: false,
    sortOrder: 111,
  },

  // ==========================================================================
  // Category 12: Sonstige Leistungen (Tarif D - Extendable)
  // ==========================================================================
  {
    id: '12.01',
    category: 'D',
    categoryNumber: 12,
    categoryName: 'Sonstige Leistungen',
    description: 'Sonstige Leistungen nach Aufwand',
    unit: 'pauschal',
    price: 0,
    isExtendable: true,
    sortOrder: 120,
  },
];

/**
 * Get default rates with version information included
 */
export function getDefaultRatesWithVersion(): KostenersatzRate[] {
  return DEFAULT_RATES.map((rate) => ({
    ...rate,
    version: DEFAULT_VERSION_ID,
    validFrom: DEFAULT_VERSION.validFrom,
  }));
}

/**
 * Get rates grouped by category number
 */
export function groupRatesByCategory(
  rates: KostenersatzRate[]
): Map<number, KostenersatzRate[]> {
  const grouped = new Map<number, KostenersatzRate[]>();

  for (const rate of rates) {
    const existing = grouped.get(rate.categoryNumber) || [];
    existing.push(rate);
    grouped.set(rate.categoryNumber, existing);
  }

  // Sort each group by sortOrder
  grouped.forEach((value, key) => {
    grouped.set(
      key,
      value.sort((a, b) => a.sortOrder - b.sortOrder)
    );
  });

  return grouped;
}

/**
 * Get unique category names with their numbers
 */
export function getCategoryList(
  rates: KostenersatzRate[]
): Array<{ number: number; name: string }> {
  const seen = new Set<number>();
  const categories: Array<{ number: number; name: string }> = [];

  for (const rate of rates.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!seen.has(rate.categoryNumber)) {
      seen.add(rate.categoryNumber);
      categories.push({
        number: rate.categoryNumber,
        name: rate.categoryName,
      });
    }
  }

  return categories;
}
