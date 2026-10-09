/**
 * Chargen (Lose) von Verbrauchsmaterial — reine Logik ohne Firestore.
 *
 * Die Stammdaten einer Charge liegen als Array am Artikel (`Geraet.chargen`),
 * die Aufteilung je Lagerort als Map am Bestand (`GeraetBestand.chargen`).
 * `anzahl` bleibt die Summe und die Wahrheit; der Rest ohne Charge ist
 * `anzahl` − Σ Map und wird nie gespeichert.
 *
 * Verbraucht wird nach FEFO (first expired, first out): die zuerst ablaufende
 * Charge zuerst.
 */

import {
  GERAET_ABLAUF_VORLAUF_TAGE,
  type Geraet,
  type GeraetBestand,
  type GeraetCharge,
  type GeraetChargeTeil,
} from './geraet';
import { clean } from './geraetBestandLogic';

/** Ein Topf eines Lagerorts: eine Charge oder (`null`) der Rest ohne Charge. */
export interface ChargePot {
  chargeId: string | null;
  menge: number;
}

export type ExpiryStatus = 'abgelaufen' | 'bald' | 'ok';

/** Die nicht archivierten Chargen eines Artikels. */
export function activeChargen(geraet: Pick<Geraet, 'chargen'>): GeraetCharge[] {
  return (geraet.chargen ?? []).filter((c) => !c.archiviert);
}

function compareOptional(a: string | undefined, b: string | undefined): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/**
 * FEFO-Reihenfolge: nach Ablaufdatum aufsteigend; Chargen ohne Ablaufdatum
 * danach, nach Einkaufsdatum und zuletzt nach ID. Verändert die Eingabe nicht.
 */
export function sortFefo(chargen: GeraetCharge[]): GeraetCharge[] {
  return [...chargen].sort(
    (a, b) =>
      compareOptional(a.ablaufDatum, b.ablaufDatum) ||
      compareOptional(a.einkaufsDatum, b.einkaufsDatum) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function sumValues(map: Record<string, number> | undefined): number {
  return Object.values(map ?? {}).reduce(
    (sum, v) => (Number.isFinite(v) ? sum + v : sum),
    0,
  );
}

/** Der Rest ohne Charge: `anzahl` − Σ Chargen. Darf negativ sein. */
export function restOhneCharge(bestand: Pick<GeraetBestand, 'anzahl' | 'chargen'>): number {
  return clean((bestand.anzahl ?? 0) - sumValues(bestand.chargen));
}

/**
 * Die Töpfe eines Lagerorts: die bekannten Chargen (auch archivierte) in
 * FEFO-Reihenfolge, zuletzt der Rest ohne Charge. Einträge zu unbekannten
 * Chargen zählen in den Rest.
 */
export function chargePots(
  bestand: Pick<GeraetBestand, 'anzahl' | 'chargen'>,
  chargen: GeraetCharge[],
): ChargePot[] {
  const map = bestand.chargen ?? {};
  const pots: ChargePot[] = [];
  let known = 0;
  for (const c of sortFefo(chargen)) {
    if (!Object.hasOwn(map, c.id)) continue;
    const menge = map[c.id];
    if (!Number.isFinite(menge)) continue;
    pots.push({ chargeId: c.id, menge });
    known += menge;
  }
  pots.push({ chargeId: null, menge: clean((bestand.anzahl ?? 0) - known) });
  return pots;
}

/** Muss beim Verbrauch eine Charge gewählt werden? Ja, wenn mehr als ein Topf Bestand hat. */
export function needsChargeChoice(
  bestand: Pick<GeraetBestand, 'anzahl' | 'chargen'>,
  chargen: GeraetCharge[],
): boolean {
  return chargePots(bestand, chargen).filter((p) => p.menge > 0).length > 1;
}

/**
 * Teilt eine Verbrauchsmenge nach FEFO auf: Die Chargen werden der Reihe nach
 * bis zu ihrem Bestand gefüllt, der Überhang geht auf den Rest ohne Charge —
 * auch wenn der dadurch negativ wird. Die Summe der Teile ist genau `menge`.
 */
export function allocateFefo(
  bestand: Pick<GeraetBestand, 'anzahl' | 'chargen'>,
  chargen: GeraetCharge[],
  menge: number,
): GeraetChargeTeil[] {
  if (chargen.length === 0) return [{ chargeId: null, menge }];
  const teile: GeraetChargeTeil[] = [];
  let remaining = menge;
  for (const pot of chargePots(bestand, chargen)) {
    if (pot.chargeId === null || remaining <= 0 || pot.menge <= 0) continue;
    const take = clean(Math.min(pot.menge, remaining));
    if (take > 0) {
      teile.push({ chargeId: pot.chargeId, menge: take });
      remaining = clean(remaining - take);
    }
  }
  if (remaining !== 0) teile.push({ chargeId: null, menge: remaining });
  return teile;
}

/**
 * Die neue Aufteilung, wenn `anzahl` ohne Chargenangabe auf `newAnzahl` sinkt:
 * zuerst wird der Rest ohne Charge kleiner (soweit positiv), danach die
 * Chargen in FEFO-Reihenfolge, keine unter 0. Liegt die Aufteilung dann
 * noch über `newAnzahl`, schrumpfen auch Einträge zu unbekannten Chargen
 * (nach ID sortiert). Steigt `anzahl`, wächst nur der
 * Rest ohne Charge — die Aufteilung bleibt (als Kopie).
 */
export function shrinkChargen(
  bestand: Pick<GeraetBestand, 'anzahl' | 'chargen'>,
  chargen: GeraetCharge[],
  newAnzahl: number,
): Record<string, number> {
  const result: Record<string, number> = { ...(bestand.chargen ?? {}) };
  let reduce = clean((bestand.anzahl ?? 0) - newAnzahl);
  if (reduce > 0) {
    const rest = restOhneCharge(bestand);
    if (rest > 0) reduce = clean(reduce - Math.min(rest, reduce));
    for (const c of sortFefo(chargen)) {
      if (reduce <= 0) break;
      const menge = result[c.id];
      if (!(menge > 0)) continue;
      const take = Math.min(menge, reduce);
      result[c.id] = clean(menge - take);
      reduce = clean(reduce - take);
    }
    // Liegt die Map noch über `newAnzahl` (Einträge zu unbekannten Chargen),
    // schrumpfen auch diese — der Reihe nach, keiner unter 0.
    const known = new Set(chargen.map((c) => c.id));
    let excess = clean(sumValues(result) - Math.max(0, newAnzahl));
    for (const id of Object.keys(result).sort()) {
      if (excess <= 0) break;
      const menge = result[id];
      if (known.has(id) || !(menge > 0)) continue;
      const take = Math.min(menge, excess);
      result[id] = clean(menge - take);
      excess = clean(excess - take);
    }
  }
  for (const [id, menge] of Object.entries(result)) {
    if (menge === 0) delete result[id];
  }
  return result;
}

/**
 * Ändert die Menge einer Charge um `delta` (neue Map). Ohne Charge (`null`)
 * bleibt die Aufteilung gleich — die Änderung trifft den berechneten Rest.
 * Eine Charge mit 0 fällt heraus; negativ ist erlaubt.
 */
export function applyChargeDelta(
  map: Record<string, number> | undefined,
  chargeId: string | null,
  delta: number,
): Record<string, number> {
  const result: Record<string, number> = { ...(map ?? {}) };
  if (chargeId === null) return result;
  const menge = clean((result[chargeId] ?? 0) + delta);
  if (menge === 0) delete result[chargeId];
  else result[chargeId] = menge;
  return result;
}

/** `YYYY-MM-DD` plus `days` Tage, gerechnet in UTC. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Ablaufstatus einer Charge: `abgelaufen` vor heute, `bald` bis einschließlich
 * heute + `vorlaufTage`, sonst `ok`. Ohne Ablaufdatum immer `ok`. `todayIso`
 * darf ein ganzer ISO-Zeitpunkt sein — es zählt das Datum.
 */
export function expiryStatus(
  charge: Pick<GeraetCharge, 'ablaufDatum'>,
  todayIso: string,
  vorlaufTage: number = GERAET_ABLAUF_VORLAUF_TAGE,
): ExpiryStatus {
  const ablauf = charge.ablaufDatum?.slice(0, 10);
  if (!ablauf) return 'ok';
  const today = todayIso.slice(0, 10);
  if (ablauf < today) return 'abgelaufen';
  if (ablauf <= addDays(today, vorlaufTage)) return 'bald';
  return 'ok';
}

/** Menge je Charge über die nicht archivierten Lagerorte eines Artikels. */
export function chargeTotals(
  geraet: Pick<Geraet, 'id'>,
  bestaende: GeraetBestand[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const b of bestaende) {
    if (b.geraetId !== geraet.id || b.archiviert) continue;
    for (const [id, menge] of Object.entries(b.chargen ?? {})) {
      if (!Number.isFinite(menge)) continue;
      totals.set(id, clean((totals.get(id) ?? 0) + menge));
    }
  }
  return totals;
}

export interface ExpiringCharge {
  geraet: Geraet;
  charge: GeraetCharge;
  status: Exclude<ExpiryStatus, 'ok'>;
  /** Summe über die nicht archivierten Lagerorte. */
  menge: number;
  /** Die Lagerorte mit Bestand dieser Charge. */
  jeBestand: { bestand: GeraetBestand; menge: number }[];
}

/**
 * Abgelaufene und bald ablaufende Chargen mit Bestand — für die Übersicht
 * und die Sammelmail. Nur aktive Verbrauchsmaterialien und nicht archivierte
 * Chargen; der Vorlauf kommt vom Artikel. Sortiert nach Ablaufdatum.
 */
export function expiringChargen(
  geraete: Geraet[],
  bestaende: GeraetBestand[],
  todayIso: string,
): ExpiringCharge[] {
  const result: ExpiringCharge[] = [];
  for (const geraet of geraete) {
    if (geraet.active === false || !geraet.verbrauchsmaterial) continue;
    const vorlauf = geraet.ablaufVorlaufTage ?? GERAET_ABLAUF_VORLAUF_TAGE;
    const own = bestaende.filter((b) => b.geraetId === geraet.id && !b.archiviert);
    const totals = chargeTotals(geraet, own);
    for (const charge of activeChargen(geraet)) {
      const status = expiryStatus(charge, todayIso, vorlauf);
      if (status === 'ok') continue;
      const menge = totals.get(charge.id) ?? 0;
      if (!(menge > 0)) continue;
      const jeBestand = own
        .map((bestand) => ({ bestand, menge: bestand.chargen?.[charge.id] ?? 0 }))
        .filter((e) => e.menge > 0);
      result.push({ geraet, charge, status, menge, jeBestand });
    }
  }
  return result.sort((a, b) =>
    compareOptional(a.charge.ablaufDatum, b.charge.ablaufDatum),
  );
}

/**
 * Ist die Aufteilung eines Verbrauchs stimmig? Jede Menge endlich und nicht
 * negativ, jede Charge bekannt (oder `null`), kein Topf doppelt und die Summe
 * gleich `menge`.
 */
export function validChargenTeile(
  teile: GeraetChargeTeil[],
  menge: number,
  chargeIds: Iterable<string>,
): boolean {
  if (!Array.isArray(teile)) return false;
  const known = new Set(chargeIds);
  const seen = new Set<string | null>();
  let sum = 0;
  for (const teil of teile) {
    if (!teil || typeof teil !== 'object') return false;
    const { chargeId, menge: teilMenge } = teil;
    if (typeof teilMenge !== 'number' || !Number.isFinite(teilMenge) || teilMenge < 0) {
      return false;
    }
    if (chargeId !== null && (typeof chargeId !== 'string' || !known.has(chargeId))) {
      return false;
    }
    if (seen.has(chargeId)) return false;
    seen.add(chargeId);
    sum += teilMenge;
  }
  return clean(sum) === clean(menge);
}
