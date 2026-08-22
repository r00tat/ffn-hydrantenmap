import { describe, expect, it } from 'vitest';
import { computeShuttle, type ShuttleInput, type ShuttleResult } from './shuttle';

/**
 * Der Prüfstein: 2000 m einfache Fahrstrecke, 40 km/h, 2000 l Tankinhalt,
 * 800 l/min an der Entnahmestelle, 1 min Rangieren, 3 min Entleerzeit.
 *
 * Von Hand: Hin und zurück sind 4 km, bei 40 km/h 6 min. Füllen dauert
 * 2000/800 = 2,5 min plus 1 min Rangieren, also 3,5 min. Mit dem Entleeren ist
 * die Umlaufzeit 12,5 min. Ein Fahrzeug liefert 2000 l je 12,5 min, also
 * 160 l/min.
 */
const input = (overrides: Partial<ShuttleInput> = {}): ShuttleInput => ({
  strecke: 2000,
  geschwindigkeit: 40,
  tankinhalt: 2000,
  fuellleistung: 800,
  rangierzeit: 1,
  entleerzeit: 3,
  fahrzeuge: 1,
  sollMenge: 1000,
  ...overrides,
});

/** Das Ergebnis, oder ein Fehler — die Zusicherungen unten setzen es voraus. */
const run = (overrides: Partial<ShuttleInput> = {}): ShuttleResult => {
  const result = computeShuttle(input(overrides));
  if (!result) throw new Error('computeShuttle lieferte kein Ergebnis');
  return result;
};

describe('computeShuttle', () => {
  it('rechnet die Füllzeit aus Tankinhalt, Füllleistung und Rangieren', () => {
    const result = run();
    expect(result.fuellzeit).toBeCloseTo(3.5, 9);
  });

  it('rechnet die Umlaufzeit aus Fahrzeit, Füllen und Entleeren', () => {
    const result = run();
    expect(result.fahrzeit).toBeCloseTo(6, 9);
    expect(result.umlaufzeit).toBeCloseTo(12.5, 9);
  });

  it('liefert mit einem Fahrzeug 160 l/min', () => {
    const result = run();
    expect(result.menge).toBeCloseTo(2000 / 12.5, 6);
    expect(result.menge).toBeCloseTo(160, 6);
    expect(result.begrenztDurchFuellstelle).toBe(false);
  });

  it('liefert mit drei Fahrzeugen 480 l/min', () => {
    // 3 · 2000 / 12,5 = 480 — noch unter der Schranke von 2000/3,5 = 571.
    const result = run({ fahrzeuge: 3 });
    expect(result.menge).toBeCloseTo(480, 6);
    expect(result.begrenztDurchFuellstelle).toBe(false);
  });

  it('deckelt die Menge an der Füllstelle statt sie weiter zu steigern', () => {
    // Die Schranke ist ein Tankinhalt je Füllzeit: 2000 l je 3,5 min =
    // 571,4 l/min. Sie liegt **unter** der Füllleistung von 800, weil die
    // Entnahmestelle auch während des Rangierens besetzt ist.
    const vier = run({ fahrzeuge: 4 });
    expect(vier.fuellstellenLeistung).toBeCloseTo(2000 / 3.5, 6);
    expect(vier.menge).toBeCloseTo(2000 / 3.5, 6);
    expect(vier.begrenztDurchFuellstelle).toBe(true);

    // Und zehn liefern auch nicht mehr — an einer Entnahmestelle füllt immer
    // nur ein Fahrzeug.
    const zehn = run({ fahrzeuge: 10 });
    expect(zehn.menge).toBeCloseTo(2000 / 3.5, 6);
    expect(zehn.fahrzeugeFuellstelle).toBeCloseTo(12.5 / 3.5, 9);
  });

  it('ist ohne Rangierzeit genau die Füllleistung', () => {
    // Ohne Rangieren fällt die Schranke mit der Ergiebigkeit der
    // Entnahmestelle zusammen — der Hydrant ist dann die Grenze, nichts sonst.
    const result = run({ rangierzeit: 0, fahrzeuge: 10 });
    expect(result.fuellstellenLeistung).toBeCloseTo(800, 6);
    expect(result.menge).toBeCloseTo(800, 6);
  });

  it('nennt die Fahrzeuge, die die Sollmenge tragen', () => {
    // 1000 l/min · 12,5 min / 2000 l = 6,25 → 7 Fahrzeuge. Die Füllstelle gibt
    // aber nur 571 l/min her, also trägt keine Zahl von Fahrzeugen die Menge.
    const result = run({ sollMenge: 1000 });
    expect(result.fahrzeugeFuerSollmenge).toBe(7);
    expect(result.traegtSollmenge).toBe(false);
  });

  it('trägt die Sollmenge, sobald Fahrzeuge und Füllstelle reichen', () => {
    expect(run({ fahrzeuge: 3, sollMenge: 400 }).traegtSollmenge).toBe(true);
  });

  it('löst den Kipppunkt als Umkehrung der Mengenformel', () => {
    // 3 · 2000 / 400 = 15 min Umlaufzeit; abzüglich 3,5 min Füllen und 3 min
    // Entleeren bleiben 8,5 min Fahrzeit, bei 666,7 m/min also 2833,3 m.
    const result = run({ fahrzeuge: 3, sollMenge: 400 });
    expect(result.kipppunkt).toBeCloseTo(2833.33, 1);

    // Genau dort liefert die Formel die Sollmenge — sonst wäre der Wert nur
    // eine Behauptung.
    const amKipppunkt = run({
      fahrzeuge: 3,
      sollMenge: 400,
      strecke: result.kipppunkt as number,
    });
    expect(amKipppunkt.menge).toBeCloseTo(400, 6);
  });

  it('nennt keinen Kipppunkt, wenn die Menge schon bei 0 m nicht getragen wird', () => {
    // n·V/Q_soll = 1 · 2000 / 1000 = 2 min, weniger als Füllen und Entleeren
    // zusammen — die Sollmenge ist ohne jede Fahrzeit schon nicht erreichbar.
    expect(run({ fahrzeuge: 1, sollMenge: 1000 }).kipppunkt).toBeUndefined();
  });

  it('nennt keinen Kipppunkt, wenn die Füllstelle die Sollmenge deckelt', () => {
    // Zehn Fahrzeuge kämen rechnerisch weit, die Füllstelle gibt aber nur
    // 571 l/min her: Die Sollmenge 600 ist bei keiner Entfernung zu tragen.
    const result = run({ fahrzeuge: 10, sollMenge: 600 });
    expect(result.kipppunkt).toBeUndefined();
    expect(result.traegtSollmenge).toBe(false);
  });

  it('braucht einen Faltbehälter, solange nicht durchgehend entleert wird', () => {
    // Ohne Puffer muss immer ein Fahrzeug am Entleeren sein: n ≥ 12,5/3 = 4,17.
    expect(run({ fahrzeuge: 4 }).faltbehaelter).toBe(true);
    expect(run({ fahrzeuge: 5 }).faltbehaelter).toBe(false);
    expect(run({ fahrzeuge: 4 }).fahrzeugeOhnePuffer).toBe(5);
  });

  it('ist an der Kante der Entleer-Regel nicht mehr auf den Puffer angewiesen', () => {
    // 1000 m bei 40 km/h sind 3 min Fahrzeit; mit 2000 l bei 1000 l/min ohne
    // Rangieren sind das 2 min Füllen, plus 4 min Entleeren ⇒ Umlauf 9 min,
    // und genau 3 Fahrzeuge entleeren lückenlos (9/3 = 3).
    const kante = {
      strecke: 1000,
      fuellleistung: 1000,
      rangierzeit: 0,
      entleerzeit: 4,
    };
    expect(run({ ...kante, fahrzeuge: 3 }).umlaufzeit).toBeCloseTo(9, 9);
    expect(run({ ...kante, fahrzeuge: 3 }).faltbehaelter).toBe(false);
    expect(run({ ...kante, fahrzeuge: 2 }).faltbehaelter).toBe(true);
  });

  it('gibt die erste Wasserabgabe sofort und den Umlauf nach einer Umlaufzeit', () => {
    const result = run();
    expect(result.ersteWasserabgabe).toBe(0);
    expect(result.eingeschwungenNach).toBeCloseTo(12.5, 9);
  });

  it('rechnet nicht mit unbrauchbaren Eingaben', () => {
    expect(computeShuttle(input({ geschwindigkeit: 0 }))).toBeUndefined();
    expect(computeShuttle(input({ tankinhalt: 0 }))).toBeUndefined();
    // Ohne Ergiebigkeit der Entnahmestelle wird nicht geraten: Die Füllzeit
    // wäre unendlich, und ein Vorgabewert wäre genau die Annahme, die hier
    // abgeschafft wurde.
    expect(computeShuttle(input({ fuellleistung: 0 }))).toBeUndefined();
    expect(computeShuttle(input({ fuellleistung: undefined }))).toBeUndefined();
    expect(computeShuttle(input({ entleerzeit: 0 }))).toBeUndefined();
    expect(computeShuttle(input({ fahrzeuge: 0 }))).toBeUndefined();
    expect(computeShuttle(input({ strecke: -1 }))).toBeUndefined();
    expect(computeShuttle(input({ rangierzeit: -1 }))).toBeUndefined();
  });
});
