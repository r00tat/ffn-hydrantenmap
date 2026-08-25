'use client';

import { useCallback, useRef, useState } from 'react';
import type { LatLngPosition } from '../common/geo';
import { terrainClient } from '../common/terrain/terrainClient';
import type { TerrainLevelId } from '../common/terrain/terrainIndexTypes';
import type {
  FloodProgress,
  FloodSummary,
} from '../common/terrain/terrainTypes';
import {
  AUTO_DETAIL_MAX_M2,
  serialiseWasserBaender,
  wasserstandSignature,
} from '../common/terrain/wasserstand';
import type { Wasserstand } from '../components/firebase/firestore';
import useFirecallItemUpdate from './useFirecallItemUpdate';

/**
 * Einen Flutlauf anstoßen, verfolgen und das Ergebnis ans Element schreiben.
 *
 * Zwei Stufen, ein Algorithmus: Lauf 1 über die Übersichtsstufe wächst frei und
 * ist nach „Höhenmodell vorladen" offline verfügbar. Bleibt die Fläche unter
 * `AUTO_DETAIL_MAX_M2`, läuft Lauf 2 mit 1 m von selbst hinterher; darüber
 * bleibt er ein Knopf, dessen Aufschrift die Kacheln nennt. Der Regler rechnet
 * **nicht** live — jeder Lauf lädt Kacheln, und das darf im Hochwasserfall am
 * Netz keine Nebenwirkung des Ziehens sein.
 *
 * Geschrieben wird das Ergebnis samt Signatur: es ist das Ergebnis des
 * Elements, und alle in der Lageführung sollen es sehen.
 */

export type LaufPhase = 'idle' | 'running' | 'done' | 'failed' | 'aborted';

export interface LaufState {
  phase: LaufPhase;
  progress?: FloodProgress;
  level?: TerrainLevelId;
  /** Ergebnis des letzten Laufs — auch das leere mit `reason`. */
  summary?: FloodSummary;
  error?: string;
}

export interface WasserstandLauf {
  state: LaufState;
  /** Grober Lauf, danach automatisch fein, wenn die Fläche klein genug ist. */
  start(item: Wasserstand, zuschlag: number, radiusM: number): Promise<void>;
  /** Feinlauf von Hand, wenn die Fläche über der Schwelle lag. */
  refine(item: Wasserstand, zuschlag: number, radiusM: number): Promise<void>;
  abort(): void;
  reset(): void;
}

export default function useWasserstandLauf(): WasserstandLauf {
  const updateItem = useFirecallItemUpdate();
  const [state, setState] = useState<LaufState>({ phase: 'idle' });
  const abortRef = useRef<(() => void) | undefined>(undefined);

  const run = useCallback(
    async (
      item: Wasserstand,
      zuschlag: number,
      radiusM: number,
      levelId: TerrainLevelId
    ): Promise<FloodSummary | undefined> => {
      const basis = item.wasserBasisHoehe;
      if (typeof basis !== 'number' || !Number.isFinite(basis)) {
        setState({ phase: 'failed', error: 'noBase' });
        return undefined;
      }
      // `lat`/`lng` sind an `FirecallItem` optional; ohne Saatpunkt gibt es
      // nichts zu fluten.
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) {
        setState({ phase: 'failed', error: 'noSeed' });
        return undefined;
      }
      const seed: LatLngPosition = [item.lat as number, item.lng as number];
      const heightM = basis + zuschlag;
      setState({ phase: 'running', level: levelId });

      const handle = terrainClient().flood(seed, heightM, levelId, {
        maxRadiusM: radiusM,
        onProgress: (progress) =>
          setState((previous) => ({ ...previous, progress, level: levelId })),
      });
      abortRef.current = handle.abort;

      try {
        const summary = await handle.result;
        const draft: Wasserstand = {
          ...item,
          wasserZuschlag: zuschlag,
          wasserRadius: radiusM,
        };
        const gerechnet: Wasserstand = {
          ...draft,
          wasserBaender: serialiseWasserBaender(summary.baender),
          wasserStufe: summary.levelId,
          wasserFlaecheM2: summary.areaM2,
          wasserMaxTiefe: summary.maxDepthM,
          wasserLaengsteAchse: summary.longestAxisM,
          wasserGerechnetAm: new Date().toISOString(),
          wasserGerechnetFuer: wasserstandSignature(draft, summary.levelId),
          wasserAbbruch: summary.truncated,
          wasserKachelnFehlend: summary.missingBlocks,
          wasserRandModell: summary.edgeBlocks,
          wasserVereinfachungM: summary.toleranzM,
          wasserInselnVerworfen: summary.inselnVerworfen,
        };
        await updateItem(gerechnet);
        setState({ phase: 'done', summary, level: summary.levelId });
        return summary;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Ein Abbruch verwirft; er schreibt kein halbes Ergebnis.
        setState(
          message === 'aborted'
            ? { phase: 'aborted' }
            : { phase: 'failed', error: message }
        );
        return undefined;
      } finally {
        abortRef.current = undefined;
      }
    },
    [updateItem]
  );

  const start = useCallback(
    async (item: Wasserstand, zuschlag: number, radiusM: number) => {
      const coarse = await run(item, zuschlag, radiusM, 'overview');
      if (!coarse || coarse.cells === 0) return;
      if (coarse.areaM2 <= AUTO_DETAIL_MAX_M2) {
        await run(
          { ...item, wasserZuschlag: zuschlag, wasserRadius: radiusM },
          zuschlag,
          radiusM,
          'detail'
        );
      }
    },
    [run]
  );

  const refine = useCallback(
    async (item: Wasserstand, zuschlag: number, radiusM: number) => {
      await run(item, zuschlag, radiusM, 'detail');
    },
    [run]
  );

  return {
    state,
    start,
    refine,
    abort: () => abortRef.current?.(),
    reset: () => setState({ phase: 'idle' }),
  };
}
