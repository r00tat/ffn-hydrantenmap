import {
  CrewAssignment,
  FirecallItem,
  Fzg,
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
} from '../firebase/firestore';
import { parentMap, TreeItem } from './unit-tree';
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
  /** ID des Elements — zum Bearbeiten aus der Tabelle heraus. */
  id?: string;
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
  /** Die taktische Einheit, unter der Fahrzeug oder Einheit in der Tabelle steht. */
  parentId?: string;
  /** Ebene im Baum der Einheiten; fehlt auf oberster Ebene. */
  depth?: number;
  /**
   * An der Einheit: wie viele Elemente direkt unter ihr stehen. Dann ist ihre
   * Stärke die Summe darunter und zählt in den Summen nicht noch einmal.
   */
  childCount?: number;
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
  // Eine Einheit mit Fahrzeugen zeigt deren Summe — gezählt werden die
  // Fahrzeuge selbst, sonst stünde jede Person zweimal in der Gesamtstärke.
  const counted = rows.filter((r) => !r.childCount);
  return {
    totalMann: counted.reduce((sum, r) => sum + r.mann, 0),
    totalAts: counted.reduce((sum, r) => sum + r.ats, 0),
    totalUnits: rows.length,
    totalFw: new Set(rows.map((r) => r.fw).filter(Boolean)).size,
    typCounts,
    rows,
  };
}

/** Gesamtsumme und die Trennung in eigene und fremde Kräfte. */
function summarizeSplit(rows: StrengthRow[]): StrengthSummary {
  return {
    ...summarize(rows),
    eigene: summarize(rows.filter((r) => !r.fremd)),
    fremde: summarize(rows.filter((r) => r.fremd)),
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
        id: v.id,
        name: v.name,
        fw: v.fw,
        typ: EINSATZMITTEL_KATEGORIE_LABELS[kategorie],
        mann: einsatzmittelStaerke(besatzung, kategorie),
        ats: getEffectiveAts(v.ats, atsCountMap.get(v.id || '') ?? 0),
        alarmierung: v.alarmierung,
        eintreffen: v.eintreffen,
        abruecken: v.abruecken,
        fremd: isFremdesFahrzeug(v),
        ...(v.tacticalUnitId ? { parentId: v.tacticalUnitId } : {}),
      });
    } else if (item.type === 'tacticalUnit') {
      const u = item as TacticalUnit;
      rows.push({
        id: u.id,
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

  return summarizeSplit(nestUnderUnits(rows, items));
}

/**
 * Stellt Fahrzeuge und Einheiten unter ihre taktische Einheit — über beliebig
 * viele Ebenen, etwa Bereitschaft → Zug → Fahrzeug — und rechnet die Stärke
 * einer Einheit aus allem unter ihr. Gezählt wird so nur die unterste Ebene:
 * ein Fahrzeug, oder eine Einheit ohne etwas darunter mit ihrer gepflegten
 * Stärke. Ein Element, dessen Einheit nicht (mehr) im Einsatz steht, bleibt
 * ohne Einheit an seinem Platz (siehe `parentMap`).
 *
 * Eine Einheit aus lauter fremden Fahrzeugen ist selbst fremd — sonst stünde
 * sie bei den eigenen Kräften, ihre Fahrzeuge aber unter „Fremdkräfte".
 */
function nestUnderUnits(rows: StrengthRow[], items: FirecallItem[]): StrengthRow[] {
  const parents = parentMap(items as TreeItem[]);
  const children = new Map<string, StrengthRow[]>();
  const top: StrengthRow[] = [];
  for (const { parentId: _ignored, ...row } of rows) {
    const parentId = row.id ? parents.get(row.id) : undefined;
    if (parentId) {
      children.set(parentId, [...(children.get(parentId) ?? []), { ...row, parentId }]);
    } else {
      top.push(row);
    }
  }

  const result: StrengthRow[] = [];
  const emit = (row: StrengthRow, depth: number): StrengthRow => {
    const index = result.length;
    result.push(row);
    const kids = ((row.id && children.get(row.id)) || []).map((k) =>
      emit(k, depth + 1),
    );
    const nested: StrengthRow = {
      ...row,
      ...(depth > 0 ? { depth } : {}),
      ...(kids.length > 0
        ? {
            mann: kids.reduce((sum, k) => sum + k.mann, 0),
            ats: kids.reduce((sum, k) => sum + k.ats, 0),
            fremd: kids.every((k) => k.fremd),
            childCount: kids.length,
          }
        : {}),
    };
    result[index] = nested;
    return nested;
  };
  for (const row of top) emit(row, 0);
  return result;
}

/**
 * Schränkt die Stärke auf die Zeilen ein, die zum Suchbegriff passen.
 *
 * Gesucht wird ohne Groß- und Kleinschreibung als Teilwort in Bezeichnung,
 * Feuerwehr und Typ, dazu in `extraText` — etwa dem Einsatzort, den die Zeile
 * selbst nicht kennt. Mehrere Wörter müssen alle vorkommen, damit
 * „Neusiedl TLF" nur das TLF aus Neusiedl findet.
 *
 * Die Summen werden über die **gefilterten** Zeilen neu gerechnet: Wer nach
 * einer Feuerwehr filtert, will deren Stärke sehen. Eine Gesamtsumme über
 * Zeilen, die nicht dastehen, ließe sich in der Tabelle nicht nachvollziehen.
 * Ohne Suchbegriff kommt die Zusammenfassung unverändert zurück.
 */
export function filterStrength(
  summary: StrengthSummary,
  query: string,
  extraText?: (row: StrengthRow) => string,
): StrengthSummary {
  const terms = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return summary;

  const matches = new Set(
    summary.rows
      .filter((row) => {
        const text = [row.name, row.fw, row.typ, extraText?.(row)]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('de');
        return terms.every((term) => text.includes(term));
      })
      .map((row) => row.id),
  );
  // Zur passenden Einheit gehört alles unter ihr, zum passenden Fahrzeug die
  // Kette der Einheiten darüber — sonst fehlte der Zeile ihr Zusammenhang.
  // Die Einheiten zählen in den Summen ohnehin nicht doppelt (`summarize`).
  const parentOf = new Map(
    summary.rows.filter((r) => r.id && r.parentId).map((r) => [r.id, r.parentId]),
  );
  const ancestors = (id: string | undefined): string[] => {
    const chain: string[] = [];
    for (let p = parentOf.get(id); p && !chain.includes(p); p = parentOf.get(p)) {
      chain.push(p);
    }
    return chain;
  };
  const shown = new Set<string | undefined>();
  for (const row of summary.rows) {
    if (matches.has(row.id)) {
      shown.add(row.id);
      for (const id of ancestors(row.id)) shown.add(id);
    } else if (ancestors(row.id).some((id) => matches.has(id))) {
      shown.add(row.id);
    }
  }
  const rows = summary.rows.filter((row) => shown.has(row.id));

  return summarizeSplit(rows);
}
