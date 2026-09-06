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
  /**
   * Die Zahlen der gleichmäßigen Verteilung — **nur**, wenn tatsächlich
   * verteilt wurde.
   *
   * Für den Rechenweg, und deshalb hier und nicht dort gerechnet: Er beschriebe
   * sonst eine Verteilung mit Kapazität und Auslastung, die er selbst
   * nachgerechnet hat. Weicht die Verteilung später ab, führte er eine Rechnung
   * vor, die das Ergebnis nicht erzeugt hat — schlimmer als keine.
   *
   * `undefined` heißt: Es blieb beim Ergebnis des Vorwärtslaufs. Das ist auch
   * der Fall, wenn es gar nichts zu verteilen gab, weil die Leitung ohne
   * Verstärkerpumpe auskommt.
   */
  verteilung?: FoerderungVerteilung;
}

/** Kapazität, Auslastung und Abnahme je Zwischenabschnitt der Verteilung. */
export interface FoerderungVerteilung {
  /** Summe der Kapazitäten aller Abschnitte in bar. */
  kapazitaet: number;
  /** Anteil der Kapazität, den die Strecke braucht — 0 bis 1. */
  auslastung: number;
  /** Druckabnahme je Zwischenabschnitt in bar. */
  abnahmeJeAbschnitt: number;
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

/**
 * Die **größte** kumulierte Abnahme im Stück zwischen zwei Streckenmetern.
 *
 * Zwischen Anfang und Ende eines Abschnitts kann mehr Druck verloren gehen als
 * am Ende übrig bleibt: Eine Kuppe kostet den Aufstieg, und das Gefälle danach
 * gibt ihn zurück. Wer nur die Enden vergleicht, sieht davon nichts und hält
 * eine Leitung für darstellbar, in der oben auf der Kuppe rechnerisch ein
 * negativer Druck steht — dort fließt kein Wasser mehr, egal was am Verteiler
 * ankäme.
 *
 * Zwischen zwei Abtastpunkten verläuft die Abnahme linear, das Maximum liegt
 * also auf einem Abtastpunkt oder auf einer der beiden Grenzen.
 */
function maxDropBetween(
  profile: FoerderungProfilePoint[],
  drop: number[],
  fromDistance: number,
  toDistance: number
): number {
  let max = Math.max(
    dropAt(profile, drop, fromDistance),
    dropAt(profile, drop, toDistance)
  );
  for (let i = 0; i < profile.length; i += 1) {
    if (profile[i].distance <= fromDistance) continue;
    if (profile[i].distance >= toDistance) break;
    if (drop[i] > max) max = drop[i];
  }
  return max;
}

/**
 * Pumpen, Abschnitte und Enddruck zu einer gegebenen Folge von Standorten.
 *
 * Getrennt von der Suche, weil die Standorte zweimal entstehen: einmal aus dem
 * Vorwärtslauf, der die *Zahl* der Pumpen bestimmt, und danach noch einmal
 * gleichmäßig verteilt (`balancedDistances`). Beide Male ist daraus dasselbe
 * Ergebnis zu bauen.
 */
function layout(
  profile: FoerderungProfilePoint[],
  drop: number[],
  distances: number[],
  totalDistance: number,
  totalDrop: number,
  ausgangsdruck: number
): {
  pumps: FoerderungPump[];
  abschnitte: FoerderungAbschnitt[];
  enddruck: number;
} {
  const pumps: FoerderungPump[] = [{ distance: 0, ausgangsdruck }];
  const abschnitte: FoerderungAbschnitt[] = [];
  let currentDistance = 0;
  let currentDrop = 0;

  const pushAbschnitt = (toDistance: number, toDrop: number) => {
    const druckverlust = toDrop - currentDrop;
    abschnitte.push({
      vonMeter: currentDistance,
      bisMeter: toDistance,
      hoehenunterschied:
        elevationAt(profile, toDistance) - elevationAt(profile, currentDistance),
      druckverlust,
      enddruck: ausgangsdruck - druckverlust,
    });
  };

  for (const distance of distances) {
    const nextDrop = dropAt(profile, drop, distance);
    pushAbschnitt(distance, nextDrop);
    pumps.push({
      distance,
      eingangsdruck: ausgangsdruck - (nextDrop - currentDrop),
      ausgangsdruck,
    });
    currentDistance = distance;
    currentDrop = nextDrop;
  }

  pushAbschnitt(totalDistance, totalDrop);

  return {
    pumps,
    abschnitte,
    enddruck: ausgangsdruck - (totalDrop - currentDrop),
  };
}

/**
 * Dieselbe Pumpenzahl, aber gleichmäßig über die Strecke verteilt.
 *
 * Der Vorwärtslauf schöpft jeden Abschnitt bis zum Mindest-Eingangsdruck aus.
 * Die Zahl der Pumpen ist damit die kleinstmögliche — die **Standorte** aber
 * sind es nicht: Was nach den vollen Abschnitten übrig bleibt, sammelt sich am
 * Ende, und die letzte Verstärkerpumpe rückt an ihre Vorgängerin heran. Auf
 * 2000 m mit 100 m Steigung stehen die Pumpen so bei 433, 867, 1300, 1733 und
 * **1867** m: viermal 433 m Abstand und dann 133 m. Zwei Pumpen 133 m
 * nebeneinander sind kein Standort, sondern das Ergebnis einer Grenze, die
 * hinten nicht mehr aufgeht — im Einsatz ist das nicht umzusetzen und sieht
 * auf der Karte aus wie ein Rechenfehler.
 *
 * Verteilt wird über die **Auslastung**, nicht über die Strecke: Jeder
 * Abschnitt bekommt denselben Anteil seiner eigenen Kapazität. Das ist nötig,
 * weil die Abschnitte ungleiche Kapazitäten haben — zwischen zwei Pumpen sind
 * es `Ausgangsdruck − Eingangsdruck`, vor dem Verteiler nur
 * `Ausgangsdruck − Zieldruck`. Ein gleicher Druckanteil je Abschnitt würde den
 * letzten überfordern; ein gleicher **Meter**abstand ebenso, sobald das Gelände
 * nicht eben ist. Mit gleicher Auslastung hat jeder Abschnitt dieselbe Reserve,
 * und keiner steht am Anschlag.
 *
 * `undefined`, wenn sich die Standorte so nicht setzen lassen — dann bleibt es
 * beim Ergebnis des Vorwärtslaufs.
 */
function balancedDistances(
  profile: FoerderungProfilePoint[],
  drop: number[],
  sections: number,
  totalDrop: number,
  ausgangsdruck: number,
  eingangsdruck: number,
  zieldruck: number
): { distances: number[]; verteilung: FoerderungVerteilung } | undefined {
  const zwischenKapazitaet = ausgangsdruck - eingangsdruck;
  const letzteKapazitaet = ausgangsdruck - zieldruck;
  const kapazitaet = (sections - 1) * zwischenKapazitaet + letzteKapazitaet;
  if (!(kapazitaet > 0) || !(totalDrop > 0)) return undefined;

  const auslastung = Math.min(1, totalDrop / kapazitaet);
  const distances: number[] = [];
  let previous = 0;
  for (let k = 1; k < sections; k += 1) {
    const target = k * zwischenKapazitaet * auslastung;
    const distance = distanceAtDrop(profile, drop, target, previous);
    // Kein Standort für diesen Anteil — etwa weil ein Gefälle die Abnahme
    // zurückgehen lässt. Dann wird nicht verschoben.
    if (distance === undefined) return undefined;
    if (distance <= previous + EPS) return undefined;
    distances.push(distance);
    previous = distance;
  }
  return {
    distances,
    verteilung: {
      kapazitaet,
      auslastung,
      abnahmeJeAbschnitt: zwischenKapazitaet * auslastung,
    },
  };
}

/**
 * Ob eine Standortfolge die Drücke einhält.
 *
 * Zwei Bedingungen je Abschnitt, und beide werden gebraucht:
 *
 * - **Nirgends** im Abschnitt darf der Druck unter den Mindest-Eingangsdruck
 *   fallen — gemessen an der größten Abnahme im Stück, nicht an der am Ende.
 *   Eine Kuppe kostet den Aufstieg und gibt ihn im Gefälle zurück; wer nur die
 *   Enden vergleicht, hält eine Leitung für darstellbar, in der oben kein
 *   Wasser mehr ankommt.
 * - Am Verteiler steht der Zieldruck.
 *
 * Geprüft wird auch, was `balancedDistances` liefert: `distanceAtDrop` gibt auf
 * Abschnitten ohne Abnahme den Anfang zurück, die Standorte können also von den
 * Sollwerten abweichen. Eine Verteilung, die die Förderung nicht mehr trägt,
 * ist keine Verbesserung.
 */
function isFeasible(
  profile: FoerderungProfilePoint[],
  drop: number[],
  distances: number[],
  totalDistance: number,
  totalDrop: number,
  ausgangsdruck: number,
  eingangsdruck: number,
  zieldruck: number
): boolean {
  let currentDrop = 0;
  let currentDistance = 0;
  for (const distance of distances) {
    if (!(distance > currentDistance) || distance >= totalDistance - EPS) {
      return false;
    }
    const nextDrop = dropAt(profile, drop, distance);
    const worst = maxDropBetween(profile, drop, currentDistance, distance);
    if (worst - currentDrop > ausgangsdruck - eingangsdruck + EPS) {
      return false;
    }
    currentDistance = distance;
    currentDrop = nextDrop;
  }
  const worstLast = maxDropBetween(
    profile,
    drop,
    currentDistance,
    totalDistance
  );
  if (worstLast - currentDrop > ausgangsdruck - eingangsdruck + EPS) {
    return false;
  }
  return totalDrop - currentDrop <= ausgangsdruck - zieldruck + EPS;
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

  // Der Vorwärtslauf bestimmt die *Zahl* der Pumpen. Die Standorte, die er
  // dabei findet, sind nur der Ausgangspunkt — verteilt wird danach.
  const distances: number[] = [];
  let darstellbar = true;
  let exceeded = false;
  let currentDistance = 0;
  let currentDrop = 0;

  for (let guard = 0; ; guard += 1) {
    if (guard > MAX_PUMPS) {
      // Mehr Pumpen, als eine Lage trägt — und gleichzeitig der Schutz gegen
      // eine Schleife, die keinen Fortschritt macht.
      exceeded = true;
      break;
    }
    // Die größte Abnahme im Rest der Strecke — sie und nicht die am Verteiler
    // entscheidet, ob das Reststück ohne weitere Pumpe trägt. Bei einer Kuppe
    // liegt sie oben und nicht am Ende.
    const restMaxDrop = maxDropBetween(
      profile,
      drop,
      currentDistance,
      totalDistance
    );

    // Reicht der Ausgangsdruck bis zum Ende, ist die Leitung fertig — wenn
    // unterwegs nirgends der Mindestdruck unterschritten wird.
    if (
      totalDrop - currentDrop <= ausgangsdruck - zieldruck + EPS &&
      restMaxDrop - currentDrop <= ausgangsdruck - eingangsdruck + EPS
    ) {
      break;
    }

    // Der weiteste erreichbare Punkt, und der erste, von dem aus der Rest noch
    // trägt. Der frühere von beiden gewinnt: Auf 2000 m flach wäre der weiteste
    // 1950 m — 50 m vor dem Verteiler, ein unsinniger Standort. Die Pumpenzahl
    // ist dieselbe, die Reserve größer.
    //
    // „Der Rest trägt" heißt beides: der Zieldruck am Verteiler **und** der
    // Mindestdruck an der höchsten Stelle dazwischen. Ohne die zweite Bedingung
    // rückte die Pumpe hinter eine Kuppe, über die sie das Wasser erst bringen
    // muss.
    const reachDrop = currentDrop + (ausgangsdruck - eingangsdruck);
    const endReachableDrop = Math.max(
      totalDrop - (ausgangsdruck - zieldruck),
      restMaxDrop - (ausgangsdruck - eingangsdruck)
    );
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
      break;
    }

    distances.push(nextDistance);
    currentDistance = nextDistance;
    currentDrop = dropAt(profile, drop, nextDistance);
  }

  // Erst wenn die Lage trägt, werden die Standorte gleichmäßig verteilt: Bei
  // einer Leitung, die so nicht zu legen ist, wäre eine schönere Verteilung
  // eine Aussage über etwas, das es nicht gibt.
  let placed = distances;
  let verteilung: FoerderungVerteilung | undefined;
  if (darstellbar && !exceeded && distances.length > 0) {
    const balanced = balancedDistances(
      profile,
      drop,
      distances.length + 1,
      totalDrop,
      ausgangsdruck,
      eingangsdruck,
      zieldruck
    );
    if (
      balanced &&
      isFeasible(
        profile,
        drop,
        balanced.distances,
        totalDistance,
        totalDrop,
        ausgangsdruck,
        eingangsdruck,
        zieldruck
      )
    ) {
      placed = balanced.distances;
      verteilung = balanced.verteilung;
    }
  }

  const built = layout(
    profile,
    drop,
    placed,
    totalDistance,
    totalDrop,
    ausgangsdruck
  );

  // Der Abbruch an `MAX_PUMPS` hat kein Ende der Leitung erreicht; ein letzter
  // Abschnitt bis zum Verteiler wäre dort erfunden.
  const abschnitte = exceeded ? built.abschnitte.slice(0, -1) : built.abschnitte;
  const enddruck = exceeded
    ? ausgangsdruck - (totalDrop - currentDrop)
    : built.enddruck;

  return {
    pumps: built.pumps,
    verstaerkerpumpen: built.pumps.length - 1,
    ...(verteilung ? { verteilung } : {}),
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
