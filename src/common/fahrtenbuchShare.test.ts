import { describe, expect, it } from 'vitest';
import type { FahrtenbuchPerson, FahrtenbuchVehicle } from './fahrtenbuch';
import { toShareLinkPerson, toShareLinkVehicle } from './fahrtenbuchShare';

const vehicle: FahrtenbuchVehicle = {
  id: 'v1',
  name: 'TLF',
  kennzeichen: 'ND-1',
  active: true,
  counters: [
    {
      id: 'km',
      label: 'Kilometerstand',
      unit: 'km',
      mode: 'startEnd',
      changeWarning: 'decrease',
      required: true,
    },
  ],
  fuelTypes: ['diesel'],
  lastCounters: { km: 1200 },
  lastDriverName: 'Max Mustermann',
  lastEntryHasDefect: true,
  createdAt: 'x',
  createdBy: 'u1',
  updatedAt: 'x',
  updatedBy: 'u1',
};

const person: FahrtenbuchPerson = {
  id: 'p1',
  name: 'Max Mustermann',
  active: true,
  phone: '+43 660 1234567',
  email: 'max@example.org',
  note: 'Zugskommandant',
  userId: 'uid-1',
  blaulichtSmsRecipientId: 'bls-1',
  createdAt: 'x',
  createdBy: 'u1',
  updatedAt: 'x',
  updatedBy: 'u1',
};

describe('toShareLinkVehicle', () => {
  it('übernimmt die Felder, die das Formular braucht', () => {
    expect(toShareLinkVehicle(vehicle)).toEqual({
      id: 'v1',
      name: 'TLF',
      kennzeichen: 'ND-1',
      counters: vehicle.counters,
      fuelTypes: ['diesel'],
      lastCounters: { km: 1200 },
    });
  });

  it('gibt keine Audit- oder Cache-Felder über die Fahrzeugnutzung weiter', () => {
    const projected = toShareLinkVehicle(vehicle) as unknown as Record<string, unknown>;
    for (const key of [
      'createdBy',
      'updatedBy',
      'lastDriverName',
      'lastEntryHasDefect',
      'kostenersatzVehicleId',
    ]) {
      expect(projected).not.toHaveProperty(key);
    }
  });

  it('lässt kennzeichen und lastCounters weg, wenn sie fehlen', () => {
    const bare: FahrtenbuchVehicle = { ...vehicle, kennzeichen: undefined, lastCounters: undefined };
    const projected = toShareLinkVehicle(bare) as unknown as Record<string, unknown>;
    expect(projected).not.toHaveProperty('kennzeichen');
    expect(projected).not.toHaveProperty('lastCounters');
  });
});

describe('toShareLinkPerson', () => {
  it('gibt ausschließlich id und name weiter', () => {
    expect(toShareLinkPerson(person)).toEqual({ id: 'p1', name: 'Max Mustermann' });
  });

  it('lässt Kontaktdaten und Verknüpfungen weg', () => {
    const projected = toShareLinkPerson(person) as unknown as Record<string, unknown>;
    for (const key of ['phone', 'email', 'note', 'userId', 'blaulichtSmsRecipientId']) {
      expect(projected).not.toHaveProperty(key);
    }
  });
});
