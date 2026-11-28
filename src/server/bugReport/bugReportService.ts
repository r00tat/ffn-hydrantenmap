import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  BUG_REPORT_COLLECTION,
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_COMMENT_VISIBILITIES,
  BUG_REPORT_COMMENTS_COLLECTION,
  type BugReport,
  type BugReportChange,
  type BugReportComment,
  type BugReportCommentVisibility,
  type BugReportCreatedBy,
  type BugReportKind,
  type BugReportStatus,
  type BugReportUpdateInput,
} from '../../common/bugReport';
import { bugReportTimeValue } from '../../common/bugReportReporterView';
import {
  computeBugReportChanges,
  normalizeBugReportUpdate,
} from '../../common/bugReportTracking';
import { MCP_SOURCE } from '../../common/mcp/provenance';
import { firestore, getAdminStorage } from '../firebase/admin';
import { getGcpProjectId } from '../firebase/project';
import {
  notifyReporter,
  type ReporterNotificationResult,
} from './reporterNotification';

/**
 * Firestore-Zugriff auf Bug-Reports, gemeinsam für die Admin-Server-Actions,
 * „Meine Meldungen“ und die MCP-Tools.
 *
 * **Hier wird nicht autorisiert.** Wer darf, entscheiden die Aufrufer —
 * `actionAdminRequired`/`actionUserRequired` bzw. Scope und Adminflag im
 * MCP-Server. Der Dienst bekommt dafür einen ausdrücklichen `actor`, statt die
 * Sitzung selbst zu lesen: Ein MCP-Aufruf hat keine NextAuth-Sitzung.
 */

/** Wer schreibt — der angemeldete Benutzer, gleich über welchen Weg. */
export type BugReportActor = BugReportCreatedBy;

/** Herkunft eines Schreibvorgangs über MCP, wie an Einsatz-Elementen. */
export interface BugReportWriteOrigin {
  source: typeof MCP_SOURCE;
  clientId?: string;
  clientName?: string;
}

export interface BugReportWriteOptions {
  origin?: BugReportWriteOrigin;
  /** Dem Melder eine Mail schicken, sofern es für ihn Neues gibt. */
  notifyReporter?: boolean;
}

export interface BugReportDetail {
  report: BugReport;
  screenshotUrls: string[];
  attachmentUrls: string[];
  comments: BugReportComment[];
}

export function serializeFirestoreData<T>(data: unknown): T {
  if (data instanceof Timestamp) {
    return data.toDate().toISOString() as unknown as T;
  }
  if (data instanceof Date) {
    return data.toISOString() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => serializeFirestoreData(item)) as unknown as T;
  }
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = serializeFirestoreData(v);
    }
    return out as T;
  }
  return data as T;
}

type DocSnap = { id: string; data: () => Record<string, unknown> | undefined };

function provenanceFields(
  origin: BugReportWriteOrigin | undefined,
): Record<string, string> {
  if (!origin) return {};
  return {
    source: origin.source,
    ...(origin.clientId ? { mcpClientId: origin.clientId } : {}),
    ...(origin.clientName ? { mcpClientName: origin.clientName } : {}),
  };
}

function actorFields(actor: BugReportActor): BugReportCreatedBy {
  return {
    uid: actor.uid,
    email: actor.email ?? '',
    ...(actor.displayName ? { displayName: actor.displayName } : {}),
  };
}

function reportRef(id: string) {
  if (!id || id.includes('/')) {
    throw new Error(`Invalid bug report id: ${id}`);
  }
  return firestore.collection(BUG_REPORT_COLLECTION).doc(id);
}

export interface ListBugReportsOptions {
  status?: BugReportStatus;
  kind?: BugReportKind;
  /** Nur Reports dieses Melders. */
  createdByUid?: string;
  limit?: number;
}

/** Obergrenze, die die Admin-Liste schon immer lädt. */
export const BUG_REPORT_LIST_MAX = 500;

/**
 * Reports, neueste zuerst.
 *
 * Status und Art werden **im Speicher** gefiltert, und der Melder-Filter
 * fragt ohne `orderBy`: `where` plus `orderBy` auf einem anderen Feld
 * verlangte einen zusammengesetzten Index — für eine Sammlung mit einigen
 * hundert Dokumenten wäre das Aufwand ohne Gegenwert.
 */
export async function listBugReports(
  options: ListBugReportsOptions = {},
): Promise<BugReport[]> {
  const limit = Math.min(
    Math.max(options.limit ?? BUG_REPORT_LIST_MAX, 1),
    BUG_REPORT_LIST_MAX,
  );
  const collection = firestore.collection(BUG_REPORT_COLLECTION);
  const snap = options.createdByUid
    ? await collection
        .where('createdBy.uid', '==', options.createdByUid)
        .limit(BUG_REPORT_LIST_MAX)
        .get()
    : await collection
        .orderBy('createdAt', 'desc')
        .limit(BUG_REPORT_LIST_MAX)
        .get();

  let reports = snap.docs.map((d: DocSnap) =>
    serializeFirestoreData<BugReport>({ id: d.id, ...d.data() }),
  );
  if (options.createdByUid) {
    reports.sort(
      (a, b) => bugReportTimeValue(b.createdAt) - bugReportTimeValue(a.createdAt),
    );
  }
  if (options.status) {
    reports = reports.filter((r) => r.status === options.status);
  }
  if (options.kind) {
    reports = reports.filter((r) => r.kind === options.kind);
  }
  return reports.slice(0, limit);
}

export async function getBugReport(id: string): Promise<BugReport | undefined> {
  const doc = await reportRef(id).get();
  if (!doc.exists) return undefined;
  return serializeFirestoreData<BugReport>({ id: doc.id, ...doc.data() });
}

export async function listBugReportComments(
  id: string,
): Promise<BugReportComment[]> {
  const snap = await reportRef(id)
    .collection(BUG_REPORT_COMMENTS_COLLECTION)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map((d: DocSnap) =>
    serializeFirestoreData<BugReportComment>({ id: d.id, ...d.data() }),
  );
}

function bugReportBucket() {
  return getGcpProjectId().then((projectId) =>
    // initializeApp() läuft ohne storageBucket, `bucket()` ohne Namen wirft
    // "Bucket name not specified". Der Standard-Bucket folgt aus der Projekt-ID.
    getAdminStorage().bucket(`${projectId}.appspot.com`),
  );
}

/** Signierte Lese-URLs, eine Stunde gültig. */
export async function signStoragePaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const bucket = await bugReportBucket();
  return Promise.all(
    paths.map(async (path) => {
      const [url] = await bucket.file(path.replace(/^\//, '')).getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      return url;
    }),
  );
}

export async function getBugReportDetail(
  id: string,
): Promise<BugReportDetail | undefined> {
  const report = await getBugReport(id);
  if (!report) return undefined;
  const [screenshotUrls, attachmentUrls, comments] = await Promise.all([
    signStoragePaths(report.screenshots ?? []),
    signStoragePaths(report.attachments ?? []),
    listBugReportComments(id),
  ]);
  return { report, screenshotUrls, attachmentUrls, comments };
}

export type StorageImageResult =
  | { ok: true; data: string; mimeType: string; size: number }
  | { ok: false; reason: string };

/**
 * Eine Datei aus dem Storage als base64 — für MCP, damit sich das Modell einen
 * Screenshot ansehen kann. Größenbegrenzt, und nur Bilder: Eine Antwort, die
 * mehrere Megabyte Base64 trägt, sprengt das Kontextfenster des Clients.
 */
export async function readStorageImage(
  path: string,
  maxBytes: number,
): Promise<StorageImageResult> {
  const bucket = await bugReportBucket();
  const file = bucket.file(path.replace(/^\//, ''));
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  const mimeType = String(metadata.contentType || 'image/png');
  if (!mimeType.startsWith('image/')) {
    return { ok: false, reason: `not an image (${mimeType})` };
  }
  if (size > maxBytes) {
    return {
      ok: false,
      reason: `too large (${size} bytes, limit ${maxBytes})`,
    };
  }
  const [buffer] = await file.download();
  return { ok: true, data: buffer.toString('base64'), mimeType, size };
}

export interface UpdateBugReportResult {
  changes: BugReportChange[];
  notification?: ReporterNotificationResult;
}

/**
 * Ändert die pflegbaren Felder und schreibt dieselbe Änderung als
 * Verlaufseintrag. Ohne den Eintrag erzählte der Verlauf nur die Hälfte der
 * Geschichte des Reports.
 */
export async function updateBugReport(
  id: string,
  patch: BugReportUpdateInput,
  actor: BugReportActor,
  options: BugReportWriteOptions = {},
): Promise<UpdateBugReportResult> {
  const normalized = normalizeBugReportUpdate(patch);
  if (Object.keys(normalized).length === 0) return { changes: [] };

  const ref = reportRef(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error(`Bug report ${id} not found`);
  }
  const before = (doc.data() ?? {}) as BugReport;
  const changes = computeBugReportChanges(before, normalized);
  // Ein Speichern ohne Änderung soll keinen leeren Verlaufseintrag erzeugen.
  if (changes.length === 0) return { changes };

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorFields(actor),
  };
  const after: Record<string, unknown> = { ...before };
  for (const change of changes) {
    // Ein geleertes Feld fliegt aus dem Dokument, statt als "" liegenzubleiben.
    payload[change.field] = change.to === '' ? FieldValue.delete() : change.to;
    after[change.field] = change.to === '' ? undefined : change.to;
  }
  await ref.update(payload);

  await ref.collection(BUG_REPORT_COMMENTS_COLLECTION).add({
    entryType: 'change',
    text: '',
    changes,
    // Verlaufseinträge bleiben intern; was der Melder davon sieht, legt
    // BUG_REPORT_REPORTER_VISIBLE_FIELDS beim Lesen fest.
    visibility: 'internal',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorFields(actor),
    ...provenanceFields(options.origin),
  });

  if (!options.notifyReporter) return { changes };
  const notification = await notifyReporter({
    report: serializeFirestoreData<BugReport>({ id, ...after }),
    changes,
  });
  return { changes, notification };
}

export interface AddBugReportCommentOptions extends BugReportWriteOptions {
  visibility?: BugReportCommentVisibility;
}

export interface AddBugReportCommentResult {
  commentId: string;
  notification?: ReporterNotificationResult;
}

export async function addBugReportComment(
  id: string,
  text: string,
  actor: BugReportActor,
  options: AddBugReportCommentOptions = {},
): Promise<AddBugReportCommentResult> {
  const visibility = options.visibility ?? 'internal';
  if (!BUG_REPORT_COMMENT_VISIBILITIES.includes(visibility)) {
    throw new Error(`Unbekannte Sichtbarkeit: ${visibility}`);
  }
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new Error('Kommentar darf nicht leer sein');
  }
  if (trimmed.length > BUG_REPORT_COMMENT_MAX_LENGTH) {
    throw new Error(
      `Kommentar ist zu lang (${trimmed.length} von maximal ${BUG_REPORT_COMMENT_MAX_LENGTH} Zeichen)`,
    );
  }

  const ref = reportRef(id);
  // Ein Melder-Kommentar braucht den Report für die Mail; ein interner nicht —
  // dort bleibt es bei einem einzigen Schreibzugriff wie bisher.
  const needsReport = visibility === 'reporter' && options.notifyReporter;
  let report: BugReport | undefined;
  if (needsReport) {
    report = await getBugReport(id);
    if (!report) throw new Error(`Bug report ${id} not found`);
  }

  const added = await ref.collection(BUG_REPORT_COMMENTS_COLLECTION).add({
    entryType: 'comment',
    text: trimmed,
    visibility,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorFields(actor),
    ...provenanceFields(options.origin),
  });

  if (!report) return { commentId: added.id };
  const notification = await notifyReporter({ report, comment: trimmed });
  return { commentId: added.id, notification };
}
