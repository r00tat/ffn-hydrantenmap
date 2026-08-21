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

/**
 * Obergrenze der Pumpen, jenseits derer nicht mehr gerechnet, sondern gewarnt
 * wird.
 *
 * Seit die Standorte auf der Strecke gelöst werden und nicht auf einem
 * Abtastraster, ist geometrisch fast jede Lage darstellbar — man kann eine Pumpe
 * überall setzen, also lässt sich jede Steigung mit genügend Pumpen überwinden.
 * Die echte Grenze ist deshalb nicht die Geometrie, sondern das, was ein Bezirk
 * aufstellen kann. Darüber ist die Antwort nicht „geht nicht", sondern „nicht
 * mit diesen Mitteln".
 */
export const MAX_PUMPS = 30;

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
  /**
   * Streckenmeter ab der Entnahmestelle; 0 ist die Entnahmestelle selbst.
   *
   * Auf der Strecke gerechnet, **nicht** auf einen Abtastpunkt gerundet. Das
   * Raster ist 50 m grob; bei 1600 l/min sind die Pumpenabstände nur 130 m, und
   * gerundet würde daraus 100 m — 20 Pumpen statt 16. Schlimmer noch: Der letzte
   * Abschnitt darf dann nur 40 m lang sein, auf dem Raster gibt es keinen
   * solchen Punkt, und der Rechner meldete „nicht darstellbar", obwohl eine
   * Pumpe 40 m vor dem Verteiler die Förderung trägt.
   */
  distance: number;
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
 * Die kumulierte Druckabnahme ab der Entnahmestelle, je Abtastpunkt.
 *
 * Damit wird aus „welcher Abtastpunkt ist erreichbar" ein „bei welchem
 * Streckenmeter ist der Druck aufgebraucht" — der Standort einer Pumpe muss
 * nicht auf einem Abtastpunkt liegen. Zwischen zwei Punkten verläuft die
 * Abnahme linear, weil das Modell zwischen ihnen nichts anderes kennt.
 */
function cumulativeDrop(
  profile: FoerderungProfilePoint[],
  frictionBarPerMeter: number
): number[] {
  const drop = [0];
  for (let i = 1; i < profile.length; i += 1) {
    drop.push(
      drop[i - 1] + lossBetween(profile[i - 1], profile[i], frictionBarPerMeter)
    );
  }
  return drop;
}

/**
 * Der erste Streckenmeter ab `fromDistance`, an dem die kumulierte Abnahme
 * `targetDrop` erreicht — oder `undefined`, wenn sie das bis zum Ende nicht tut
 * (ein Gefälle kann die Abnahme auch zurückgehen lassen).
 */
function distanceAtDrop(
  profile: FoerderungProfilePoint[],
  drop: number[],
  targetDrop: number,
  fromDistance: number
): number | undefined {
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i].distance <= fromDistance) continue;
    const spanDrop = drop[i] - drop[i - 1];
    if (drop[i] + EPS < targetDrop) continue;
    if (spanDrop <= 0) {
      // Abschnitt ohne Abnahme: Der Zielwert liegt bereits am Anfang.
      return Math.max(profile[i - 1].distance, fromDistance);
    }
    const ratio = (targetDrop - drop[i - 1]) / spanDrop;
    const distance =
      profile[i - 1].distance +
      (profile[i].distance - profile[i - 1].distance) * Math.min(1, Math.max(0, ratio));
    return Math.max(distance, fromDistance);
  }
  return undefined;
}

/** Die Höhe an einem beliebigen Streckenmeter, linear zwischen den Punkten. */
function elevationAt(
  profile: FoerderungProfilePoint[],
  distance: number
): number {
  if (distance <= profile[0].distance) return profile[0].elevation;
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i].distance >= distance) {
      const span = profile[i].distance - profile[i - 1].distance;
      const ratio = span > 0 ? (distance - profile[i - 1].distance) / span : 0;
      return (
        profile[i - 1].elevation +
        (profile[i].elevation - profile[i - 1].elevation) * ratio
      );
    }
  }
  return profile[profile.length - 1].elevation;
}

/** Die kumulierte Abnahme an einem beliebigen Streckenmeter. */
function dropAt(
  profile: FoerderungProfilePoint[],
  drop: number[],
  distance: number
): number {
  if (distance <= profile[0].distance) return 0;
  for (let i = 1; i < profile.length; i += 1) {
    if (profile[i].distance >= distance) {
      const span = profile[i].distance - profile[i - 1].distance;
      const ratio = span > 0 ? (distance - profile[i - 1].distance) / span : 0;
      return drop[i - 1] + (drop[i] - drop[i - 1]) * ratio;
    }
  }
  return drop[drop.length - 1];
}

export function computeFoerderung(input: FoerderungInput): FoerderungResult {
  const {
    profile,
    frictionBarPerMeter,
    ausgangsdruck,
    eingangsdruck,
    zieldruck,
  } = input;

  const last = profile.length - 1;
  const totalDistance = profile[last].distance;
  const drop = cumulativeDrop(profile, frictionBarPerMeter);
  const totalDrop = drop[last];

  const pumps: FoerderungPump[] = [{ distance: 0, ausgangsdruck }];
  const abschnitte: FoerderungAbschnitt[] = [];
  let darstellbar = true;
  let enddruck = ausgangsdruck;

  let currentDistance = 0;
  let currentDrop = 0;

  const pushAbschnitt = (
    toDistance: number,
    toDrop: number,
    fromDistance: number,
    fromDrop: number
  ) => {
    const druckverlust = toDrop - fromDrop;
    abschnitte.push({
      vonMeter: fromDistance,
      bisMeter: toDistance,
      hoehenunterschied:
        elevationAt(profile, toDistance) - elevationAt(profile, fromDistance),
      druckverlust,
      enddruck: ausgangsdruck - druckverlust,
    });
  };

  let exceeded = false;
  for (let guard = 0; ; guard += 1) {
    if (guard > MAX_PUMPS) {
      // Mehr Pumpen, als eine Lage trägt — und gleichzeitig der Schutz gegen
      // eine Schleife, die keinen Fortschritt macht.
      exceeded = true;
      enddruck = ausgangsdruck - (totalDrop - currentDrop);
      break;
    }
    // Reicht der Ausgangsdruck bis zum Ende, ist die Leitung fertig.
    if (totalDrop - currentDrop <= ausgangsdruck - zieldruck + EPS) {
      enddruck = ausgangsdruck - (totalDrop - currentDrop);
      pushAbschnitt(totalDistance, totalDrop, currentDistance, currentDrop);
      break;
    }

    // Der weiteste erreichbare Punkt, und der erste, von dem aus das Ende noch
    // mit dem Zieldruck erreichbar ist. Der frühere von beiden gewinnt: Auf
    // 2000 m flach wäre der weiteste 1950 m — 50 m vor dem Verteiler, ein
    // unsinniger Standort. Die Pumpenzahl ist dieselbe, die Reserve größer.
    const reachDrop = currentDrop + (ausgangsdruck - eingangsdruck);
    const endReachableDrop = totalDrop - (ausgangsdruck - zieldruck);
    const targetDrop = Math.min(reachDrop, endReachableDrop);

    const nextDistance = distanceAtDrop(
      profile,
      drop,
      targetDrop,
      currentDistance
    );

    if (nextDistance === undefined || nextDistance >= totalDistance - EPS) {
      // Kein Standort vor dem Verteiler, von dem aus es weitergeht.
      darstellbar = false;
      enddruck = ausgangsdruck - (totalDrop - currentDrop);
      pushAbschnitt(totalDistance, totalDrop, currentDistance, currentDrop);
      break;
    }

    const nextDrop = dropAt(profile, drop, nextDistance);
    pushAbschnitt(nextDistance, nextDrop, currentDistance, currentDrop);
    pumps.push({
      distance: nextDistance,
      eingangsdruck: ausgangsdruck - (nextDrop - currentDrop),
      ausgangsdruck,
    });
    currentDistance = nextDistance;
    currentDrop = nextDrop;
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
    darstellbar: darstellbar && !exceeded && enddruck >= zieldruck - EPS,
  };
}
