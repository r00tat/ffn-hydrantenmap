import { describe, expect, it } from 'vitest';
import { CrewAssignment } from '../components/firebase/firestore';

describe('crew filtering for vehicle', () => {
  const assignments: CrewAssignment[] = [
    { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
    { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
    { id: '3', recipientId: 'r3', name: 'Huber', vehicleId: 'v2', vehicleName: 'KLF', funktion: 'Feuerwehrmann' },
    { id: '4', recipientId: 'r4', name: 'Weber', vehicleId: null, vehicleName: '', funktion: 'Feuerwehrmann' },
  ];

  it('filters assignments by vehicleId', () => {
    const result = assignments.filter((c) => c.vehicleId === 'v1');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(['Mustermann', 'Meier']);
  });

  it('returns empty array for vehicle with no crew', () => {
    const result = assignments.filter((c) => c.vehicleId === 'v99');
    expect(result).toHaveLength(0);
  });
});
