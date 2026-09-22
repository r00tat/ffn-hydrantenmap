import {
  CrewAssignment,
  FirecallItem,
  Fzg,
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
} from '../firebase/firestore';
import {
  countCrewByVehicle,
  einsatzmittelKategorie,
  einsatzmittelStaerke,
  EINSATZMITTEL_KATEGORIE_LABELS,
  getEffectiveAts,
  getEffectiveBesatzung,
  isFremdesFahrzeug,
} from '../../common/vehicle-utils';

export interface StrengthRow {
  name: string;
  fw?: string;
  typ: string;
  mann: number;
  ats: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  /** Einsatzmittel einer fremden Organisation — Rettung, Polizei, Nachbarwehr. */
  fremd: boolean;
}

/** Eine Gruppe von Zeilen mit ihren Summen. */
export interface StrengthGroup {
  totalMann: number;
  totalAts: number;
  totalUnits: number;
  totalFw: number;
  typCounts: Record<string, number>;
  rows: StrengthRow[];
}

/**
 * Die Stärke des Einsatzes, einmal ganz und einmal getrennt.
 *
 * Die Summen auf oberster Ebene sind weiterhin die **Gesamtsumme** über alles.
 * Für die Einsatzleitung sind „wie viele eigene Leute habe ich" und „wer ist
 * sonst noch da" zwei Fragen, und eine Zahl, die beides vermengt, beantwortet
 * keine von beiden — deshalb daneben die beiden Gruppen. Der Schalter hängt am
 * Fahrzeug (`Fzg.fremd`); eine taktische Einheit kennt ihn nicht und zählt
 * daher zu den eigenen Kräften.
 */
export interface StrengthSummary extends StrengthGroup {
  eigene: StrengthGroup;
  fremde: StrengthGroup;
}

function summarize(rows: StrengthRow[]): StrengthGroup {
  const typCounts: Record<string, number> = {};
  for (const row of rows) {
    typCounts[row.typ] = (typCounts[row.typ] || 0) + 1;
  }
  return {
    totalMann: rows.reduce((sum, r) => sum + r.mann, 0),
    totalAts: rows.reduce((sum, r) => sum + r.ats, 0),
    totalUnits: rows.length,
    totalFw: new Set(rows.map((r) => r.fw).filter(Boolean)).size,
    typCounts,
    rows,
  };
}

export function calculateStrength(items: FirecallItem[], crewAssignments: CrewAssignment[] = []): StrengthSummary {
  const { crewCount: crewCountMap, atsCount: atsCountMap } =
    countCrewByVehicle(crewAssignments);

  const rows: StrengthRow[] = [];

  for (const item of items) {
    if (item.type === 'vehicle') {
      const v = item as Fzg;
      const crewCount = crewCountMap.get(v.id || '') ?? 0;
      // Ein Aufbau oder ein Anhänger fährt nicht selbst: Dort keine
      // Führungskraft dazuzählen, sonst steht jeder Aufbau mit 1 in der
      // Stärke und die Gesamtstärke ist zu hoch (#795).
      const kategorie = einsatzmittelKategorie(v);
      const besatzung = getEffectiveBesatzung(v.besatzung, crewCount, kategorie);
      rows.push({
        name: v.name,
        fw: v.fw,
        typ: EINSATZMITTEL_KATEGORIE_LABELS[kategorie],
        mann: einsatzmittelStaerke(besatzung, kategorie),
        ats: getEffectiveAts(v.ats, atsCountMap.get(v.id || '') ?? 0),
        alarmierung: v.alarmierung,
        eintreffen: v.eintreffen,
        abruecken: v.abruecken,
        fremd: isFremdesFahrzeug(v),
      });
    } else if (item.type === 'tacticalUnit') {
      const u = item as TacticalUnit;
      rows.push({
        name: u.name,
        fw: u.fw,
        typ: u.unitType ? TACTICAL_UNIT_LABELS[u.unitType] : 'Einheit',
        mann: Number(u.mann) || 0,
        ats: Number(u.ats) || 0,
        alarmierung: u.alarmierung,
        eintreffen: u.eintreffen,
        abruecken: u.abruecken,
        fremd: false,
      });
    }
  }

  return {
    ...summarize(rows),
    eigene: summarize(rows.filter((r) => !r.fremd)),
    fremde: summarize(rows.filter((r) => r.fremd)),
  };
}
