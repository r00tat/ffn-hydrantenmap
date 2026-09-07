import { act } from '@testing-library/react';

/**
 * Ruft eine asynchrone Hook-Methode auf und gibt React Gelegenheit, die dabei
 * ausgelösten State-Updates einzuspielen. Der Rückgabewert wird durchgereicht,
 * damit die Aufrufstelle eine Zeile bleibt:
 *
 * ```ts
 * const answer = await actAsync(() => result.current.processText('…'));
 * ```
 *
 * `renderHook` rendert den Hook in einer internen Komponente, die React
 * `TestComponent` nennt. Ruft ein Test eine Methode daran direkt auf, läuft
 * das `setState` darin außerhalb von `act` und React meldet „An update to
 * TestComponent inside a test was not wrapped in act(...)".
 *
 * Solange der Test nur den Rückgabewert prüft, ist das folgenlos — deshalb war
 * die Suite auch mit den Warnungen grün. Sobald er danach aber
 * `result.current` liest, sieht er den Zustand *vor* dem Update. Genau diese
 * Falle nimmt der Helper weg.
 */
export async function actAsync<T>(fn: () => Promise<T>): Promise<T> {
  let value!: T;
  await act(async () => {
    value = await fn();
  });
  return value;
}

/**
 * Lässt die beim Rendern angestoßenen asynchronen Effekte auslaufen, bevor der
 * Test weiterprüft.
 *
 * Nötig für Komponenten, die beim Einhängen Daten nachladen (Geländehöhe,
 * Bilder, Konfiguration). Ein synchroner Test ist fertig, bevor das Promise
 * auflöst; das `setState` danach meldet React als „not wrapped in act(...)",
 * und die Zusicherungen liefen gegen den Zustand *vor* dem Nachladen.
 *
 * Nach dem Rendern aufgerufen, prüft der Test den eingeschwungenen Zustand.
 * Wo ein Test auf ein Element wartet, das erst durch das Nachladen erscheint,
 * ist `await screen.findBy…` die bessere Wahl — es sagt, worauf gewartet wird.
 */
export async function flushEffects(): Promise<void> {
  await act(async () => {});
}
