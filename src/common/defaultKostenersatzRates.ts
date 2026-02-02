/**
 * Default Kostenersatz (Cost Recovery) Rates
 *
 * Based on Burgenland fire brigade cost recovery regulations
 * Landesgesetzblatt Nr. 77/2023
 *
 * These rates are used to seed the Firestore database and can be
 * reset by admins if needed.
 */

import {
  KostenersatzRate,
  KostenersatzVehicle,
  KostenersatzVersion,
} from './kostenersatz';

export const DEFAULT_VERSION_ID = 'LGBl_77_2023';

export const DEFAULT_VERSION: KostenersatzVersion = {
  id: DEFAULT_VERSION_ID,
  name: 'LGBl. Nr. 77/2023',
  validFrom: '2023-11-07',
  isActive: true,
  createdAt: new Date().toISOString(),
  createdBy: 'system',
};

/**
 * Default tariff rates based on LGBl. Nr. 77/2023
 *
 * Categories:
 * Tarif A (Categories 1-5, 8-9):
 *   1 - Mannschaft und Fahrtkostenersatz
 *   2 - Fahrzeuge und Anhänger (pauschal: 5-12h)
 *   3 - Löschgeräte, Schläuche und Zubehör sowie Leitern (pauschal: 5-24h)
 *   4 - Geräte mit motorischem Antrieb (pauschal: 5-12h)
 *   5 - Füllen von Pressluftflaschen
 *   8 - Wasserdienst (pauschal: 5-24h)
 *   9 - Einsatzgeräte für den Gefährliche-Stoffe-Einsatz (pauschal: 5-24h)
 * Tarif B (Category 10):
 *   10 - Tarif für pauschalierte Beistellungen und Einsatzleistungen
 * Tarif D (Category 12):
 *   12 - Tarif für Verbrauchsmaterialien
 */
export const DEFAULT_RATES: Omit<KostenersatzRate, 'version' | 'validFrom'>[] =
  [
    // ==========================================================================
    // Category 1: Mannschaft und Fahrtkostenersatz (Personnel & Travel) - Tarif A
    // ==========================================================================
    {
      id: '1.01',
      category: 'A',
      categoryNumber: 1,
      categoryName: 'Mannschaft und Fahrtkostenersatz',
      description: 'Personalaufwand (Einsatz, Bereitschaftsdienste, usw.)',
      unit: 'pro Person & h',
      price: 32.4,
      isExtendable: false,
      sortOrder: 101,
    },
    {
      id: '1.02',
      category: 'A',
      categoryNumber: 1,
      categoryName: 'Mannschaft und Fahrtkostenersatz',
      description: 'Kommissionsdienst durch Feuerwehrorgane',
      unit: 'pro Person & h',
      price: 32.4,
      isExtendable: false,
      sortOrder: 102,
    },
    {
      id: '1.03',
      category: 'A',
      categoryNumber: 1,
      categoryName: 'Mannschaft und Fahrtkostenersatz',
      description:
        'Sachverständigentätigkeit durch Feuerwehrorgane (für Bauverhandlungen, Bauplatzerklärungen und dgl.)',
      unit: 'pro Person & h',
      price: 105.8,
      isExtendable: false,
      sortOrder: 103,
    },
    // {
    //   id: '1.04',
    //   category: 'A',
    //   categoryNumber: 1,
    //   categoryName: 'Mannschaft und Fahrtkostenersatz',
    //   description: 'Fahrtkostenersatz für Kommissionsdienst',
    //   unit: 'pro km',
    //   price: 0.42,
    //   isExtendable: false,
    //   sortOrder: 104,
    // },

    // ==========================================================================
    // Category 2: Fahrzeuge und Anhänger (Vehicles & Trailers) - Tarif A
    // ==========================================================================
    {
      id: '2.01',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Fahrzeuge bis 3,5 t Gesamtgewicht',
      unit: 'je Std / 5-12h pauschal',
      price: 63.7,
      pricePauschal: 318.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 201,
    },
    {
      id: '2.02',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Fahrzeuge über 3,5 t bis 5,5 t Gesamtgewicht',
      unit: 'je Std / 5-12h pauschal',
      price: 90.7,
      pricePauschal: 453.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 202,
    },
    {
      id: '2.03',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Fahrzeuge über 5,5 t bis 7,5 t Gesamtgewicht',
      unit: 'je Std / 5-12h pauschal',
      price: 106.9,
      pricePauschal: 534.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 203,
    },
    {
      id: '2.04',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Fahrzeuge über 7,5 t bis 16 t Gesamtgewicht',
      unit: 'je Std / 5-12h pauschal',
      price: 122.0,
      pricePauschal: 610.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 204,
    },
    {
      id: '2.05',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Fahrzeuge über 16 t bis 18 t Gesamtgewicht',
      unit: 'je Std / 5-12h pauschal',
      price: 137.1,
      pricePauschal: 685.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 205,
    },
    {
      id: '2.06',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Drehleiter, Teleskopmast- bzw. Gelenkbühnen',
      unit: 'je Std / 5-12h pauschal',
      price: 239.7,
      pricePauschal: 1198.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 206,
    },
    {
      id: '2.07',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'VF mit Gefahrgutausrüstung',
      unit: 'je Std / 5-12h pauschal',
      price: 123.1,
      pricePauschal: 615.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 207,
    },
    {
      id: '2.08',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'ULF, GTLF',
      unit: 'je Std / 5-12h pauschal',
      price: 197.6,
      pricePauschal: 988.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 208,
    },
    {
      id: '2.09',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description:
        'Rüstfahrzeug ohne Kran, LKW/WLF mit Kran bis 100 kNm Hubmoment',
      unit: 'je Std / 5-12h pauschal',
      price: 149.0,
      pricePauschal: 745.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 209,
    },
    {
      id: '2.10',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description:
        'Rüstfahrzeug mit Kran (SRF), LKW/WLF mit Kran über 100 kNm bis 300 kNm Hubmoment',
      unit: 'je Std / 5-12h pauschal',
      price: 181.4,
      pricePauschal: 907.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 210,
    },
    // {
    //   id: '2.11',
    //   category: 'A',
    //   categoryNumber: 2,
    //   categoryName: 'Fahrzeuge und Anhänger',
    //   description: 'Kranfahrzeug mit mehr als 300 kN Hubkraft',
    //   unit: 'je Std / 5-12h pauschal',
    //   price: 302.4,
    //   pricePauschal: 1512.0,
    //   isExtendable: false,
    //   sortOrder: 211,
    // },
    {
      id: '2.12',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Telelader, Teleskoplader inkl. Anbaugeräte',
      unit: 'je Std / 5-12h pauschal',
      price: 106.9,
      pricePauschal: 534.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 212,
    },
    {
      id: '2.13',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Anhänger bis 750 kg Nutzlast',
      unit: 'je Std / 5-12h pauschal',
      price: 17.2,
      pricePauschal: 86.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 213,
    },
    {
      id: '2.14',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Anhänger 750 – 3.500 kg Nutzlast',
      unit: 'je Std / 5-12h pauschal',
      price: 51.8,
      pricePauschal: 259.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 214,
    },
    {
      id: '2.15',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'LKW Anhänger über 3.500 kg Nutzlast',
      unit: 'je Std / 5-12h pauschal',
      price: 75.6,
      pricePauschal: 378.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 215,
    },
    {
      id: '2.16',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Wechselladeaufbau Atemluft, GSF, KSF, TDF',
      unit: 'je Std / 5-12h pauschal',
      price: 130.6,
      pricePauschal: 653.0,
      isExtendable: false,
      sortOrder: 216,
    },
    {
      id: '2.17',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description:
        'Wechselladeaufbau Einsatzleitung, Versorgung, Feuerwehrmedizinischer Dienst, Sanitär',
      unit: 'je Std / 5-12h pauschal',
      price: 58.3,
      pricePauschal: 291.5,
      isExtendable: false,
      sortOrder: 217,
    },
    {
      id: '2.18',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Wechselladeaufbau Schlauch, Tank, Bergung',
      unit: 'je Std / 5-12h pauschal',
      price: 29.1,
      pricePauschal: 145.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 218,
    },
    {
      id: '2.19',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Sonstiger Wechselladeaufbau (Pritsche, Mulde)',
      unit: 'je Std / 5-12h pauschal',
      price: 15.1,
      pricePauschal: 75.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 219,
    },
    {
      id: '2.20',
      category: 'A',
      categoryNumber: 2,
      categoryName: 'Fahrzeuge und Anhänger',
      description: 'Drohne inkl. Führungs- und Transportfahrzeug',
      unit: 'je Std / 5-12h pauschal',
      price: 90.7,
      pricePauschal: 453.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 220,
    },

    // ==========================================================================
    // Category 3: Löschgeräte, Schläuche und Zubehör sowie Leitern - Tarif A
    // ==========================================================================
    // {
    //   id: '3.01',
    //   category: 'A',
    //   categoryNumber: 3,
    //   categoryName: 'Löschgeräte, Schläuche und Zubehör sowie Leitern',
    //   description:
    //     'Trockenlöschgerät P50 (Lösch- und Treibmittel nach Tarif D), Wasserstrahlpumpe',
    //   unit: 'je Std / 5-12h pauschal',
    //   price: 16.2,
    //   pricePauschal: 81.0,
    //   isExtendable: false,
    //   sortOrder: 301,
    // },
    // {
    //   id: '3.02',
    //   category: 'A',
    //   categoryNumber: 3,
    //   categoryName: 'Löschgeräte, Schläuche und Zubehör sowie Leitern',
    //   description: 'Trockenlöschgerät TroLA 250 (Lösch- und Treibmittel nach Tarif D)',
    //   unit: 'je Std / 5-12h pauschal',
    //   price: 21.6,
    //   pricePauschal: 108.0,
    //   isExtendable: false,
    //   sortOrder: 302,
    // },
    {
      id: '3.03',
      category: 'A',
      categoryNumber: 3,
      categoryName: 'Löschgeräte, Schläuche und Zubehör sowie Leitern',
      description: 'Wasserführende Armaturen, Schläuche und Zubehör, je Stk',
      unit: 'je Std / 5-24h pauschal',
      price: 0,
      pricePauschal: 11.8,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 303,
    },
    // {
    //   id: '3.04',
    //   category: 'A',
    //   categoryNumber: 3,
    //   categoryName: 'Löschgeräte, Schläuche und Zubehör sowie Leitern',
    //   description: 'Fahrbare Schiebleiter (nicht hydraulisch)',
    //   unit: 'je Std / 5-24h pauschal',
    //   price: 33.4,
    //   pricePauschal: 167.0,
    //   pauschalHours: 24,
    //   isExtendable: false,
    //   sortOrder: 304,
    // },
    {
      id: '3.05',
      category: 'A',
      categoryNumber: 3,
      categoryName: 'Löschgeräte, Schläuche und Zubehör sowie Leitern',
      description: 'Tragbare Leiter, Strickleiter, Rettungsplattform',
      unit: 'je Std / 5-24h pauschal',
      price: 10.8,
      pricePauschal: 54.0,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 305,
    },

    // ==========================================================================
    // Category 4: Geräte mit motorischem Antrieb - Tarif A
    // ==========================================================================
    {
      id: '4.01',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Handgeführte Elektro- oder Akku-Werkzeuge',
      unit: 'je Std / 5-12h pauschal',
      price: 21.6,
      pricePauschal: 108.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 401,
    },
    {
      id: '4.02',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description:
        'Hochleistungslüfter - Turboventilator; Tauchpumpe unter 1.000 l/min, Wassersauger, Motorkettensäge, Ölumfüllpumpe, Benzinmotor-Trennschleifer, Leichtschaumgerät, Hochdruckreiniger',
      unit: 'je Std / 5-12h pauschal',
      price: 29.1,
      pricePauschal: 145.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 402,
    },
    {
      id: '4.03',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description:
        'Tauchpumpe von 1.000 l/min bis 2.000 l/min, Auspumpaggregat und Tragkraftspritze bis 1.000 l/min, Stromerzeuger bis 5 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 38.8,
      pricePauschal: 194.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 403,
    },
    {
      id: '4.04',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description:
        'Tauchpumpe über 2.000 l/min, Auspumpaggregat und Tragkraftspritze über 1.000 l/min, Stromerzeuger 5 kVA bis 12 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 51.8,
      pricePauschal: 259.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 404,
    },
    {
      id: '4.05',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Stromerzeuger von 12 kVA - 20 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 63.7,
      pricePauschal: 318.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 405,
    },
    {
      id: '4.06',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Stromerzeuger von 21 kVA – 50 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 75.6,
      pricePauschal: 378.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 406,
    },
    {
      id: '4.07',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Stromerzeuger von 51 kVA – 150 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 87.4,
      pricePauschal: 437.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 407,
    },
    {
      id: '4.08',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Stromerzeuger über 150 kVA',
      unit: 'je Std / 5-12h pauschal',
      price: 110.1,
      pricePauschal: 550.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 408,
    },
    {
      id: '4.09',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description:
        'Akku-/Hydr. Rettungssatz (einschließlich Hydraulikschere und -spreizer) ohne Stromversorgung',
      unit: 'je Std / 5-12h pauschal',
      price: 27.0,
      pricePauschal: 135.0,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 409,
    },
    {
      id: '4.10',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description: 'Auspumpaggregat über 5.000 l/min',
      unit: 'je Std / 5-12h pauschal',
      price: 110.1,
      pricePauschal: 550.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 410,
    },
    {
      id: '4.11',
      category: 'A',
      categoryNumber: 4,
      categoryName: 'Geräte mit motorischem Antrieb',
      description:
        'Löschunterstützungsfahrzeug (LUF) inkl. Transportanhänger oder Fahrzeug',
      unit: 'je Std / 5-12h pauschal',
      price: 90.7,
      pricePauschal: 453.5,
      pauschalHours: 12,
      isExtendable: false,
      sortOrder: 411,
    },

    // ==========================================================================
    // Category 5: Füllen von Pressluftflaschen - Tarif A
    // ==========================================================================
    {
      id: '5.01',
      category: 'A',
      categoryNumber: 5,
      categoryName: 'Füllen von Pressluftflaschen',
      description: 'Füllen einer Pressluftflasche bis 6 Liter',
      unit: 'je Füllung',
      price: 4.3,
      isExtendable: false,
      sortOrder: 501,
    },
    {
      id: '5.02',
      category: 'A',
      categoryNumber: 5,
      categoryName: 'Füllen von Pressluftflaschen',
      description: 'Füllen einer Pressluftflasche über 6 Liter',
      unit: 'je Füllung',
      price: 6.4,
      isExtendable: false,
      sortOrder: 502,
    },

    // ==========================================================================
    // Category 8: Wasserdienst - Tarif A
    // ==========================================================================
    {
      id: '8.01',
      category: 'A',
      categoryNumber: 8,
      categoryName: 'Wasserdienst',
      description: 'Arbeits- bzw. Mehrzweckboot',
      unit: 'je Std / 5-24h pauschal',
      price: 106.9,
      pricePauschal: 534.5,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 801,
    },
    {
      id: '8.02',
      category: 'A',
      categoryNumber: 8,
      categoryName: 'Wasserdienst',
      description: 'Zille (ohne Motor)',
      unit: 'je Std / 5-24h pauschal',
      price: 15.1,
      pricePauschal: 75.5,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 802,
    },
    {
      id: '8.03',
      category: 'A',
      categoryNumber: 8,
      categoryName: 'Wasserdienst',
      description: 'Schlauchboot, Kunststoffboot (mit Motor)',
      unit: 'je Std / 5-24h pauschal',
      price: 38.8,
      pricePauschal: 194.0,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 803,
    },
    {
      id: '8.04',
      category: 'A',
      categoryNumber: 8,
      categoryName: 'Wasserdienst',
      description: 'Schlauchboot, Kunststoffboot (ohne Motor)',
      unit: 'je Std / 5-24h pauschal',
      price: 15.1,
      pricePauschal: 75.5,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 804,
    },

    // ==========================================================================
    // Category 9: Einsatzgeräte für den Gefährliche-Stoffe-Einsatz - Tarif A
    // ==========================================================================
    {
      id: '9.01',
      category: 'A',
      categoryNumber: 9,
      categoryName: 'Einsatzgeräte für den Gefährliche-Stoffe-Einsatz',
      description:
        'Explosimeter, Gasspürgerät (Prüfröhrchen als Verbrauchsmaterial)',
      unit: 'je Std / 5-24h pauschal',
      price: 0,
      pricePauschal: 50.7,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 901,
    },
    {
      id: '9.02',
      category: 'A',
      categoryNumber: 9,
      categoryName: 'Einsatzgeräte für den Gefährliche-Stoffe-Einsatz',
      description: 'Pauschale für alle übrigen Messgeräte (je Gerät)',
      unit: 'je Std / 5-24h pauschal',
      price: 0,
      pricePauschal: 75.6,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 902,
    },
    {
      id: '9.03',
      category: 'A',
      categoryNumber: 9,
      categoryName: 'Einsatzgeräte für den Gefährliche-Stoffe-Einsatz',
      description: 'Strahlenmessgerät',
      unit: 'je Std / 5-24h pauschal',
      price: 21.6,
      pricePauschal: 108.0,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 903,
    },
    {
      id: '9.04',
      category: 'A',
      categoryNumber: 9,
      categoryName: 'Einsatzgeräte für den Gefährliche-Stoffe-Einsatz',
      description: 'Ölsperren (je 10 lfm)',
      unit: 'je Std / 5-24h pauschal',
      price: 0,
      pricePauschal: 144.7,
      pauschalHours: 24,
      isExtendable: false,
      sortOrder: 904,
    },

    // ==========================================================================
    // Category 10: Tarif für pauschalierte Beistellungen und Einsatzleistungen - Tarif B
    // ==========================================================================
    {
      id: '10.01',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description:
        'Aufsperren einer Wohnung (gleichgültig ob durch Nachschlüssel, Fenstereinstieg o.ä.)',
      unit: 'nach Aufwand, mind. 55 €',
      price: 0,
      pricePauschal: 55.0,
      isExtendable: true,
      sortOrder: 1001,
    },
    {
      id: '10.02',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description: 'Freimachen eines Verkehrsweges (§ 89a StVO 1960)',
      unit: 'nach Aufwand',
      price: 0,
      isExtendable: true,
      sortOrder: 1002,
    },
    {
      id: '10.03',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description: 'Anschleppen eines Kraftfahrzeuges',
      unit: 'nach Aufwand, mind. 72,30 €',
      price: 0,
      pricePauschal: 72.3,
      isExtendable: true,
      sortOrder: 1003,
    },
    {
      id: '10.04',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description:
        'Personenbefreiung aus Aufzügen (max. 30 Min., darüber hinaus nach Aufwand)',
      unit: '259,20 € bzw. nach Aufwand',
      price: 0,
      pricePauschal: 259.2,
      isExtendable: true,
      sortOrder: 1004,
    },
    {
      id: '10.05',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description:
        'Wassertransport nur Tanklöschfahrzeug bis 2.000 l mit Fahrer (Pauschale)',
      unit: '73,40 € je Fahrt bzw. nach Aufwand',
      price: 0,
      pricePauschal: 73.4,
      isExtendable: true,
      sortOrder: 1005,
    },
    {
      id: '10.06',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description:
        'Wassertransport nur Tanklöschfahrzeug > 2.000 – 4.000 l mit Fahrer (Pauschale)',
      unit: '99,30 € je Fahrt bzw. nach Aufwand',
      price: 0,
      pricePauschal: 99.3,
      isExtendable: true,
      sortOrder: 1006,
    },
    {
      id: '10.07',
      category: 'B',
      categoryNumber: 10,
      categoryName:
        'Tarif für pauschalierte Beistellungen und Einsatzleistungen',
      description:
        'Wassertransport nur Tanklöschfahrzeug > 4.000 – 10.000 l mit Fahrer (Pauschale)',
      unit: '129,60 € je Fahrt bzw. nach Aufwand',
      price: 0,
      pricePauschal: 129.6,
      isExtendable: true,
      sortOrder: 1007,
    },

    // ==========================================================================
    // Category 12: Tarif für Verbrauchsmaterialien - Tarif D
    // ==========================================================================
    {
      id: '12.01',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description:
        'Kraftstoffe, Öle, Reinigungsmittel (zB Benzin, Gemisch, Dieselkraftstoff, Motoröl, Petroleum)',
      unit: 'Die Berechnung erfolgt zu den Tagespreisen',
      price: 1.8,
      isExtendable: true,
      sortOrder: 1201,
    },
    {
      id: '12.02',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Pölzmaterial (zB Gerüstklammer, Holz jeder Art)',
      unit: 'Die Berechnung erfolgt zu den Tagespreisen',
      price: 0,
      isExtendable: true,
      sortOrder: 1202,
    },
    {
      id: '12.03',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description:
        'Atemschutzmaterial (zB Alkalipatrone für Sauerstoffschutzgerät, Alkalipatrone für Tauchgerät, Atemfilter, Fluchthauben)',
      unit: 'Die Berechnung erfolgt zu den Tagespreisen',
      price: 0,
      isExtendable: true,
      sortOrder: 1203,
    },
    {
      id: '12.04',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description:
        'Sonstiges Verbrauchsmaterial (zB Schweißgas, Löschpulver, Netzmittel, Bindemittel jeder Art, Ölsaugmaterial [Sorbtücher, -watte, -netzsperre], Sägespäne, Torfmull, Pressluft, Sauerstoff - med. rein, Prüfröhrchen, Schaummittel, Stickstoff, Trennscheiben, Treibladung für Leinenschießgerät usw.)',
      unit: 'Die Berechnung erfolgt zu den Tagespreisen',
      price: 0,
      isExtendable: true,
      sortOrder: 1204,
    },
    {
      id: '12.05',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Sack Ölbindemittel',
      unit: 'pro Sack',
      price: 49.0,
      isExtendable: false,
      sortOrder: 1205,
    },
    {
      id: '12.06',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Einweg Overall Flüssigkeitsbeständig',
      unit: 'pro Stück',
      price: 39.0,
      isExtendable: false,
      sortOrder: 1206,
    },
    {
      id: '12.07',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Einweg Overall Schutzstuffe 2 (Apollo)',
      unit: 'pro Stück',
      price: 81.6,
      isExtendable: false,
      sortOrder: 1207,
    },
    {
      id: '12.08',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Schutzanzug Splash 600 Mehrweg (Stufe 2)',
      unit: 'pro Stück',
      price: 246.0,
      isExtendable: false,
      sortOrder: 1208,
    },
    {
      id: '12.09',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Apollo 4000 Schutzanzug LFK',
      unit: 'pro Stück',
      price: 177.6,
      isExtendable: false,
      sortOrder: 1209,
    },
    {
      id: '12.10',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Kombifilter A2B2E2K2HgP3 R SL',
      unit: 'pro Stück',
      price: 43.8,
      isExtendable: false,
      sortOrder: 1210,
    },
    {
      id: '12.11',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Chemalikenbinder',
      unit: 'pro Stück',
      price: 60.0,
      isExtendable: false,
      sortOrder: 1211,
    },
    {
      id: '12.12',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Dekon Tauchpumpe',
      unit: 'pro Stück',
      price: 100.0,
      isExtendable: false,
      sortOrder: 1212,
    },
    {
      id: '12.13',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Adapter PA auf RA für Filtermaske',
      unit: 'pro Stück',
      price: 51.9,
      isExtendable: false,
      sortOrder: 1213,
    },
    {
      id: '12.14',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Handschuhe AlphaTec (Chemikalienbeständig)',
      unit: 'pro Stück',
      price: 19.2,
      isExtendable: false,
      sortOrder: 1214,
    },
    {
      id: '12.15',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Reinigungspauschale',
      unit: 'pro Stück',
      price: 500.0,
      isExtendable: false,
      sortOrder: 1215,
    },
    {
      id: '12.16',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Entsorgungspauschale',
      unit: 'pro Stück',
      price: 200.0,
      isExtendable: false,
      sortOrder: 1216,
    },
    {
      id: '12.17',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Europalette',
      unit: 'pro Stück',
      price: 50.0,
      isExtendable: false,
      sortOrder: 1217,
    },
    {
      id: '12.18',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: '300 Liter IBC Container (UN)',
      unit: 'pro Stück',
      price: 190.8,
      isExtendable: false,
      sortOrder: 1218,
    },
    {
      id: '12.19',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: '600 Liter IBC Container (UN)',
      unit: 'pro Stück',
      price: 258.0,
      isExtendable: false,
      sortOrder: 1219,
    },
    {
      id: '12.20',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: '1000 Liter IBC Container (UN)',
      unit: 'pro Stück',
      price: 380.4,
      isExtendable: false,
      sortOrder: 1220,
    },
    {
      id: '12.21',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Prüfung Schutzstufe 3',
      unit: 'pro Stück',
      price: 370.0,
      isExtendable: false,
      sortOrder: 1221,
    },
    {
      id: '12.22',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Kettengehänge 2-Strang (4m)',
      unit: 'pro Stück',
      price: 600.0,
      isExtendable: false,
      sortOrder: 1222,
    },
    {
      id: '12.23',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Unterlegplane',
      unit: 'pro Stück',
      price: 50.0,
      isExtendable: false,
      sortOrder: 1223,
    },
    {
      id: '12.24',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'Fass 60l',
      unit: 'pro Stück',
      price: 60.0,
      isExtendable: false,
      sortOrder: 1224,
    },
    {
      id: '12.25',
      category: 'D',
      categoryNumber: 12,
      categoryName: 'Tarif für Verbrauchsmaterialien',
      description: 'SPC 4800 - Schutzanzug',
      unit: 'pro Stück',
      price: 280.0,
      isExtendable: false,
      sortOrder: 1225,
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
  rates: KostenersatzRate[],
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
      value.sort((a, b) => a.sortOrder - b.sortOrder),
    );
  });

  return grouped;
}

/**
 * Get unique category names with their numbers
 */
export function getCategoryList(
  rates: KostenersatzRate[],
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

// ============================================================================
// Default Vehicles
// ============================================================================

export const DEFAULT_VEHICLES: Omit<KostenersatzVehicle, 'id'>[] = [
  {
    name: 'KDTFA',
    rateId: '2.01',
    description: 'Kommando Neusiedl am See',
    sortOrder: 1,
  },
  {
    name: 'RLFA 3000/100',
    rateId: '2.05',
    description: 'RüstLösch Neusiedl am See',
    sortOrder: 2,
  },
  {
    name: 'TLFA 4000',
    rateId: '2.05',
    description: 'Tank1 Neusiedl am See',
    sortOrder: 3,
  },
  {
    name: 'TB 23/12',
    rateId: '2.06',
    description: 'Hubsteiger Neusiedl am See',
    sortOrder: 4,
  },
  {
    name: 'SRF',
    rateId: '2.10',
    description: 'Rüst Neusiedl am See',
    sortOrder: 5,
  },
  {
    name: 'KRF-S',
    rateId: '2.02',
    description: 'Kleinrüst Neusiedl am See',
    sortOrder: 6,
  },
  {
    name: 'MTFA',
    rateId: '2.01',
    description: 'MTF Neusiedl am See',
    sortOrder: 7,
  },
  {
    name: 'VF - Sprinter',
    rateId: '2.02',
    description: 'VF Neusiedl am See',
    sortOrder: 8,
  },
  {
    name: 'VF-KAT',
    rateId: '2.04',
    description: 'Kat LKW Neusiedl am See',
    sortOrder: 9,
  },
  {
    name: 'WLF-K',
    rateId: '2.10',
    description: 'Wechselladefahrzeug mit Kran',
    sortOrder: 10,
  },
  {
    name: 'WLA-Bergung',
    rateId: '2.18',
    description: 'Bergemulde',
    sortOrder: 11,
  },
  {
    name: 'WLA-Logistik',
    rateId: '2.17',
    description: 'Logistik Mulde mit Schadstoffausrüstung',
    sortOrder: 12,
  },
  {
    name: 'Öl Einachsanhänger',
    rateId: '2.13',
    sortOrder: 13,
  },
  {
    name: 'ATS Einachsanhänger',
    rateId: '2.13',
    sortOrder: 14,
  },
  {
    name: 'Bootsanhänger',
    rateId: '2.14',
    sortOrder: 15,
  },
  {
    name: 'Ölsperrenanhänger',
    rateId: '2.14',
    description: 'Ölsperranhänger',
    sortOrder: 16,
  },
];

/**
 * Generate vehicle ID from name (lowercase, replace spaces with hyphens)
 */
export function generateVehicleId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (match) => {
      const replacements: Record<string, string> = {
        ä: 'ae',
        ö: 'oe',
        ü: 'ue',
        ß: 'ss',
      };
      return replacements[match] || match;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get default vehicles with generated IDs
 */
export function getDefaultVehicles(): KostenersatzVehicle[] {
  return DEFAULT_VEHICLES.map((vehicle) => ({
    ...vehicle,
    id: generateVehicleId(vehicle.name),
  }));
}
