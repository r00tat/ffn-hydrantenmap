/**
 * Reine Buchungslogik für Geräte und Lagerartikel.
 *
 * Ohne Firestore, damit die Regeln — wann gemeldet wird, wie ein geänderter
 * Verbrauch nachgebucht wird — ohne Emulator testbar sind. Die Server Actions
 * rufen das hier innerhalb ihrer Transaktion auf.
 */

export interface StockState {
  bestandGesamt: number;
  mindestbestand?: number;
  nachbestellenSeit?: string | null;
}

export interface StockResult {
  bestandGesamt: number;
  /** `null` heißt: Feld löschen. */
  nachbestellenSeit: string | null;
  /** Nur beim Übergang von ≥ Mindestbestand auf < Mindestbestand. */
  crossedBelow: boolean;
}

/** Rundet Gleitkommareste weg (0,1 + 0,2 ≠ 0,3). */
function clean(value: number): number {
  // `|| 0` macht aus -0 eine 0.
  return Math.round(value * 1e9) / 1e9 || 0;
}

/**
 * Rechnet den Gesamtbestand um `delta` fort und entscheidet über die
 * Nachbestellung.
 *
 * Gemeldet wird nur der Übergang unter den Mindestbestand — weitere Verbräuche
 * darunter lösen keine neue Mail aus. Fehlt der Zeitpunkt, obwohl der Bestand
 * schon darunter liegt (Mindestbestand nachträglich gesetzt), wird er ohne
 * Meldung nachgetragen: Der Artikel gehört auf die Liste „Nachzubestellen",
 * aber das Unterschreiten ist nicht jetzt passiert. Ohne Mindestbestand gibt
 * es keine Nachbestellung.
 */
export function applyStockDelta(
  state: StockState,
  delta: number,
  nowIso: string,
): StockResult {
  const before = state.bestandGesamt ?? 0;
  const after = clean(before + delta);
  const min = state.mindestbestand;

  if (typeof min !== 'number' || !Number.isFinite(min)) {
    return { bestandGesamt: after, nachbestellenSeit: null, crossedBelow: false };
  }

  const wasBelow = before < min;
  const isBelow = after < min;
  if (!isBelow) {
    return { bestandGesamt: after, nachbestellenSeit: null, crossedBelow: false };
  }
  return {
    bestandGesamt: after,
    nachbestellenSeit: (wasBelow && state.nachbestellenSeit) || nowIso,
    crossedBelow: !wasBelow,
  };
}

export interface VerbrauchTarget {
  bestandId: string;
  menge: number;
}

export interface VerbrauchBooking {
  bestandId: string;
  /** Wie gebucht: Verbrauch negativ, Storno positiv. */
  menge: number;
}

/**
 * Die Korrekturbuchungen, die den Bestand an einen Einsatz-Eintrag angleichen.
 *
 * `target` ist der Soll-Zustand des Eintrags (`null`, wenn er gelöscht oder
 * kein Verbrauch mehr ist), `booked` alle bisherigen Buchungen mit dessen
 * `einsatzEintragId`. Das Ergebnis ist je Lagerort die noch fehlende Menge —
 * ein zweiter Aufruf nach dem Buchen liefert deshalb nichts (Idempotenz), und
 * Mengen- oder Lagerortwechsel werden zur Differenz- bzw. Umbuchung.
 *
 * Reihenfolge: zuerst der Ziel-Lagerort, dann die übrigen in der Reihenfolge
 * ihrer ersten Buchung.
 */
export function reconcileVerbrauch(
  target: VerbrauchTarget | null,
  booked: VerbrauchBooking[],
): { bestandId: string; delta: number }[] {
  const desired = new Map<string, number>();
  if (target && Number.isFinite(target.menge) && target.menge > 0) {
    desired.set(target.bestandId, -target.menge);
  }

  const current = new Map<string, number>();
  for (const b of booked) {
    if (!Number.isFinite(b.menge)) continue;
    current.set(b.bestandId, (current.get(b.bestandId) ?? 0) + b.menge);
  }

  const order: string[] = [];
  if (target) order.push(target.bestandId);
  for (const id of current.keys()) {
    if (!order.includes(id)) order.push(id);
  }

  const result: { bestandId: string; delta: number }[] = [];
  for (const bestandId of order) {
    const delta = clean((desired.get(bestandId) ?? 0) - (current.get(bestandId) ?? 0));
    if (delta !== 0) result.push({ bestandId, delta });
  }
  return result;
}

/**
 * Was der Client beim Anstoßen des Abgleichs vom Eintrag erwartet: dass er
 * gelöscht ist, oder dass er mindestens den Stand `syncRev` hat.
 */
export type VerbrauchExpectation = { deleted: true } | { syncRev: number };

/**
 * Liest der Server einen älteren Stand des Eintrags, als der Client meint?
 *
 * Der Client schreibt den Eintrag lokal und stößt den Abgleich an; ob die
 * Änderung schon beim Server ist, weiß er nicht sicher (das Warten darauf hat
 * eine Zeitgrenze). Bucht der Server gegen den alten Stand, gilt der Abgleich
 * als erledigt, und die Änderung käme danach nie mehr zur Buchung. Darum lehnt
 * der Server einen veralteten Stand ab, und die Warteschlange wiederholt.
 *
 * Ein neuerer Stand als erwartet ist kein Fehler — dann hat ein anderes Gerät
 * den Eintrag seither geändert, und der Abgleich bucht dessen Stand.
 */
export function isOutdatedEntry(
  entry: { syncRev?: number } | undefined,
  expect: VerbrauchExpectation | undefined,
): boolean {
  if (!expect) return false;
  if ('deleted' in expect) return entry !== undefined;
  if (!entry) return true;
  return (entry.syncRev ?? 0) < expect.syncRev;
}

/**
 * Begrenzt das Ziel eines Verbrauchs, wenn der Artikel nicht (mehr) abgebucht
 * werden darf — weil er kein Verbrauchsmaterial ist oder deaktiviert wurde.
 *
 * Ein solcher Artikel bekommt keine neue Abbuchung; was schon gebucht ist,
 * bleibt stehen und kann nur kleiner werden (Menge verringert, Eintrag
 * gelöscht, anderer Lagerort). So bucht weder ein manipulierter Eintrag einen
 * Kupplungsschlüssel ab, noch storniert ein späteres Abhaken von
 * „Verbrauchsmaterial" die Verbräuche vergangener Einsätze.
 */
export function capVerbrauchTarget(
  target: VerbrauchTarget | null,
  booked: VerbrauchBooking[],
  bookable: boolean,
): VerbrauchTarget | null {
  if (!target || bookable) return target;
  const alreadyBooked = -booked
    .filter((b) => b.bestandId === target.bestandId && Number.isFinite(b.menge))
    .reduce((sum, b) => sum + b.menge, 0);
  const menge = clean(Math.min(target.menge, alreadyBooked));
  return menge > 0 ? { bestandId: target.bestandId, menge } : null;
}
