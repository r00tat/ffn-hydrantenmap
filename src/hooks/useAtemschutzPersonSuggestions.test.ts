import { describe, expect, it, vi } from 'vitest';

// Die Hooks ziehen Firebase nach sich; getestet wird nur die reine Funktion.
vi.mock('./useCrewAssignments', () => ({ default: vi.fn() }));
vi.mock('./useFahrtenbuchPersons', () => ({ default: vi.fn() }));

import { buildAtemschutzSuggestions } from './useAtemschutzPersonSuggestions';

describe('buildAtemschutzSuggestions', () => {
  it('schlägt aus dem Personalstand nur Atemschutzträger vor', () => {
    const result = buildAtemschutzSuggestions({
      persons: [
        { name: 'Muster Anna', atemschutztraeger: true },
        { name: 'Beispiel Bernd' },
        { name: 'Probe Clara', atemschutztraeger: false },
      ],
      crewNames: [],
      trupps: [],
    });

    expect(result).toEqual(['Muster Anna']);
  });

  it('behält Mannschaft und bereits Eingetipptes unabhängig vom Personalstand', () => {
    const result = buildAtemschutzSuggestions({
      persons: [],
      crewNames: ['Gast Gustav'],
      trupps: [{ mitglieder: ['Auswärtig Alois'] }],
      asspLeiter: 'Leiter Lea',
      asspFuellpersonal: ['Füller Fritz'],
    });

    expect(result).toEqual([
      'Auswärtig Alois',
      'Füller Fritz',
      'Gast Gustav',
      'Leiter Lea',
    ]);
  });
});
