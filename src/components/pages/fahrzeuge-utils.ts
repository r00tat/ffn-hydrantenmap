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
}

export interface StrengthSummary {
  totalMann: number;
  totalAts: number;
  totalUnits: number;
  totalFw: number;
  typCounts: Record<string, number>;
  rows: StrengthRow[];
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
      });
    }
  }

  const fwSet = new Set(rows.map((r) => r.fw).filter(Boolean));
  const typCounts: Record<string, number> = {};
  for (const r of rows) {
    typCounts[r.typ] = (typCounts[r.typ] || 0) + 1;
  }

  return {
    totalMann: rows.reduce((sum, r) => sum + r.mann, 0),
    totalAts: rows.reduce((sum, r) => sum + r.ats, 0),
    totalUnits: rows.length,
    totalFw: fwSet.size,
    typCounts,
    rows,
  };
}
