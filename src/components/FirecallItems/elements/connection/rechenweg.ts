/**
 * Der Rechenweg: die Schritte, aus denen eine Zahl im Rechner entsteht.
 *
 * Beide Rechner der Löschwasserversorgung — Förderung über lange Wegstrecke und
 * Pendelverkehr — geben am Ende wenige große Zahlen aus: „5 Verstärkerpumpen",
 * „530 l/min dauerhaft". Wer damit eine Entscheidung trifft, muss sie
 * nachrechnen können. Bisher stand die Herleitung nur in `docs/` und im
 * Quelltext; an der Einsatzstelle hat niemand beides.
 *
 * Ein Schritt ist deshalb **nicht** bloß ein Wert mit Beschriftung, sondern
 * zusätzlich
 *
 * - die **Rechnung mit eingesetzten Zahlen** (`rechnung`) — nicht die Formel mit
 *   Symbolen: `2 · 2000 m / 666,7 m/min` ist nachzurechnen, `2·s/v` nicht, und
 *   eine Formel, deren Symbole man erst auflösen muss, ist keine Kontrolle;
 * - die **Herkunft** (`herkunft`) — ob die Zahl gemessen, eingegeben, aus der
 *   Ausbildungsunterlage oder ein Planungswert ohne Unterlage ist. Das ist die
 *   eigentliche Auskunft: Eine gerechnete Zahl ist nur so belastbar wie ihre
 *   schwächste Eingangsgröße, und die steht sonst nirgends.
 *
 * Reine Zahlen und Text, kein React und kein Firestore: Die Bauer
 * (`foerderung/rechenweg.ts`, `pendel/rechenweg.ts`) sind damit gegen
 * handgerechnete Beispiele prüfbar. Formatiert wird über eine übergebene
 * Funktion — die Sprache des Benutzers gehört nicht in ein Rechenmodul, und
 * „12.5" mit englischem Punkt in einer deutschen Oberfläche wäre genau der
 * Fehler, den `usePanelNumber` sonst verhindert.
 */

/**
 * Woher eine Zahl stammt.
 *
 * Die Unterscheidung `tabelle`/`vorgabe` ist der Kern: Der Reibungsverlust
 * steht in einer Ausbildungsunterlage, die Verlegeleistung von 100 m/min ist
 * geschätzt. Beide erscheinen im Ergebnis als Zahl; nur eine von beiden ist
 * belegt.
 */
export type RechenwegHerkunft =
  /** Von Hand eingetragen. */
  | 'eingabe'
  /** Planungswert ohne Unterlage — überschreibbar, aber nicht belegt. */
  | 'vorgabe'
  /** Aus der Ausbildungsunterlage. */
  | 'tabelle'
  /** Aus Karte, Höhenmodell oder GIS-Bestand. */
  | 'gemessen'
  /** Aus einem Tabellenwert umgerechnet, nicht selbst tabelliert. */
  | 'abgeleitet'
  /** Aus den Zeilen darüber. */
  | 'gerechnet';

/**
 * Die Beschriftungen als Aufzählung von Nachrichtenschlüsseln.
 *
 * Literale und **kein** zusammengesetzter Schlüssel: next-intl prüft die
 * Schlüssel statisch, ein `t(`step_${name}`)` wäre zu `string` verbreitert und
 * damit ungeprüft. So scheitert stattdessen der Typecheck, wenn ein Schritt
 * eine Beschriftung nennt, die im Katalog fehlt.
 */
export type RechenwegLabel =
  // Pendelverkehr
  | 'stepDriveDistance'
  | 'stepSpeed'
  | 'stepSpeedPerMinute'
  | 'stepDriveTime'
  | 'stepTankVolume'
  | 'stepFillRate'
  | 'stepNetFillTime'
  | 'stepShuntTime'
  | 'stepFillTime'
  | 'stepEmptyTime'
  | 'stepCycleTime'
  | 'stepVehicles'
  | 'stepFlowFromVehicles'
  | 'stepFillStationLimit'
  | 'stepShuttleFlow'
  | 'stepRequiredFlow'
  | 'stepVehiclesForRequiredFlow'
  | 'stepTippingPoint'
  | 'stepVehiclesWithoutBuffer'
  | 'stepSteadyAfter'
  // Förderung
  | 'stepLineLength'
  | 'stepParallelLines'
  | 'stepFlowPerLine'
  | 'stepDimension'
  | 'stepHoseLength'
  | 'stepFrictionHose'
  | 'stepFrictionCouplings'
  | 'stepFrictionTotal'
  | 'stepFrictionOverLine'
  | 'stepElevationDifference'
  | 'stepElevationLoss'
  | 'stepTotalDrop'
  | 'stepPumpOutlet'
  | 'stepPumpInlet'
  | 'stepTargetPressure'
  | 'stepUsableBetweenPumps'
  | 'stepUsableToOutlet'
  | 'stepSections'
  | 'stepCapacity'
  | 'stepUtilisation'
  | 'stepDropPerSection'
  | 'stepBoosterPumps'
  | 'stepEndPressure'
  | 'stepHoseCount';

/** Anmerkungen an einer Zeile, ebenfalls als geprüfte Schlüssel. */
export type RechenwegHinweis =
  | 'hintNoValueFillStation'
  | 'hintNoValueNoVehicles'
  | 'hintNoValueNoRequirement'
  | 'hintDrawnDistance'
  | 'hintManualElevation'
  | 'hintAssumedFlat'
  | 'hintNotFeasible'
  | 'hintGreedyPlacement'
  | 'hintTableIncludesCouplings';

export interface RechenSchritt {
  label: RechenwegLabel;
  /**
   * Die Rechnung mit eingesetzten Zahlen. Fehlt bei Eingaben und Messwerten —
   * dort gibt es nichts nachzurechnen, und ein leeres Feld sagt genau das.
   */
  rechnung?: string;
  /** Das Ergebnis, schon formatiert. `undefined`, wenn es keines gibt. */
  wert?: string;
  /** Einheit. Die Symbole sind in beiden Sprachen dieselben. */
  einheit?: string;
  herkunft: RechenwegHerkunft;
  hinweis?: RechenwegHinweis;
  /** Die Zahl, auf die der Abschnitt hinausläuft — hervorgehoben. */
  ergebnis?: boolean;
}

/**
 * Zahl zu Text, in der Sprache des Benutzers.
 *
 * Übergeben statt importiert: `usePanelNumber` ist ein Hook und hinge React an
 * ein Rechenmodul. Ein Test reicht `String(...)` herein und prüft die Rechnung,
 * nicht die Formatierung.
 */
export type RechenwegFormat = (value: number, digits?: number) => string;

/**
 * Ob eine Zahl noch die Vorbelegung ist.
 *
 * Ein Planungswert, den jemand ausdrücklich bestätigt hat, ist immer noch ein
 * Planungswert — verglichen wird deshalb der Wert und nicht, ob das Feld
 * angefasst wurde. Die Verwechslungsgefahr ist gering und die Alternative wäre
 * ein zweites Feld je Größe, nur um „von Hand gesetzt" zu vermerken.
 *
 * Einmal hier und nicht je Rechner: Die Regel ist dieselbe, und zwei Kopien
 * würden auseinanderlaufen, während beide durch dieselbe Legende erklärt
 * werden.
 */
export const herkunftVonVorgabe = (
  value: number,
  vorgabe: number
): RechenwegHerkunft => (value === vorgabe ? 'vorgabe' : 'eingabe');
