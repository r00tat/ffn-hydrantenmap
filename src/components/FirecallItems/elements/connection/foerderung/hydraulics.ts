/**
 * Pumpenstandorte und Drücke einer Löschwasserförderung über lange Wegstrecke.
 *
 * Kennt keine Schlauchtabelle, sondern nur „bar je Meter" — damit ist diese
 * Datei gegen handgerechnete Beispiele prüfbar, ohne dass die Reibungstabelle
 * stimmen muss, und `frictionLoss.ts` gegen die Papiertabelle, ohne dass ein
 * Höhenprofil im Spiel ist. Zusammen in einer Datei könnte kein Test mehr eine
 * der beiden Seiten allein widerlegen.
 *
 * Reine Zahlen: kein Leaflet, kein Firestore.
 *
 * Höhenwirkung 0,1 bar je Meter (FF Ebersdorf, Stand 07/2020: „1 Meter
 * Steigung = −0,1 bar", „1 Meter Gefälle = +0,1 bar"; die deutsche Literatur
 * nennt dasselbe als „1 bar je 10 m Höhendifferenz").
 */

/** bar Druckänderung je Meter Höhenunterschied. */
export const BAR_PER_METER_ELEVATION = 0.1;

/**
 * Rundungsreserve für die Vergleiche. Die Drücke entstehen aus Summen von
 * Gleitkommazahlen; ohne Reserve entscheidet die letzte Binärstelle darüber, ob
 * eine Pumpe gesetzt wird.
 */
const EPS = 1e-9;

export interface FoerderungProfilePoint {
  /** Streckenmeter ab der Entnahmestelle. */
  distance: number;
  /** Höhe in m. */
  elevation: number;
}

export interface FoerderungInput {
  profile: FoerderungProfilePoint[];
  frictionBarPerMeter: number;
  ausgangsdruck: number;
  eingangsdruck: number;
  zieldruck: number;
}

export interface FoerderungPump {
  /** Streckenmeter ab der Entnahmestelle; 0 ist die Entnahmestelle selbst. */
  distance: number;
  /** Index im übergebenen Profil — für die Position auf der Karte. */
  index: number;
  /** Druck, mit dem das Wasser ankommt; an der Entnahmestelle undefined. */
  eingangsdruck?: number;
  ausgangsdruck: number;
}

export interface FoerderungAbschnitt {
  vonMeter: number;
  bisMeter: number;
  /** Höhenunterschied in m, positiv bergauf. */
  hoehenunterschied: number;
  /** Druckverlust in bar, Reibung und Höhe zusammen. */
  druckverlust: number;
  /** Druck am Ende des Abschnitts. */
  enddruck: number;
}

export interface FoerderungResult {
  pumps: FoerderungPump[];
  /**
   * Ohne die Pumpe an der Entnahmestelle — die steht dort ohnehin, um Wasser
   * aus Hydrant, Saugstelle oder Behälter zu fördern. Sonst würde eine Leitung,
   * die mit einer einzigen Pumpe auskommt, „1 Verstärkerpumpe" melden.
   */
  verstaerkerpumpen: number;
  abschnitte: FoerderungAbschnitt[];
  reibungsverlustBar: number;
  /** Positiv bergauf, negativ bei Gefälle. */
  hoehenverlustBar: number;
  enddruck: number;
  darstellbar: boolean;
}

/** Druckverlust zwischen zwei Abtastpunkten: Reibung plus Höhe. */
const lossBetween = (
  from: FoerderungProfilePoint,
  to: FoerderungProfilePoint,
  frictionBarPerMeter: number
): number =>
  (to.distance - from.distance) * frictionBarPerMeter +
  (to.elevation - from.elevation) * BAR_PER_METER_ELEVATION;

/**
 * Der Druck, der an jedem Punkt nötig wäre, um das Ende mit dem Zieldruck zu
 * erreichen — ohne weitere Pumpe. Rückwärts gerechnet, weil die Vorgabe am Ende
 * steht und nicht am Anfang.
 *
 * Ohne diesen Lauf schöpft ein reines Vorwärts-Greedy den Mindest-Eingangsdruck
 * aus und erreicht das Ende unter dem Zieldruck — es würde eine Pumpe zu wenig
 * ausweisen.
 */
function pressureNeeded(
  profile: FoerderungProfilePoint[],
  frictionBarPerMeter: number,
  zieldruck: number
): number[] {
  const need = new Array<number>(profile.length);
  need[profile.length - 1] = zieldruck;
  for (let i = profile.length - 2; i >= 0; i -= 1) {
    need[i] =
      need[i + 1] + lossBetween(profile[i], profile[i + 1], frictionBarPerMeter);
  }
  return need;
}

/**
 * Wo die Verstärkerpumpen stehen müssen und mit welchem Druck.
 *
 * Vorwärts von der Entnahmestelle, wie es gelehrt wird: „wie weit komme ich mit
 * 8 bar, bis nur noch 1,5 bar Eingangsdruck übrig sind". Die nächste Pumpe
 * steht am **ersten** Punkt, von dem aus das Ende noch mit dem Zieldruck
 * erreichbar ist, sonst am **weitesten** erreichbaren. Der erste Treffer für
 * die letzte Pumpe: Auf 2000 m flach wäre der weiteste Punkt 1950 m — 50 m vor
 * dem Verteiler, ein unsinniger Standort. Die Pumpenzahl ist dieselbe, die
 * Reserve am Ende größer.
 */
export function computeFoerderung(input: FoerderungInput): FoerderungResult {
  const {
    profile,
    frictionBarPerMeter,
    ausgangsdruck,
    eingangsdruck,
    zieldruck,
  } = input;

  const last = profile.length - 1;
  const need = pressureNeeded(profile, frictionBarPerMeter, zieldruck);

  const pumps: FoerderungPump[] = [{ distance: 0, index: 0, ausgangsdruck }];
  const abschnitte: FoerderungAbschnitt[] = [];
  let darstellbar = true;
  let enddruck = ausgangsdruck;
  let current = 0;

  // Höchstens eine Pumpe je Abtastpunkt. Die Schranke fängt eine Lage ab, in
  // der kein Fortschritt zustande kommt, statt endlos zu laufen.
  for (let guard = 0; guard <= profile.length; guard += 1) {
    // Reicht der Ausgangsdruck bis zum Ende, ist die Leitung fertig.
    if (need[current] <= ausgangsdruck + EPS) {
      const druckverlust = need[current] - zieldruck;
      enddruck = ausgangsdruck - druckverlust;
      abschnitte.push({
        vonMeter: profile[current].distance,
        bisMeter: profile[last].distance,
        hoehenunterschied: profile[last].elevation - profile[current].elevation,
        druckverlust,
        enddruck,
      });
      break;
    }

    let pressure = ausgangsdruck;
    let next = -1;
    let nextPressure = 0;
    // `i < last`: Am Ende der Leitung steht der Verteiler, keine Pumpe.
    for (let i = current + 1; i < last; i += 1) {
      pressure -= lossBetween(profile[i - 1], profile[i], frictionBarPerMeter);
      if (pressure < eingangsdruck - EPS) break;
      next = i;
      nextPressure = pressure;
      if (need[i] <= ausgangsdruck + EPS) break;
    }

    if (next < 0) {
      // Nicht einmal der nächste Abtastpunkt ist mit dem Mindest-Eingangsdruck
      // erreichbar — meist eine Steigung, die der Ausgangsdruck nicht hergibt.
      const druckverlust = need[current] - zieldruck;
      enddruck = ausgangsdruck - druckverlust;
      darstellbar = false;
      abschnitte.push({
        vonMeter: profile[current].distance,
        bisMeter: profile[last].distance,
        hoehenunterschied: profile[last].elevation - profile[current].elevation,
        druckverlust,
        enddruck,
      });
      break;
    }

    abschnitte.push({
      vonMeter: profile[current].distance,
      bisMeter: profile[next].distance,
      hoehenunterschied: profile[next].elevation - profile[current].elevation,
      druckverlust: ausgangsdruck - nextPressure,
      enddruck: nextPressure,
    });
    pumps.push({
      distance: profile[next].distance,
      index: next,
      eingangsdruck: nextPressure,
      ausgangsdruck,
    });
    current = next;
  }

  return {
    pumps,
    verstaerkerpumpen: pumps.length - 1,
    abschnitte,
    reibungsverlustBar:
      (profile[last].distance - profile[0].distance) * frictionBarPerMeter,
    hoehenverlustBar:
      (profile[last].elevation - profile[0].elevation) *
      BAR_PER_METER_ELEVATION,
    enddruck,
    darstellbar: darstellbar && enddruck >= zieldruck - EPS,
  };
}
