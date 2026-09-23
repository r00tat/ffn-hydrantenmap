import { LeafletContext } from '@react-leaflet/core';
import { FunctionCall } from 'firebase/ai';
import { useCallback, useContext, useRef, useState } from 'react';
import {
  createFahrtenbuchEntryFromAssistant,
  getFahrtenbuchCountersForAssistant,
} from '../../components/Fahrtenbuch/fahrtenbuchActions';
import useTruppAssistant from '../../components/Atemschutz/useTruppAssistant';
import { queryClusters } from '../../components/firebase/clusterQuery';
import { FirecallItem } from '../../components/firebase/firestore';
import { usePositionContext } from '../../components/providers/PositionProvider';
import { WaterSupplyCandidate } from '../../common/waterSupply';
import { defaultPosition } from '../constants';
import useFirecallItemAdd from '../useFirecallItemAdd';
import useFirecallItemUpdate from '../useFirecallItemUpdate';
import { useFirecall } from '../useFirecall';
import { useHoseLineDraft } from '../useHoseLineDraft';
import type { AssistantEntryCommand } from '../../components/Fahrtenbuch/assistantEntry';
import { buildAiContext } from './contextBuilder';
import { MAP_CONTEXT_PREFIX } from './chatHistory';
import { PositionSpec, resolveOriginFrom } from './resolveOrigin';
import { executeToolCall } from './toolHandlers';
import { AiAssistantResult, AiInteraction, ResolvedOrigin } from './types';

/**
 * Ohne Einsatz keine Gruppe: Das Fahrtenbuch hängt an der Feuerwehr, und
 * welche das ist, sagt allein der laufende Einsatz.
 */
const NO_FIRECALL_MESSAGE =
  'Ohne laufenden Einsatz weiß ich nicht, um wessen Fahrtenbuch es geht.';

export interface AiToolRunner {
  /** Führt einen Werkzeugaufruf aus und schreibt ihn in die Interaktionsliste. */
  executeTool: (call: FunctionCall) => Promise<AiAssistantResult>;
  /** Kartenkontext als Text, wie ihn das Modell erwartet. */
  buildContextText: () => string;
  /** Kennzahlen des Kontexts für die Laufzeitmessung. */
  contextStats: () => { items: number };
  interactionsRef: React.RefObject<AiInteraction[]>;
  lastCreatedItem: { id: string; type: string } | null;
  undoLastAction: () => Promise<boolean>;
}

/**
 * Alles, was der Assistent unabhängig vom Übertragungsweg braucht:
 * Positionsauflösung, Werkzeugausführung, Kartenkontext und das Gedächtnis
 * über die zuletzt angelegten Elemente.
 *
 * Einzelaufruf (`useAiAssistant`) und Live-Sitzung (`useAiLiveAssistant`)
 * unterscheiden sich nur darin, wie sie mit dem Modell reden — was ein
 * Werkzeugaufruf bewirkt, muss in beiden Fällen dasselbe sein. Deshalb liegt
 * es hier und nicht zweimal nebeneinander.
 */
export default function useAiToolRunner(existingItems: FirecallItem[]): AiToolRunner {
  const leafletContext = useContext(LeafletContext);
  const map = leafletContext?.map ?? null;
  const [position, isPositionSet] = usePositionContext();
  const addFirecallItem = useFirecallItemAdd();
  const updateFirecallItem = useFirecallItemUpdate();
  const firecall = useFirecall();
  const { proposeDrafts } = useHoseLineDraft();
  const { runTruppCommand, truppContext } = useTruppAssistant();

  const interactionsRef = useRef<AiInteraction[]>([]);
  /** Treffer der letzten Umkreissuche, siehe `ToolHandlerDeps` */
  const waterSupplyResultsRef = useRef<WaterSupplyCandidate[]>([]);
  const [lastCreatedItem, setLastCreatedItem] = useState<{ id: string; type: string } | null>(null);

  /**
   * Positionsangabe auflösen — die Regeln stehen in `resolveOriginFrom` und
   * gelten für den Browser-Assistenten und den MCP-Server gleichermaßen.
   * Hier kommt nur der Kontext dazu, den es ausschließlich im Browser gibt:
   * Kartenmitte und eigener Standort.
   */
  const resolveOrigin = useCallback(
    async (positionSpec: PositionSpec | undefined): Promise<ResolvedOrigin> => {
      const center = map ? map.getCenter() : defaultPosition;
      return resolveOriginFrom(positionSpec, {
        fallback: {
          lat: center.lat,
          lng: center.lng,
          type: 'mapCenter',
          label: 'der Kartenmitte',
        },
        userPosition: isPositionSet
          ? {
              lat: position.lat,
              lng: position.lng,
              type: 'userPosition',
              label: 'deinem Standort',
            }
          : undefined,
        einsatzort:
          firecall.lat && firecall.lng
            ? {
                lat: firecall.lat,
                lng: firecall.lng,
                type: 'einsatzort',
                label: 'dem Einsatzort',
              }
            : undefined,
        existingItems,
      });
    },
    [existingItems, firecall.lat, firecall.lng, isPositionSet, map, position]
  );

  const resolvePosition = useCallback(
    async (positionSpec: PositionSpec | undefined): Promise<{ lat: number; lng: number }> => {
      const { lat, lng } = await resolveOrigin(positionSpec);
      return { lat, lng };
    },
    [resolveOrigin]
  );

  /**
   * Eine Fahrt ins Fahrtenbuch — der Einsatz bestimmt, in wessen Fahrtenbuch.
   *
   * Nur die Einsatz-ID geht hinaus; die Gruppe leitet der Server daraus ab.
   * Der Browser kennt die Fahrzeug- und Personenstammdaten der Gruppe nicht
   * und soll sie für diesen einen Befehl auch nicht abonnieren müssen.
   */
  const createFahrtenbuchEntry = useCallback(
    async (
      command: AssistantEntryCommand,
      options: { confirmDuplicate?: boolean },
    ) => {
      if (!firecall.id) {
        return { success: false, message: NO_FIRECALL_MESSAGE };
      }
      return createFahrtenbuchEntryFromAssistant(firecall.id, command, options);
    },
    [firecall.id],
  );

  const getFahrtenbuchCounters = useCallback(
    async (fahrzeug?: string) => {
      if (!firecall.id) {
        return { success: false, message: NO_FIRECALL_MESSAGE };
      }
      return getFahrtenbuchCountersForAssistant(firecall.id, fahrzeug);
    },
    [firecall.id],
  );

  const executeTool = useCallback(
    async (call: FunctionCall): Promise<AiAssistantResult> => {
      const result = await executeToolCall(call, {
        resolvePosition,
        addFirecallItem,
        updateFirecallItem,
        existingItems,
        lastCreatedItem,
        setLastCreatedItem,
        map,
        defaultPosition,
        resolveOrigin,
        findWaterSupply: queryClusters,
        waterSupplyResults: waterSupplyResultsRef,
        proposeHoseLineDrafts: proposeDrafts,
        createFahrtenbuchEntry,
        getFahrtenbuchCounters,
        runAtemschutzTruppCommand: runTruppCommand,
      });

      if (result.success) {
        interactionsRef.current.push({
          timestamp: Date.now(),
          action: call.name,
          createdItemId: result.createdItemId,
          createdItemType:
            result.createdItemType ?? call.name.replace('create', '').toLowerCase(),
        });
      }

      return result;
    },
    [
      addFirecallItem,
      createFahrtenbuchEntry,
      existingItems,
      getFahrtenbuchCounters,
      lastCreatedItem,
      map,
      proposeDrafts,
      resolveOrigin,
      resolvePosition,
      runTruppCommand,
      updateFirecallItem,
    ]
  );

  const buildContextText = useCallback(() => {
    const context = buildAiContext({
      map,
      defaultPosition,
      existingItems,
      isPositionSet,
      position,
      interactions: interactionsRef.current,
      trupps: truppContext,
    });
    // Kompakt statt eingerückt: Die Einrückung ist rund ein Drittel der
    // Zeichen und trägt für das Modell nichts bei (#740).
    return `${MAP_CONTEXT_PREFIX}\n${JSON.stringify(context)}`;
  }, [existingItems, isPositionSet, map, position, truppContext]);

  const contextStats = useCallback(
    () => ({ items: existingItems.filter((item) => !item.deleted).length }),
    [existingItems]
  );

  const undoLastAction = useCallback(async (): Promise<boolean> => {
    if (!lastCreatedItem) return false;

    const item = existingItems.find((i) => i.id === lastCreatedItem.id);
    if (!item) return false;

    console.info('[AI] Undoing last action:', lastCreatedItem);
    await updateFirecallItem({ ...item, deleted: true });
    setLastCreatedItem(null);
    return true;
  }, [existingItems, lastCreatedItem, updateFirecallItem]);

  return {
    executeTool,
    buildContextText,
    contextStats,
    interactionsRef,
    lastCreatedItem,
    undoLastAction,
  };
}
