/** Funktion, die eine Person als Atemschutzträger ausweist. */
export const ATS_FUNKTION = 'Atemschutzträger';

export function getEffectiveBesatzung(
  besatzung: string | undefined,
  crewCount: number
): number {
  const manual = besatzung ? Number.parseInt(besatzung, 10) : 0;
  if (manual > 0) return manual;
  if (crewCount > 0) return Math.max(crewCount - 1, 0);
  return 0;
}

/**
 * ATS-Träger eines Fahrzeugs: ein manuell erfasster Wert hat Vorrang,
 * ansonsten werden die dem Fahrzeug zugeordneten Atemschutzträger gezählt.
 */
export function getEffectiveAts(
  ats: number | string | undefined,
  atsCrewCount: number
): number {
  const manual = Number(ats);
  if (Number.isFinite(manual) && manual > 0) return manual;
  return atsCrewCount > 0 ? atsCrewCount : 0;
}

export interface CrewCountsByVehicle {
  /** Anzahl aller zugeordneten Personen pro Fahrzeug-Id */
  crewCount: Map<string, number>;
  /** Anzahl der zugeordneten Atemschutzträger pro Fahrzeug-Id */
  atsCount: Map<string, number>;
}

/**
 * Zählt Besatzung und Atemschutzträger je Fahrzeug aus den Zuordnungen.
 * Personen ohne Fahrzeug werden ignoriert.
 */
export function countCrewByVehicle(
  assignments: { vehicleId?: string | null; funktion?: string }[]
): CrewCountsByVehicle {
  const crewCount = new Map<string, number>();
  const atsCount = new Map<string, number>();

  for (const assignment of assignments) {
    const vehicleId = assignment.vehicleId;
    if (!vehicleId) continue;
    crewCount.set(vehicleId, (crewCount.get(vehicleId) ?? 0) + 1);
    if (assignment.funktion === ATS_FUNKTION) {
      atsCount.set(vehicleId, (atsCount.get(vehicleId) ?? 0) + 1);
    }
  }

  return { crewCount, atsCount };
}
