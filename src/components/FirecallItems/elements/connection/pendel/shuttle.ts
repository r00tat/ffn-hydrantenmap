/**
 * Löschwasser-Pendelverkehr: Umlaufzeit, dauerhaft lieferbare Menge und die
 * Grenzen, an denen sie hängt.
 *
 * Reine Zahlen: kein Leaflet, kein Firestore, keine Feldnamen. Damit ist diese
 * Datei gegen handgerechnete Beispiele prüfbar, und die Fassade
 * (`pendelverkehr.ts`) gegen die Vorbelegungen, ohne dass die Formel im Spiel
 * ist.
 *
 * Herkunft der Vorgabewerte und die Begründung des Modells:
 * docs/pendelverkehr.md.
 */

/** Rundungsreserve für die Vergleiche, wie in `hydraulics.ts`. */
const EPS = 1e-9;

export interface ShuttleInput {
  /** Einfache Fahrstrecke Entnahmestelle → Einsatzstelle in m. */
  strecke: number;
  /** Durchschnittsgeschwindigkeit der Einsatzfahrt in km/h. */
  geschwindigkeit: number;
  /** Tankinhalt je Fahrzeug in l. */
  tankinhalt: number;
  /**
   * Ergiebigkeit der Entnahmestelle in l/min.
   *
   * Die Füllzeit wird daraus gerechnet und **nicht** eingegeben: Eine feste
   * Füllzeit behauptet neben einer geänderten Tankgröße stillschweigend eine
   * Leistung, die niemand geprüft hat. `undefined`, solange sie unbekannt
   * ist — dann wird nicht gerechnet, statt einen Wert zu raten.
   */
  fuellleistung?: number;
  /** An- und Abfahren an der Entnahmestelle in min. */
  rangierzeit: number;
  /** Entleerzeit an der Einsatzstelle in min. */
  entleerzeit: number;
  /** Anzahl der pendelnden Fahrzeuge. */
  fahrzeuge: number;
  /** Geforderte Menge an der Einsatzstelle in l/min. */
  sollMenge: number;
}

export interface ShuttleResult {
  /** Hin und zurück in min. */
  fahrzeit: number;
  /** Füllen plus Rangieren in min — die Zeit, in der die Entnahmestelle besetzt ist. */
  fuellzeit: number;
  /** Fahrzeit plus Füllen plus Entleeren, in min. */
  umlaufzeit: number;
  /** Dauerhaft lieferbare Menge in l/min, Füllstelle eingerechnet. */
  menge: number;
  /** Die Menge ohne die Schranke der Füllstelle — nur zur Erklärung. */
  mengeOhneFuellstelle: number;
  /**
   * Was die Entnahmestelle als Füllstelle hergibt: ein Tankinhalt je Füllzeit.
   *
   * Liegt **unter** der Ergiebigkeit, wenn Rangierzeit im Spiel ist — die
   * Entnahmestelle ist auch dann besetzt, wenn gerade kein Wasser läuft.
   */
  fuellstellenLeistung: number;
  /** Ob die Füllstelle und nicht die Fahrzeugzahl die Menge bestimmt. */
  begrenztDurchFuellstelle: boolean;
  /** Fahrzeuge, die die Füllstelle noch auslasten kann (nicht gerundet). */
  fahrzeugeFuellstelle: number;
  /** Fahrzeuge für die Sollmenge, ohne die Schranke der Füllstelle. */
  fahrzeugeFuerSollmenge: number;
  /** Ob die Lage die Sollmenge dauerhaft trägt. */
  traegtSollmenge: boolean;
  /**
   * Einfache Fahrstrecke in m, ab der die Sollmenge nicht mehr getragen wird.
   * `undefined`, wenn sie auch ohne jede Fahrzeit nicht erreichbar ist.
   */
  kipppunkt?: number;
  /** Ob die Abgabe Lücken hat und deshalb ein Puffer nötig ist. */
  faltbehaelter: boolean;
  /** Fahrzeuge, die für eine lückenlose Abgabe ohne Puffer nötig wären. */
  fahrzeugeOhnePuffer: number;
  /** Minuten bis zur ersten Wasserabgabe. */
  ersteWasserabgabe: number;
  /** Minuten bis zum eingeschwungenen Umlauf. */
  eingeschwungenNach: number;
}

/** km/h in m/min — die Zeiten sind Minuten, die Strecken Meter. */
const metrePerMinute = (kmh: number): number => (kmh * 1000) / 60;

/**
 * Das Ergebnis, oder `undefined`, wenn eine Eingabe nicht rechenbar ist.
 *
 * Eine Null bei Geschwindigkeit, Tankinhalt, Füll- oder Entleerzeit ist keine
 * Lage, sondern eine leere Eingabe: Sie würde durch Null teilen und eine
 * unendliche Menge ausweisen. Der Aufrufer sagt dann, dass nicht gerechnet
 * wird — er rät keinen Wert.
 */
export function computeShuttle(input: ShuttleInput): ShuttleResult | undefined {
  const {
    strecke,
    geschwindigkeit,
    tankinhalt,
    fuellleistung,
    rangierzeit,
    entleerzeit,
    fahrzeuge,
    sollMenge,
  } = input;

  if (
    !Number.isFinite(strecke) ||
    strecke < 0 ||
    !(geschwindigkeit > 0) ||
    !(tankinhalt > 0) ||
    !(fuellleistung !== undefined && fuellleistung > 0) ||
    !(Number.isFinite(rangierzeit) && rangierzeit >= 0) ||
    !(entleerzeit > 0) ||
    !(fahrzeuge >= 1)
  ) {
    return undefined;
  }

  // Die Füllzeit ist gerechnet, nicht gesetzt: Tankinhalt durch Ergiebigkeit,
  // plus An- und Abfahren.
  const fuellzeit = tankinhalt / fuellleistung + rangierzeit;
  const fahrzeit = (2 * strecke) / metrePerMinute(geschwindigkeit);
  const umlaufzeit = fahrzeit + fuellzeit + entleerzeit;

  // Die Fahrzeuge tragen je einen Tankinhalt pro Umlauf …
  const mengeOhneFuellstelle = (fahrzeuge * tankinhalt) / umlaufzeit;
  // … aber an der Entnahmestelle füllt immer nur eines. Ab dieser Schranke
  // stehen die weiteren in der Schlange, und die Menge steigt nicht mehr.
  const fuellstellenLeistung = tankinhalt / fuellzeit;
  const menge = Math.min(mengeOhneFuellstelle, fuellstellenLeistung);

  // Lückenlose Abgabe verlangt, dass immer ein Fahrzeug am Entleeren ist.
  // Sonst liegt zwischen zwei Fahrzeugen eine Pause, und die überbrückt nur
  // ein Puffer.
  const fahrzeugeOhnePuffer = Math.ceil(umlaufzeit / entleerzeit - EPS);

  return {
    fahrzeit,
    fuellzeit,
    umlaufzeit,
    menge,
    mengeOhneFuellstelle,
    fuellstellenLeistung,
    begrenztDurchFuellstelle:
      mengeOhneFuellstelle > fuellstellenLeistung + EPS,
    fahrzeugeFuellstelle: umlaufzeit / fuellzeit,
    fahrzeugeFuerSollmenge: Math.ceil((sollMenge * umlaufzeit) / tankinhalt),
    traegtSollmenge: menge + EPS >= sollMenge,
    kipppunkt: tippingDistance(input),
    faltbehaelter: fahrzeuge < fahrzeugeOhnePuffer,
    fahrzeugeOhnePuffer,
    // Das erste Fahrzeug steht voll an der Einsatzstelle und gibt sofort ab;
    // eingeschwungen ist der Umlauf erst, wenn es zurück ist.
    ersteWasserabgabe: 0,
    eingeschwungenNach: umlaufzeit,
  };
}

/**
 * Die Entfernung, ab der die Sollmenge kippt — geschlossen gelöst, nicht
 * gesucht.
 *
 * Aus `n·V / t_umlauf = Q_soll` folgt die zulässige Umlaufzeit `n·V/Q_soll`;
 * was davon nach Füllen und Entleeren übrig bleibt, ist die Fahrzeit, und deren
 * halbe Strecke die einfache Entfernung.
 *
 * `undefined` in zwei Fällen, und in beiden wäre eine Zahl irreführend:
 *
 * - Die Füllstelle deckelt unter der Sollmenge. Dann trägt **keine** Entfernung
 *   sie, auch 0 m nicht — es ist kein Kippen, sondern eine harte Grenze.
 * - Die zulässige Umlaufzeit ist schon ohne Fahrzeit aufgebraucht. Dasselbe:
 *   nicht zu wenig Weg, sondern zu wenige Fahrzeuge.
 */
function tippingDistance(input: ShuttleInput): number | undefined {
  const {
    geschwindigkeit,
    tankinhalt,
    fuellleistung,
    rangierzeit,
    entleerzeit,
    fahrzeuge,
    sollMenge,
  } = input;

  if (!(sollMenge > 0)) return undefined;
  if (!(fuellleistung !== undefined && fuellleistung > 0)) return undefined;

  const fuellzeit = tankinhalt / fuellleistung + rangierzeit;
  if (tankinhalt / fuellzeit + EPS < sollMenge) return undefined;

  const zulaessigeUmlaufzeit = (fahrzeuge * tankinhalt) / sollMenge;
  const zulaessigeFahrzeit = zulaessigeUmlaufzeit - fuellzeit - entleerzeit;
  if (zulaessigeFahrzeit <= EPS) return undefined;

  return (zulaessigeFahrzeit * metrePerMinute(geschwindigkeit)) / 2;
}
