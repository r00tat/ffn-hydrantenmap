import 'server-only';

import type { FirecallItem } from '../../components/firebase/firestore';
import type { HoseLineDraft, WaterSupplyCandidate } from '../../common/waterSupply';
import type { ToolHandlerDeps } from '../../hooks/aiAssistant/toolHandlers';
import { resolveOriginFrom } from '../../hooks/aiAssistant/resolveOrigin';
import type { ResolvedOrigin } from '../../hooks/aiAssistant/types';
import { defaultPosition } from '../../hooks/constants';
import { queryClustersAdmin } from './clusterQuery';
import type { McpWriteContext } from './writeOps';
import { addMcpFirecallItem, updateMcpFirecallItem } from './writeOps';

/**
 * Die serverseitige Ausprägung von `ToolHandlerDeps`.
 *
 * Damit laufen die **gleichen** Tool-Handler wie im Browser
 * (`executeToolCall`), nur mit dem Admin SDK statt dem Client-SDK. Ein
 * zweites Tool-Set wäre die Garantie dafür, dass die beiden Wege irgendwann
 * unterschiedliche Elemente erzeugen.
 *
 * Drei Dinge gibt es serverseitig nicht, und alle drei sind hier bewusst
 * abgebildet statt weggelassen:
 *
 * - **Keine Karte.** `map` ist `null`; der Rückfall für Positionsangaben ist
 *   der Einsatzort und, wenn der fehlt, die Ortsmitte aus `constants.ts`.
 * - **Keine Benutzerposition.** Ein `userPosition`-Wunsch fällt daher auf den
 *   Einsatzort zurück — und die zurückgegebene Bezeichnung sagt das.
 * - **Kein Gedächtnis zwischen Aufrufen.** Der MCP-Transport ist zustandslos;
 *   `lastCreatedItem` bleibt leer, ein Tool-Call muss sein Ziel benennen.
 */

export interface ServerToolDepsInput {
  write: McpWriteContext;
  existingItems: FirecallItem[];
  /** Einsatzort, sofern gesetzt. */
  einsatzort?: { lat: number; lng: number };
  /** Darf dieser Aufruf schreiben? Ohne Schreibrecht werfen die Schreibpfade. */
  canWrite: boolean;
}

export interface ServerToolDeps extends ToolHandlerDeps {
  /** Leitungsvorschläge dieser Runde — im Browser ein Kartenzustand, hier ein Ergebnis. */
  collectedDrafts: HoseLineDraft[];
}

export class McpWriteForbiddenError extends Error {}

export function createServerToolDeps({
  write,
  existingItems,
  einsatzort,
  canWrite,
}: ServerToolDepsInput): ServerToolDeps {
  const waterSupplyResults: { current: WaterSupplyCandidate[] } = { current: [] };
  const collectedDrafts: HoseLineDraft[] = [];

  const fallback: ResolvedOrigin = einsatzort
    ? {
        lat: einsatzort.lat,
        lng: einsatzort.lng,
        type: 'einsatzort',
        label: 'dem Einsatzort',
      }
    : {
        lat: defaultPosition.lat,
        lng: defaultPosition.lng,
        type: 'mapCenter',
        label: 'der Ortsmitte (kein Einsatzort gesetzt)',
      };

  const resolveOrigin = (
    positionSpec:
      | { type: string; itemName?: string; address?: string; lat?: number; lng?: number }
      | undefined,
  ) =>
    resolveOriginFrom(positionSpec, {
      fallback,
      einsatzort: einsatzort
        ? {
            lat: einsatzort.lat,
            lng: einsatzort.lng,
            type: 'einsatzort',
            label: 'dem Einsatzort',
          }
        : undefined,
      existingItems,
    });

  const assertWrite = () => {
    if (!canWrite) {
      throw new McpWriteForbiddenError(
        'this access token may not write (scope einsatz:write is missing or writing is disabled)',
      );
    }
  };

  return {
    collectedDrafts,
    existingItems,
    map: null,
    defaultPosition,
    lastCreatedItem: null,
    setLastCreatedItem: () => {
      // Zustandslos: Es gibt keinen nächsten Aufruf, der sich daran erinnern
      // könnte.
    },
    resolveOrigin,
    resolvePosition: async (positionSpec) => {
      const { lat, lng } = await resolveOrigin(positionSpec);
      return { lat, lng };
    },
    addFirecallItem: async (item: FirecallItem) => {
      assertWrite();
      return addMcpFirecallItem(write, item);
    },
    updateFirecallItem: async (item: FirecallItem) => {
      assertWrite();
      const previous = existingItems.find((entry) => entry.id === item.id);
      await updateMcpFirecallItem(write, item, previous);
    },
    findWaterSupply: queryClustersAdmin,
    waterSupplyResults,
    proposeHoseLineDrafts: (drafts) => {
      // Im Browser zeichnet das Entwürfe in die Karte. Hier gibt es keine
      // Karte — die Vorschläge werden gesammelt und mit der Tool-Antwort
      // zurückgegeben, damit der Client sie nennen kann.
      collectedDrafts.splice(0, collectedDrafts.length, ...drafts);
    },
  };
}
