import 'server-only';

import {
  MCP_SOURCE,
  type McpProvenance,
} from '../../common/mcp/provenance';
import {
  FIRECALL_AUDITLOG_COLLECTION_ID,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  type AuditLogEntry,
  type FirecallItem,
} from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';

/**
 * Der Schreibpfad des MCP-Servers.
 *
 * Jeder Schreibvorgang ist zuordenbar: `creator`/`updatedBy` tragen die
 * Kennung des Benutzers, `source: 'mcp'` und `mcpClientId` die der Anwendung,
 * und im `auditlog` des Einsatzes steht ein Eintrag. Ohne diese drei Spuren
 * wäre nach einem Einsatz nicht mehr feststellbar, was ein Mensch und was eine
 * Maschine geschrieben hat.
 */

export interface McpWriteContext {
  firecallId: string;
  /** Kennung des Benutzers, wie sie auch der Browser schreibt. */
  user: string;
  clientId: string;
  clientName?: string;
}

function provenance(context: McpWriteContext): McpProvenance {
  return {
    source: MCP_SOURCE,
    mcpClientId: context.clientId,
    ...(context.clientName ? { mcpClientName: context.clientName } : {}),
  };
}

function itemsCollection(firecallId: string) {
  return firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(FIRECALL_ITEMS_COLLECTION_ID);
}

/**
 * Entfernt `undefined`, `null` und leere Zeichenketten — dieselbe Reinigung
 * wie in `useFirecallItemUpdate`. Ohne sie landen leere Felder als solche im
 * Dokument und überschreiben beim Aktualisieren vorhandene Werte.
 */
function clean<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

export async function writeAuditLog(
  context: McpWriteContext,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'user'>,
): Promise<void> {
  const logEntry: Omit<AuditLogEntry, 'id'> = {
    ...entry,
    timestamp: new Date().toISOString(),
    // Die Anwendung steht mit im Benutzerfeld: Der Auditlog zeigt eine
    // Zeichenkette an, und „wer" ist hier die Kombination aus Mensch und
    // Maschine.
    user: `${context.user} (MCP: ${context.clientName || context.clientId})`,
  };
  await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(context.firecallId)
    .collection(FIRECALL_AUDITLOG_COLLECTION_ID)
    .add(logEntry)
    .catch((err) => {
      // Ein fehlender Auditlog-Eintrag darf den Schreibvorgang nicht
      // zurücknehmen — dieselbe Haltung wie im Browser (`useAuditLog`).
      console.error(`mcp: audit log write failed: ${err}`);
    });
}

export async function addMcpFirecallItem(
  context: McpWriteContext,
  item: FirecallItem,
): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const data = clean({
    ...item,
    ...provenance(context),
    created: now,
    creator: context.user,
    updatedAt: now,
    updatedBy: context.user,
  });

  const ref = await itemsCollection(context.firecallId).add(data);

  await writeAuditLog(context, {
    action: 'create',
    elementType: item.type,
    elementId: ref.id,
    elementName: item.name,
    newValue: data,
  });

  return { id: ref.id };
}

export async function updateMcpFirecallItem(
  context: McpWriteContext,
  item: FirecallItem,
  previous?: FirecallItem,
): Promise<void> {
  if (!item.id) {
    throw new Error('cannot update an item without id');
  }
  const now = new Date().toISOString();
  const { id, original: _original, ...rest } = item;
  const data = clean({
    ...rest,
    ...provenance(context),
    updatedAt: now,
    updatedBy: context.user,
  });

  // `merge`, nicht `set`: Ein Tool-Call liefert nur die geänderten Felder,
  // und `deleted: true` beim Soft-Delete darf den Rest nicht wegwerfen.
  await itemsCollection(context.firecallId)
    .doc(id)
    .set(data, { merge: true });

  await writeAuditLog(context, {
    action: item.deleted ? 'delete' : 'update',
    elementType: item.type,
    elementId: id,
    elementName: item.name,
    previousValue: previous ? { ...previous } : undefined,
    newValue: data,
  });
}
