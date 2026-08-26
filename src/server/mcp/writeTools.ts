import 'server-only';

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { isTruthy } from '../../common/boolish';
import type { FirecallItem } from '../../components/firebase/firestore';
import { executeToolCall } from '../../hooks/aiAssistant/toolHandlers';
import { authorizationMessage, authorizeFirecall } from './authorizeFirecall';
import { loadFirecallItems } from './firecallData';
import { createServerToolDeps, McpWriteForbiddenError } from './serverToolDeps';
import { errorResult, jsonResult } from './toolResult';
import type { McpUser } from './userAccess';

/**
 * Schreibende Tools (Scope `einsatz:write`).
 *
 * **Sie führen dieselben Handler aus wie der Browser-Assistent.** Ein
 * `create_item` wird auf denselben `createMarker`/`createVehicle`/…-Aufruf
 * abgebildet, den Gemini im Browser auslöst; die Unterschiede stecken
 * ausschließlich in den Abhängigkeiten (`createServerToolDeps`). Ein zweites
 * Tool-Set nebenher wäre die sichere Zusage, dass die beiden Wege irgendwann
 * verschiedene Elemente erzeugen.
 *
 * Zusätzlich zum Scope steht ein Schalter davor: `MCP_WRITE_ENABLED`. In prod
 * bleibt er zunächst aus, bis der Flow in der Praxis steht — siehe
 * `docs/mcp-server.md`.
 */

export function mcpWriteEnabled(): boolean {
  return isTruthy(process.env.MCP_WRITE_ENABLED);
}

/** Elementtyp → Handler des gemeinsamen Tool-Sets. */
const CREATE_HANDLERS: Record<string, string> = {
  marker: 'createMarker',
  vehicle: 'createVehicle',
  rohr: 'createRohr',
  circle: 'createCircle',
  el: 'createEl',
  assp: 'createAssp',
  tacticalUnit: 'createTacticalUnit',
};

export const CREATABLE_ITEM_TYPES = Object.keys(CREATE_HANDLERS);

const positionSchema = z
  .object({
    type: z
      .enum(['coordinates', 'address', 'einsatzort', 'atItem', 'nearItem', 'auto'])
      .describe(
        'Woher die Position kommt. Ohne Angabe der Einsatzort; "atItem"/"nearItem" ' +
          'beziehen sich über `itemName` auf ein vorhandenes Element.',
      ),
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
    itemName: z.string().optional(),
  })
  .optional();

const firecallId = z.string().min(1).describe('ID des Einsatzes');

export interface WriteToolContext {
  user: McpUser;
  clientId: string;
  clientName?: string;
}

export function registerWriteTools(
  server: McpServer,
  { user, clientId, clientName }: WriteToolContext,
): void {
  /**
   * Autorisierung, Elemente laden und die Abhängigkeiten bauen — für jeden
   * schreibenden Aufruf einmal. Der Transport ist zustandslos, es gibt nichts
   * zwischen zwei Aufrufen zu behalten.
   */
  async function prepare(id: string) {
    const firecall = await authorizeFirecall(user, id, { requireWrite: true });
    const existingItems = await loadFirecallItems(id);
    return {
      firecall,
      deps: createServerToolDeps({
        write: {
          firecallId: id,
          user: user.uid,
          clientId,
          clientName,
        },
        existingItems,
        einsatzort:
          firecall.lat && firecall.lng
            ? { lat: firecall.lat, lng: firecall.lng }
            : undefined,
        canWrite: true,
      }),
    };
  }

  async function run(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ) {
    if (!mcpWriteEnabled()) {
      return errorResult(
        'Schreibende Tools sind auf dieser Instanz nicht freigeschaltet (MCP_WRITE_ENABLED).',
      );
    }
    let prepared;
    try {
      prepared = await prepare(id);
    } catch (err) {
      return errorResult(authorizationMessage(err));
    }

    try {
      const result = await executeToolCall({ name, args }, prepared.deps);
      if (!result.success) {
        return errorResult(result.message);
      }
      return jsonResult({
        message: result.message,
        createdItemId: result.createdItemId,
        drafts: prepared.deps.collectedDrafts.length
          ? prepared.deps.collectedDrafts
          : undefined,
      });
    } catch (err) {
      if (err instanceof McpWriteForbiddenError) {
        return errorResult(err.message);
      }
      throw err;
    }
  }

  server.registerTool(
    'create_diary_entry',
    {
      title: 'Einsatztagebuch-Eintrag anlegen',
      description:
        'Legt einen Eintrag im Einsatztagebuch an. Der Eintrag wird als maschinell ' +
        'erzeugt gekennzeichnet und im Auditlog des Einsatzes vermerkt.',
      inputSchema: z.object({
        firecallId,
        beschreibung: z.string().min(1).describe('Text des Eintrags'),
        name: z.string().optional().describe('Kurzbezeichnung, Vorgabe "Eintrag"'),
        art: z
          .enum(['M', 'B', 'F'])
          .optional()
          .describe('M = Meldung, B = Befehl, F = Funkspruch'),
        von: z.string().optional(),
        an: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ firecallId: id, ...args }) => run(id, 'createDiary', args),
  );

  server.registerTool(
    'create_gb_entry',
    {
      title: 'Geschäftsbuch-Eintrag anlegen',
      description:
        'Legt einen Eintrag im Geschäftsbuch an. Wird als maschinell erzeugt ' +
        'gekennzeichnet und im Auditlog vermerkt.',
      inputSchema: z.object({
        firecallId,
        name: z.string().min(1).describe('Betreff des Eintrags'),
        ausgehend: z
          .boolean()
          .optional()
          .describe('true = ausgehend, false = eingehend'),
        von: z.string().optional(),
        an: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ firecallId: id, ...args }) => run(id, 'createGb', args),
  );

  server.registerTool(
    'create_item',
    {
      title: 'Element anlegen',
      description:
        `Legt ein Element auf der Einsatzkarte an. Mögliche Typen: ${CREATABLE_ITEM_TYPES.join(', ')}. ` +
        'Ohne Positionsangabe wird der Einsatzort verwendet.',
      inputSchema: z.object({
        firecallId,
        type: z.enum(CREATABLE_ITEM_TYPES as [string, ...string[]]),
        name: z.string().min(1),
        beschreibung: z.string().optional(),
        position: positionSchema,
        color: z.string().optional().describe('Farbe als Hex-Wert, z.B. "#ff0000"'),
        zeichen: z.string().optional().describe('Taktisches Zeichen (nur marker)'),
        radius: z.number().optional().describe('Radius in m (nur circle)'),
        art: z.string().optional().describe('Rohrart B/C/Wasserwerfer (nur rohr)'),
        durchfluss: z.number().optional().describe('Durchfluss in l/min (nur rohr)'),
        fw: z.string().optional().describe('Feuerwehr (vehicle, tacticalUnit)'),
        besatzung: z.string().optional().describe('Besatzung, z.B. "1:8" (nur vehicle)'),
        ats: z.number().optional().describe('Atemschutzträger'),
        alarmierung: z.string().optional(),
        eintreffen: z.string().optional(),
        unitType: z.string().optional().describe('Art der taktischen Einheit, z.B. "zug"'),
        mann: z.number().optional().describe('Mannschaftsstärke (nur tacticalUnit)'),
        fuehrung: z.string().optional().describe('Führung (nur tacticalUnit)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ firecallId: id, type, ...args }) =>
      run(id, CREATE_HANDLERS[type], args),
  );

  server.registerTool(
    'update_item',
    {
      title: 'Element ändern',
      description:
        'Ändert ein vorhandenes Element. Das Ziel wird über `itemId` benannt oder über ' +
        '`itemName` gesucht — die Suche trifft auch über Name und Feuerwehr zusammen.',
      inputSchema: z.object({
        firecallId,
        itemId: z.string().optional(),
        itemName: z.string().optional(),
        updates: z.object({
          name: z.string().optional(),
          beschreibung: z.string().optional(),
          color: z.string().optional(),
          position: positionSchema,
        }),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ firecallId: id, ...args }) => run(id, 'updateItem', args),
  );

  server.registerTool(
    'delete_item',
    {
      title: 'Element löschen',
      description:
        'Löscht ein Element. Es wird nur als gelöscht markiert (`deleted`), nicht ' +
        'entfernt — die Administration kann es wiederherstellen.',
      inputSchema: z.object({
        firecallId,
        itemId: z.string().optional(),
        itemName: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        // Ein Soft-Delete ist kein endgültiger Verlust — aber aus Sicht dessen,
        // der die Karte danach ansieht, ist das Element weg. Der Client soll
        // rückfragen.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ firecallId: id, ...args }) => run(id, 'deleteItem', args),
  );
}

/** Nur für Tests und die Doku: die Zuordnung Typ → Handler. */
export function createHandlerFor(type: string): string | undefined {
  return CREATE_HANDLERS[type];
}

export type { FirecallItem };
