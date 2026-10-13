import { describe, expect, it } from 'vitest';
import {
  getLocationDisplayName,
  locationCreatedEntry,
  vehicleAssignedEntry,
  vehicleRemovedEntry,
} from './locationDiary';

describe('getLocationDisplayName', () => {
  it('nimmt den Namen, sonst die Adresse, sonst „Unbekannt"', () => {
    expect(getLocationDisplayName({ name: 'Keller' })).toBe('Keller');
    expect(
      getLocationDisplayName({
        street: 'Hauptplatz',
        number: '1',
        city: 'Neusiedl am See',
      }),
    ).toBe('Hauptplatz 1 Neusiedl am See');
    expect(getLocationDisplayName({})).toBe('Unbekannt');
  });
});

describe('Texte der Tagebucheinträge', () => {
  it('meldet das Anlegen mit Status', () => {
    expect(locationCreatedEntry({ name: 'Keller', status: 'offen' })).toEqual({
      name: 'Einsatzort Keller angelegt',
      beschreibung: 'Status: offen',
    });
    expect(locationCreatedEntry({ name: 'Keller' })).toEqual({
      name: 'Einsatzort Keller angelegt',
      beschreibung: '',
    });
  });

  it('meldet Zuordnen und Abziehen', () => {
    expect(vehicleAssignedEntry('TLFA 4000', { name: 'Keller' })).toBe(
      'TLFA 4000 zu Einsatzort Keller zugeordnet',
    );
    expect(vehicleRemovedEntry('TLFA 4000', { name: 'Keller' })).toBe(
      'TLFA 4000 von Einsatzort Keller abgezogen',
    );
  });
});
