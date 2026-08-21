import type { Diary } from '../../firebase/firestore';
import type { FoerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';

/**
 * Labels für den Tagebucheintrag. Werden vom Aufrufer übergeben, der Zugriff auf
 * `useTranslations` hat — so bleibt dieses Modul rein und testbar. Gleiches
 * Muster wie `buildKennzeichenDiaryEntry`.
 */
export interface FoerderungDiaryLabels {
  title: (name: string) => string;
  flow: (value: number) => string;
  pumps: (count: number) => string;
  length: (metres: number, hoses: number) => string;
  elevation: (metres: number) => string;
  friction: (bar: number) => string;
  targetPressure: (bar: number) => string;
  outputPressure: (bar: number) => string;
  manualElevation: string;
  notFeasible: string;
}

export interface FoerderungDiaryInput {
  leitungName?: string;
  view: FoerderungView;
  timestamp: string;
  labels: FoerderungDiaryLabels;
}

/**
 * Reiner Builder für den Einsatztagebuch-Eintrag beim Ablegen der Pumpen.
 *
 * Genau **ein** Eintrag, und nur beim Ablegen: Am Regler wird probiert, nur die
 * getroffene Entscheidung gehört in den Verlauf.
 */
export function buildFoerderungDiaryEntry(
  input: FoerderungDiaryInput
): Diary {
  const { view, labels } = input;
  const lines = [
    labels.flow(view.params.foerderMenge),
    labels.pumps(view.result?.verstaerkerpumpen ?? 0),
    labels.length(Math.round(view.length), view.hoseCount),
    labels.elevation(Math.round(view.hoehenunterschied)),
    labels.targetPressure(view.params.zielDruck),
    labels.outputPressure(view.params.pumpenAusgangsdruck),
  ];

  if (view.frictionPer100m !== undefined) {
    lines.splice(3, 0, labels.friction(view.frictionPer100m));
  }
  if (view.elevationSource === 'manual') {
    lines.push(labels.manualElevation);
  }
  if (view.result && !view.result.darstellbar) {
    lines.push(labels.notFeasible);
  }

  return {
    type: 'diary',
    art: 'M',
    datum: input.timestamp,
    name: labels.title(input.leitungName || ''),
    beschreibung: lines.join('\n'),
  };
}
