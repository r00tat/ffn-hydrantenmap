/**
 * Der Rechenweg des Pendelverkehrs: jede Zahl der Umlaufformel als eigener
 * Schritt, mit eingesetzten Werten und Herkunft.
 *
 * Die Reihenfolge ist die der Formel und nicht die des Panels: erst die
 * Fahrzeit, dann die Füllzeit, daraus die Umlaufzeit, daraus die Menge. Wer
 * nachrechnet, liest von oben nach unten und braucht keine Zeile, die weiter
 * unten steht.
 *
 * Begründung des Modells: docs/pendelverkehr.md. Formel: `shuttle.ts`.
 */

import type {
  RechenSchritt,
  RechenwegFormat,
} from '../rechenweg';
import { PENDEL_DEFAULTS } from './defaults';
import type { PendelView } from './pendelverkehr';

/**
 * Ob eine Zahl noch die Vorbelegung ist.
 *
 * Ein Planungswert, den jemand ausdrücklich bestätigt hat, ist immer noch ein
 * Planungswert — verglichen wird deshalb der Wert und nicht, ob das Feld
 * angefasst wurde. Die Verwechslungsgefahr ist gering und die Alternative wäre
 * ein zweites Feld je Größe, nur um „von Hand gesetzt" zu vermerken.
 */
const herkunft = (value: number, vorgabe: number) =>
  value === vorgabe ? ('vorgabe' as const) : ('eingabe' as const);

export function pendelRechenweg(
  view: PendelView,
  fmt: RechenwegFormat
): RechenSchritt[] {
  const { params, result } = view;
  const schritte: RechenSchritt[] = [];

  schritte.push({
    label: 'stepDriveDistance',
    wert: fmt(view.strecke, 0),
    einheit: 'm',
    herkunft: 'gemessen',
    ...(view.streckeSource === 'drawn' ? { hinweis: 'hintDrawnDistance' as const } : {}),
  });

  schritte.push({
    label: 'stepSpeed',
    wert: fmt(params.geschwindigkeit, 0),
    einheit: 'km/h',
    herkunft: herkunft(params.geschwindigkeit, PENDEL_DEFAULTS.geschwindigkeit),
  });

  // Die Umrechnung als eigener Schritt: Die Fahrzeit teilt Meter durch
  // Meter je Minute, und ohne diese Zeile steht in der nächsten eine Zahl, die
  // nirgends eingegeben wurde.
  const mPerMin = (params.geschwindigkeit * 1000) / 60;
  schritte.push({
    label: 'stepSpeedPerMinute',
    rechnung: `${fmt(params.geschwindigkeit, 0)} · 1000 / 60`,
    wert: fmt(mPerMin, 1),
    einheit: 'm/min',
    herkunft: 'gerechnet',
  });

  if (result) {
    schritte.push({
      label: 'stepDriveTime',
      rechnung: `2 · ${fmt(view.strecke, 0)} m / ${fmt(mPerMin, 1)} m/min`,
      wert: fmt(result.fahrzeit, 1),
      einheit: 'min',
      herkunft: 'gerechnet',
    });
  }

  schritte.push({
    label: 'stepTankVolume',
    wert: fmt(params.tankinhalt, 0),
    einheit: 'l',
    herkunft: herkunft(params.tankinhalt, PENDEL_DEFAULTS.tankinhalt),
  });

  schritte.push({
    label: 'stepFillRate',
    wert:
      params.fuellleistung !== undefined
        ? fmt(params.fuellleistung, 0)
        : undefined,
    einheit: 'l/min',
    // Kein Vorgabewert — die Ergiebigkeit kommt aus dem Hydranten oder von
    // Hand. Genau darin liegt der Unterschied zur alten festen Füllzeit.
    herkunft: view.fuellleistungSource === 'hydrant' ? 'gemessen' : 'eingabe',
  });

  if (result) {
    schritte.push({
      label: 'stepNetFillTime',
      rechnung: `${fmt(params.tankinhalt, 0)} l / ${fmt(
        params.fuellleistung ?? 0,
        0
      )} l/min`,
      wert: fmt(result.nettoFuellzeit, 1),
      einheit: 'min',
      herkunft: 'gerechnet',
    });
  }

  schritte.push({
    label: 'stepShuntTime',
    wert: fmt(params.rangierzeit, 1),
    einheit: 'min',
    herkunft: herkunft(params.rangierzeit, PENDEL_DEFAULTS.rangierzeit),
  });

  if (result) {
    schritte.push({
      label: 'stepFillTime',
      rechnung: `${fmt(result.nettoFuellzeit, 1)} min + ${fmt(
        params.rangierzeit,
        1
      )} min`,
      wert: fmt(result.fuellzeit, 1),
      einheit: 'min',
      herkunft: 'gerechnet',
    });
  }

  schritte.push({
    label: 'stepEmptyTime',
    wert: fmt(params.entleerzeit, 1),
    einheit: 'min',
    herkunft: herkunft(params.entleerzeit, PENDEL_DEFAULTS.entleerzeit),
  });

  if (!result) return schritte;

  schritte.push({
    label: 'stepCycleTime',
    rechnung: `${fmt(result.fahrzeit, 1)} min + ${fmt(
      result.fuellzeit,
      1
    )} min + ${fmt(params.entleerzeit, 1)} min`,
    wert: fmt(result.umlaufzeit, 1),
    einheit: 'min',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepVehicles',
    wert: fmt(params.fahrzeuge, 0),
    einheit: undefined,
    herkunft: herkunft(params.fahrzeuge, PENDEL_DEFAULTS.fahrzeuge),
  });

  schritte.push({
    label: 'stepFlowFromVehicles',
    rechnung: `${fmt(params.fahrzeuge, 0)} · ${fmt(
      params.tankinhalt,
      0
    )} l / ${fmt(result.umlaufzeit, 1)} min`,
    wert: fmt(result.mengeOhneFuellstelle, 0),
    einheit: 'l/min',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepFillStationLimit',
    rechnung: `${fmt(params.tankinhalt, 0)} l / ${fmt(
      result.fuellzeit,
      1
    )} min`,
    wert: fmt(result.fuellstellenLeistung, 0),
    einheit: 'l/min',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepShuttleFlow',
    rechnung: `min(${fmt(result.mengeOhneFuellstelle, 0)}; ${fmt(
      result.fuellstellenLeistung,
      0
    )})`,
    wert: fmt(result.menge, 0),
    einheit: 'l/min',
    herkunft: 'gerechnet',
    ergebnis: true,
  });

  schritte.push({
    label: 'stepRequiredFlow',
    wert: fmt(view.sollMenge, 0),
    einheit: 'l/min',
    herkunft: 'eingabe',
  });

  schritte.push({
    label: 'stepVehiclesForRequiredFlow',
    ...(result.fahrzeugeFuerSollmenge !== undefined
      ? {
          rechnung: `⌈${fmt(view.sollMenge, 0)} l/min · ${fmt(
            result.umlaufzeit,
            1
          )} min / ${fmt(params.tankinhalt, 0)} l⌉`,
          wert: fmt(result.fahrzeugeFuerSollmenge, 0),
        }
      : { hinweis: 'hintNoValueFillStation' as const }),
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepTippingPoint',
    ...(result.kipppunkt !== undefined
      ? {
          rechnung: `${fmt(mPerMin, 1)} m/min / 2 · (${fmt(
            params.fahrzeuge,
            0
          )} · ${fmt(params.tankinhalt, 0)} l / ${fmt(
            view.sollMenge,
            0
          )} l/min − ${fmt(result.fuellzeit, 1)} min − ${fmt(
            params.entleerzeit,
            1
          )} min)`,
          wert: fmt(result.kipppunkt, 0),
          einheit: 'm',
        }
      : {
          hinweis: result.fuellstellenLeistung < view.sollMenge
            ? ('hintNoValueFillStation' as const)
            : ('hintNoValueNoVehicles' as const),
        }),
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepVehiclesWithoutBuffer',
    rechnung: `⌈${fmt(result.umlaufzeit, 1)} min / ${fmt(
      params.entleerzeit,
      1
    )} min⌉`,
    wert: fmt(result.fahrzeugeOhnePuffer, 0),
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepSteadyAfter',
    wert: fmt(result.eingeschwungenNach, 1),
    einheit: 'min',
    herkunft: 'gerechnet',
  });

  return schritte;
}
