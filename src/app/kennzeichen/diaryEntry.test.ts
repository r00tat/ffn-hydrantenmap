import { describe, it, expect } from 'vitest';
import {
  buildKennzeichenDiaryEntry,
  KennzeichenDiaryLabels,
} from './diaryEntry';
import { Vehicle } from './parseVehicleData';
import { RescueSheetView } from '../../common/rescue/types';

const labels: KennzeichenDiaryLabels = {
  title: (plate) => `Kennzeichenabfrage ${plate}`,
  titleUebung: (plate) => `Kennzeichenabfrage ${plate} (Übungssystem)`,
  noResult: 'Keine Zulassung gefunden.',
  vehicleHeading: (n) => `Fahrzeug ${n}:`,
  fields: {
    antrieb: 'Antrieb',
    marke: 'Marke',
    name: 'Name',
    type: 'Type',
    hoechstMasse: 'Höchstzul. Masse',
    erstzulassung: 'Erstzulassung',
    fin: 'FIN',
    variante: 'Variante',
    version: 'Version',
  },
  rescueSheet: 'Rettungskarte',
};

const fullVehicle: Vehicle = {
  antrieb: 'Diesel',
  marke: 'VW',
  name: 'Golf',
  type: 'Golf VII',
  hoechstMasse: '1900 kg',
  erstzulassung: '12.03.2019',
  fin: 'WVWZZZ1KZAW000001',
  variante: 'AM',
  version: 'A1',
};

describe('buildKennzeichenDiaryEntry', () => {
  it('builds a diary entry with all registration fields', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [fullVehicle],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    expect(entry.type).toBe('diary');
    expect(entry.art).toBe('M');
    expect(entry.datum).toBe('2026-07-20T10:00:00.000Z');
    expect(entry.name).toBe('Kennzeichenabfrage W 12345');
    expect(entry.beschreibung).toBe(
      [
        'Antrieb: Diesel',
        'Marke: VW',
        'Name: Golf',
        'Type: Golf VII',
        'Höchstzul. Masse: 1900 kg',
        'Erstzulassung: 12.03.2019',
        'FIN: WVWZZZ1KZAW000001',
        'Variante: AM',
        'Version: A1',
      ].join('\n')
    );
  });

  it('uppercases and trims the plate parts', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: ' fw ',
      plateNumber: ' kfz1 ',
      system: 'einsatz',
      vehicles: [fullVehicle],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });
    expect(entry.name).toBe('Kennzeichenabfrage FW KFZ1');
  });

  it('marks queries against the training system', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'FW',
      plateNumber: 'KFZ1',
      system: 'uebung',
      vehicles: [fullVehicle],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });
    expect(entry.name).toBe('Kennzeichenabfrage FW KFZ1 (Übungssystem)');
  });

  it('omits empty fields', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [
        {
          ...fullVehicle,
          variante: '',
          version: '   ',
          fin: '',
        },
      ],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });
    expect(entry.beschreibung).toBe(
      [
        'Antrieb: Diesel',
        'Marke: VW',
        'Name: Golf',
        'Type: Golf VII',
        'Höchstzul. Masse: 1900 kg',
        'Erstzulassung: 12.03.2019',
      ].join('\n')
    );
  });

  it('separates multiple vehicles (Wechselkennzeichen) with headings', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [
        { ...fullVehicle, marke: 'VW', name: 'Golf' },
        { ...fullVehicle, marke: 'Puch', name: 'G' },
      ],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    const lines = (entry.beschreibung ?? '').split('\n');
    expect(lines[0]).toBe('Fahrzeug 1:');
    expect(lines).toContain('Marke: VW');
    expect(lines).toContain('Fahrzeug 2:');
    expect(lines).toContain('Marke: Puch');
    // blank line between the two blocks
    expect(lines[lines.indexOf('Fahrzeug 2:') - 1]).toBe('');
  });

  it('records queries without a result', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '99999',
      system: 'einsatz',
      vehicles: [],
      noResult: true,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });
    expect(entry.name).toBe('Kennzeichenabfrage W 99999');
    expect(entry.beschreibung).toBe('Keine Zulassung gefunden.');
  });
});

describe('buildKennzeichenDiaryEntry with rescue sheets', () => {
  const sheet: RescueSheetView = {
    id: '1',
    makeName: 'Volkswagen',
    modelName: 'Golf',
    variantName: 'Golf',
    bodyType: 'Hatchback',
    buildYearFrom: 2019,
    sheetUrl: 'https://example.test/golf_DE.pdf',
    sheetLanguage: 'DE',
  };

  it('appends the rescue sheet link of the best match', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [fullVehicle],
      rescueSheets: [[sheet]],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    expect(entry.beschreibung).toContain(
      'Rettungskarte: Volkswagen Golf (2019–): https://example.test/golf_DE.pdf',
    );
  });

  it('keeps the sheets aligned with their vehicle', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [fullVehicle, { ...fullVehicle, marke: 'Steyr', name: '680' }],
      rescueSheets: [[sheet], []],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    const blocks = (entry.beschreibung ?? '').split('\n\n');
    expect(blocks[0]).toContain('Rettungskarte: Volkswagen Golf');
    expect(blocks[1]).not.toContain('Rettungskarte');
  });

  it('omits the line when the match has no document', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [fullVehicle],
      rescueSheets: [[{ ...sheet, sheetUrl: undefined }]],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    expect(entry.beschreibung).not.toContain('Rettungskarte');
  });

  it('works without any rescue information at all', () => {
    const entry = buildKennzeichenDiaryEntry({
      platePrefix: 'W',
      plateNumber: '12345',
      system: 'einsatz',
      vehicles: [fullVehicle],
      noResult: false,
      timestamp: '2026-07-20T10:00:00.000Z',
      labels,
    });

    expect(entry.beschreibung).not.toContain('Rettungskarte');
  });
});
