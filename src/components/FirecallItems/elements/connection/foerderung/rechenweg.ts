/**
 * Der Rechenweg der Löschwasserförderung: vom Reibungswert je 100 m bis zur
 * Zahl der Verstärkerpumpen, jede Zwischengröße mit eingesetzten Zahlen.
 *
 * Die Reihenfolge ist die der Rechnung: erst der Druckbedarf der Strecke
 * (Reibung und Höhe), dann das Druckbudget einer Pumpe, daraus die Zahl der
 * Abschnitte. Wer nachrechnet, liest von oben nach unten.
 *
 * **Was hier nicht steht:** die Standortsuche selbst. Sie ist eine Schleife
 * über das Höhenprofil und keine Kette von Zwischenergebnissen; ihre Ausgabe
 * — die Abschnitte mit Grenzen, Höhenunterschied und Enddruck — steht schon als
 * eigene Tabelle im Panel. Der Rechenweg nennt stattdessen die Größen, aus
 * denen die Zahl der Abschnitte folgt, und die Verteilung, die sie danach auf
 * die Strecke setzt.
 *
 * Begründung des Modells: docs/loeschwasserfoerderung.md.
 */

import {
  herkunftVonVorgabe as herkunft,
  type RechenSchritt,
  type RechenwegFormat,
} from '../rechenweg';
import { FOERDERUNG_DEFAULTS } from './defaults';
import type { FoerderungView } from './foerderung';
import { BAR_PER_METER_ELEVATION } from './hydraulics';

export function foerderungRechenweg(
  view: FoerderungView,
  fmt: RechenwegFormat
): RechenSchritt[] {
  const { params, result } = view;
  const schritte: RechenSchritt[] = [];

  schritte.push({
    label: 'stepLineLength',
    wert: fmt(view.length, 0),
    einheit: 'm',
    herkunft: 'gemessen',
  });

  schritte.push({
    label: 'stepRequiredFlow',
    wert: fmt(params.foerderMenge, 0),
    einheit: 'l/min',
    herkunft: herkunft(params.foerderMenge, FOERDERUNG_DEFAULTS.foerderMenge),
  });

  schritte.push({
    label: 'stepParallelLines',
    wert: fmt(params.paralleleLeitungen, 0),
    herkunft: herkunft(
      params.paralleleLeitungen,
      FOERDERUNG_DEFAULTS.paralleleLeitungen
    ),
  });

  // Der Reibungswert hängt an der Menge **je Leitung**: Zwei B-Leitungen
  // tragen je die halbe Menge, und der Verlust wächst überproportional.
  const flowPerLine = params.foerderMenge / params.paralleleLeitungen;
  schritte.push({
    label: 'stepFlowPerLine',
    rechnung: `${fmt(params.foerderMenge, 0)} l/min / ${fmt(
      params.paralleleLeitungen,
      0
    )}`,
    wert: fmt(flowPerLine, 0),
    einheit: 'l/min',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepDimension',
    wert: view.dimension,
    herkunft: 'eingabe',
  });

  schritte.push({
    label: 'stepHoseLength',
    wert: fmt(view.hoseLengthM, 0),
    einheit: 'm',
    herkunft: 'eingabe',
  });

  const breakdown = view.frictionBreakdown;
  if (breakdown) {
    schritte.push({
      label: 'stepFrictionHose',
      wert: fmt(breakdown.rohr, 2),
      einheit: 'bar/100 m',
      herkunft:
        breakdown.source === 'table'
          ? 'tabelle'
          : breakdown.source === 'derived'
            ? 'abgeleitet'
            : 'gerechnet',
      ...(breakdown.source === 'table'
        ? { hinweis: 'hintTableIncludesCouplings' as const }
        : {}),
    });

    // Nur im Rohrhydraulik-Modell: Die Tabelle enthält die Kupplungen schon,
    // dort bleibt die Zeile 0 und wäre eine Einladung, sie doppelt zu zählen.
    if (breakdown.kupplungen > 0) {
      schritte.push({
        label: 'stepFrictionCouplings',
        rechnung: `${fmt(params.kupplungsverlust, 2)} bar · (${fmt(
          flowPerLine,
          0
        )} / 1000)² · 100 m / ${fmt(view.hoseLengthM, 0)} m`,
        wert: fmt(breakdown.kupplungen, 2),
        einheit: 'bar/100 m',
        herkunft: 'gerechnet',
      });

      schritte.push({
        label: 'stepFrictionTotal',
        rechnung: `${fmt(breakdown.rohr, 2)} + ${fmt(breakdown.kupplungen, 2)}`,
        wert: fmt(breakdown.total, 2),
        einheit: 'bar/100 m',
        herkunft: 'gerechnet',
      });
    }
  }

  if (view.frictionPer100m === undefined || !result) {
    return schritte;
  }

  schritte.push({
    label: 'stepFrictionOverLine',
    rechnung: `${fmt(view.frictionPer100m, 2)} bar/100 m · ${fmt(
      view.length,
      0
    )} m / 100`,
    wert: fmt(result.reibungsverlustBar, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  // Ohne Höhenprofil **und** ohne eingetragenen Wert steht hier die Annahme
  // „eben" und keine Eingabe. Sie als Eingabe auszuweisen behauptete eine
  // Auskunft, die niemand gegeben hat — genau das soll die Spalte verhindern.
  const hoeheAngenommen =
    view.elevationSource !== 'profile' && view.hoehenunterschied === 0;
  schritte.push({
    label: 'stepElevationDifference',
    wert: fmt(view.hoehenunterschied, 1),
    einheit: 'm',
    herkunft:
      view.elevationSource === 'profile'
        ? 'gemessen'
        : hoeheAngenommen
          ? 'vorgabe'
          : 'eingabe',
    ...(view.elevationSource === 'profile'
      ? {}
      : {
          hinweis: hoeheAngenommen
            ? ('hintAssumedFlat' as const)
            : ('hintManualElevation' as const),
        }),
  });

  schritte.push({
    label: 'stepElevationLoss',
    rechnung: `${fmt(view.hoehenunterschied, 1)} m · ${fmt(
      BAR_PER_METER_ELEVATION,
      2
    )} bar/m`,
    wert: fmt(result.hoehenverlustBar, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  // Reibung plus Höhe ist die gesamte Abnahme über die Strecke — auch mit
  // Höhenprofil, weil sich die Zwischenpunkte in der Summe aufheben. Nur die
  // *Standorte* hängen an den Kuppen dazwischen, nicht diese Summe.
  const totalDrop = result.reibungsverlustBar + result.hoehenverlustBar;
  schritte.push({
    label: 'stepTotalDrop',
    rechnung: `${fmt(result.reibungsverlustBar, 1)} + ${fmt(
      result.hoehenverlustBar,
      1
    )}`,
    wert: fmt(totalDrop, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepPumpOutlet',
    wert: fmt(params.pumpenAusgangsdruck, 1),
    einheit: 'bar',
    herkunft: herkunft(
      params.pumpenAusgangsdruck,
      FOERDERUNG_DEFAULTS.pumpenAusgangsdruck
    ),
  });

  schritte.push({
    label: 'stepPumpInlet',
    wert: fmt(params.pumpenEingangsdruck, 1),
    einheit: 'bar',
    herkunft: herkunft(
      params.pumpenEingangsdruck,
      FOERDERUNG_DEFAULTS.pumpenEingangsdruck
    ),
  });

  schritte.push({
    label: 'stepTargetPressure',
    wert: fmt(params.zielDruck, 1),
    einheit: 'bar',
    herkunft: herkunft(params.zielDruck, FOERDERUNG_DEFAULTS.zielDruck),
  });

  const zwischen = params.pumpenAusgangsdruck - params.pumpenEingangsdruck;
  schritte.push({
    label: 'stepUsableBetweenPumps',
    rechnung: `${fmt(params.pumpenAusgangsdruck, 1)} − ${fmt(
      params.pumpenEingangsdruck,
      1
    )}`,
    wert: fmt(zwischen, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  const letzter = params.pumpenAusgangsdruck - params.zielDruck;
  schritte.push({
    label: 'stepUsableToOutlet',
    rechnung: `${fmt(params.pumpenAusgangsdruck, 1)} − ${fmt(
      params.zielDruck,
      1
    )}`,
    wert: fmt(letzter, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  // Die Zahl der Abschnitte, die auch in der Abschnittstabelle steht: Über
  // `MAX_PUMPS` wird der letzte Abschnitt verworfen, weil die Leitung dort kein
  // Ende erreicht hat. `pumps.length` zählte ihn mit.
  const abschnitte = result.abschnitte.length;
  schritte.push({
    label: 'stepSections',
    wert: fmt(abschnitte, 0),
    herkunft: 'gerechnet',
    ...(result.darstellbar ? {} : { hinweis: 'hintNotFeasible' as const }),
  });

  // Kapazität, Auslastung und Abnahme je Abschnitt beschreiben die
  // gleichmäßige Verteilung. Ohne sie stünde hier eine Rechnung, die das
  // Ergebnis nicht erzeugt hat.
  const verteilung = result.verteilung;
  if (verteilung) {
    schritte.push({
      label: 'stepCapacity',
      rechnung: `${fmt(abschnitte - 1, 0)} · ${fmt(zwischen, 1)} bar + ${fmt(
        letzter,
        1
      )} bar`,
      wert: fmt(verteilung.kapazitaet, 1),
      einheit: 'bar',
      herkunft: 'gerechnet',
    });

    schritte.push({
      label: 'stepUtilisation',
      rechnung: `${fmt(totalDrop, 1)} bar / ${fmt(verteilung.kapazitaet, 1)} bar`,
      wert: fmt(verteilung.auslastung * 100, 1),
      einheit: '%',
      herkunft: 'gerechnet',
    });

    schritte.push({
      label: 'stepDropPerSection',
      rechnung: `${fmt(zwischen, 1)} bar · ${fmt(
        verteilung.auslastung * 100,
        1
      )} %`,
      wert: fmt(verteilung.abnahmeJeAbschnitt, 2),
      einheit: 'bar',
      herkunft: 'gerechnet',
    });
  } else if (abschnitte > 1) {
    // Nur mit Zwischenabschnitten: Ohne Verstärkerpumpe gibt es keinen, der
    // „bis zum Mindest-Eingangsdruck ausgeschöpft" sein könnte, und der Satz
    // wäre schlicht falsch.
    schritte.push({
      label: 'stepDropPerSection',
      wert: fmt(zwischen, 1),
      einheit: 'bar',
      herkunft: 'gerechnet',
      hinweis: 'hintGreedyPlacement',
    });
  }

  schritte.push({
    label: 'stepBoosterPumps',
    rechnung: `${fmt(abschnitte, 0)} − 1`,
    wert: fmt(result.verstaerkerpumpen, 0),
    herkunft: 'gerechnet',
    ergebnis: true,
  });

  schritte.push({
    label: 'stepEndPressure',
    wert: fmt(result.enddruck, 1),
    einheit: 'bar',
    herkunft: 'gerechnet',
  });

  schritte.push({
    label: 'stepHoseCount',
    rechnung: `⌈${fmt(view.length, 0)} m / ${fmt(
      view.hoseLengthM,
      0
    )} m⌉ · ${fmt(params.paralleleLeitungen, 0)}`,
    wert: fmt(view.hoseCount, 0),
    herkunft: 'gerechnet',
  });

  return schritte;
}
