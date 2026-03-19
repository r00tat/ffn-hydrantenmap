import {
  FirecallItem,
  Fzg,
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
} from '../firebase/firestore';

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

export function calculateStrength(items: FirecallItem[]): StrengthSummary {
  const rows: StrengthRow[] = [];

  for (const item of items) {
    if (item.type === 'vehicle') {
      const v = item as Fzg;
      const besatzung = v.besatzung ? Number.parseInt(v.besatzung, 10) : 0;
      rows.push({
        name: v.name,
        fw: v.fw,
        typ: 'Fahrzeug',
        mann: besatzung + 1,
        ats: Number(v.ats) || 0,
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
