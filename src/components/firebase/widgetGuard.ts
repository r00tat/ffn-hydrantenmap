/**
 * Sorgt dafuer, dass FirebaseUI je Container genau einmal gestartet wird.
 *
 * `ui.start()` setzt die zuvor gestartete Instanz zurueck — in FirebaseUIs
 * Render-Funktion steht `if (In) { … In.reset() }`. Und `reset()` verwirft
 * ein **laufendes** Einloesen: Es setzt das Ergebnis auf
 * `{user: null, credential: null}` und loescht `redirectStatus`.
 *
 * Beim Redirect-Weg ist das fatal. Die Seite kommt nach Google neu hoch, und
 * FirebaseUI beginnt sofort einzuloesen. Startet das Widget waehrenddessen
 * ein zweites Mal, bricht der erste Lauf ab: Die Anmeldung bleibt auf
 * FirebaseUIs Wegwerf-App `[DEFAULT]-firebaseui-temp` haengen und erreicht
 * unsere App nie — ohne Fehler, ohne Rueckmeldung. Danach meldet
 * `isPendingRedirect()` nichts mehr, und es erscheint wieder das
 * Anmeldeformular, als waere nichts geschehen.
 *
 * Genau zwei Aufrufe passieren aber regelmaessig: React ruft Effekte im
 * StrictMode zweimal auf. Beim Popup faellt es nicht auf, weil zwischen
 * Seitenaufbau und Klick Sekunden liegen.
 *
 * **Bewusst ohne Gegenstueck zum Freigeben.** Ein `release` im Cleanup des
 * Effekts liefe genau im StrictMode-Doppellauf und liesse den zweiten Start
 * wieder zu — der Fehler waere zurueck. Beim echten Aus- und Wiedereinhaengen
 * baut React ohnehin ein neues Container-Element, und das ist dann ein
 * anderes Element als das gemerkte.
 */
let startedContainer: Element | null = null;

/**
 * `true`, wenn fuer dieses Element noch nicht gestartet wurde — nur dann darf
 * `ui.start()` laufen.
 */
export function claimWidgetContainer(container: Element): boolean {
  if (startedContainer === container) return false;
  startedContainer = container;
  return true;
}
