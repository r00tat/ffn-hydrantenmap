'use server';
import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { actionAdminRequired } from '../../auth';
import { firestore, getAdminStorage } from '../../../server/firebase/admin';
import { getGcpProjectId } from '../../../server/firebase/project';

function serializeFirestoreData<T>(data: unknown): T {
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
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_COMMENT_MAX_LENGTH,
  BUG_REPORT_COMMENTS_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
  type BugReport,
  type BugReportComment,
  type BugReportConfig,
  type BugReportCreatedBy,
  type BugReportStatus,
  type BugReportUpdateInput,
} from '../../../common/bugReport';
import {
  computeBugReportChanges,
  normalizeBugReportUpdate,
} from '../../../common/bugReportTracking';

interface AdminSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

function toUpdatedBy(user: AdminSessionUser): BugReportCreatedBy {
  return {
    uid: user.id,
    email: user.email ?? '',
    ...(user.name ? { displayName: user.name } : {}),
  };
}

export async function listBugReportsAction(): Promise<BugReport[]> {
  await actionAdminRequired();
  const snap = await firestore
    .collection(BUG_REPORT_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();
  return snap.docs.map(
    (d: { id: string; data: () => Record<string, unknown> }) =>
      serializeFirestoreData<BugReport>({ id: d.id, ...d.data() }),
  );
}

async function readComments(id: string): Promise<BugReportComment[]> {
  const snap = await firestore
    .collection(BUG_REPORT_COLLECTION)
    .doc(id)
    .collection(BUG_REPORT_COMMENTS_COLLECTION)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map(
    (d: { id: string; data: () => Record<string, unknown> }) =>
      serializeFirestoreData<BugReportComment>({ id: d.id, ...d.data() }),
  );
}

export async function getBugReportAction(id: string): Promise<{
  report: BugReport;
  screenshotUrls: string[];
  attachmentUrls: string[];
  comments: BugReportComment[];
}> {
  await actionAdminRequired();
  const doc = await firestore.collection(BUG_REPORT_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new Error(`Bug report ${id} not found`);
  }
  const report = serializeFirestoreData<BugReport>({
    id: doc.id,
    ...doc.data(),
  });

  // initializeApp() is called without storageBucket, so getStorage().bucket()
  // ohne expliziten Namen wirft "Bucket name not specified". Wir leiten den
  // Standard-Bucket aus der GCP Project ID ab: {projectId}.appspot.com.
  const projectId = await getGcpProjectId();
  const bucket = getAdminStorage().bucket(`${projectId}.appspot.com`);
  const sign = async (path: string): Promise<string> => {
    const file = bucket.file(path.replace(/^\//, ''));
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return url;
  };

  const screenshotUrls = await Promise.all(
    (report.screenshots ?? []).map(sign),
  );
  const attachmentUrls = await Promise.all(
    (report.attachments ?? []).map(sign),
  );
  const comments = await readComments(id);
  return { report, screenshotUrls, attachmentUrls, comments };
}

export async function listBugReportCommentsAction(
  id: string,
): Promise<BugReportComment[]> {
  await actionAdminRequired();
  return readComments(id);
}

/**
 * Ändert Status, GitHub-Issue, Zuständigkeit und interne Notiz und schreibt
 * dieselbe Änderung als Verlaufseintrag in die Kommentare. Ohne den Eintrag
 * erzählte der Verlauf nur die Hälfte der Geschichte des Reports.
 */
export async function updateBugReportAction(
  id: string,
  patch: BugReportUpdateInput,
): Promise<void> {
  const session = await actionAdminRequired();
  const normalized = normalizeBugReportUpdate(patch);
  if (Object.keys(normalized).length === 0) return;

  const ref = firestore.collection(BUG_REPORT_COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error(`Bug report ${id} not found`);
  }
  const before = (doc.data() ?? {}) as BugReport;
  const changes = computeBugReportChanges(before, normalized);
  // Ein Speichern ohne Änderung soll keinen leeren Verlaufseintrag erzeugen.
  if (changes.length === 0) return;

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: toUpdatedBy(session.user),
  };
  for (const change of changes) {
    // Ein geleertes Feld fliegt aus dem Dokument, statt als "" liegenzubleiben.
    payload[change.field] =
      change.to === '' ? FieldValue.delete() : change.to;
  }
  await ref.update(payload);

  await ref.collection(BUG_REPORT_COMMENTS_COLLECTION).add({
    entryType: 'change',
    text: '',
    changes,
    visibility: 'internal',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: toUpdatedBy(session.user),
  });
}

export async function addBugReportCommentAction(
  id: string,
  text: string,
): Promise<void> {
  const session = await actionAdminRequired();
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new Error('Kommentar darf nicht leer sein');
  }
  if (trimmed.length > BUG_REPORT_COMMENT_MAX_LENGTH) {
    throw new Error(
      `Kommentar ist zu lang (${trimmed.length} von maximal ${BUG_REPORT_COMMENT_MAX_LENGTH} Zeichen)`,
    );
  }
  await firestore
    .collection(BUG_REPORT_COLLECTION)
    .doc(id)
    .collection(BUG_REPORT_COMMENTS_COLLECTION)
    .add({
      entryType: 'comment',
      text: trimmed,
      visibility: 'internal',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: toUpdatedBy(session.user),
    });
}

export async function updateBugReportStatusAction(
  id: string,
  status: BugReportStatus,
): Promise<void> {
  await updateBugReportAction(id, { status });
}

export async function getBugReportConfigAction(): Promise<BugReportConfig> {
  await actionAdminRequired();
  const snap = await firestore
    .collection(APP_CONFIG_COLLECTION)
    .doc(BUG_REPORT_CONFIG_DOC)
    .get();
  if (!snap.exists) {
    return DEFAULT_BUG_REPORT_CONFIG;
  }
  return serializeFirestoreData<BugReportConfig>(snap.data());
}

export async function updateBugReportConfigAction(
  config: Pick<BugReportConfig, 'recipientEmails' | 'enabled'>,
): Promise<void> {
  const session = await actionAdminRequired();
  await firestore
    .collection(APP_CONFIG_COLLECTION)
    .doc(BUG_REPORT_CONFIG_DOC)
    .set(
      {
        recipientEmails: config.recipientEmails ?? [],
        enabled: !!config.enabled,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: toUpdatedBy(session.user),
      },
      { merge: true },
    );
}
