'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { actionAdminRequired } from '../../auth';
import { firestore } from '../../../server/firebase/admin';
import {
  addBugReportComment,
  getBugReportDetail,
  listBugReportComments,
  listBugReports,
  serializeFirestoreData,
  updateBugReport,
  type BugReportActor,
  type BugReportDetail,
} from '../../../server/bugReport/bugReportService';
import type { ReporterNotificationResult } from '../../../server/bugReport/reporterNotification';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
  type BugReport,
  type BugReportComment,
  type BugReportCommentVisibility,
  type BugReportConfig,
  type BugReportStatus,
  type BugReportUpdateInput,
} from '../../../common/bugReport';

interface AdminSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

function toActor(user: AdminSessionUser): BugReportActor {
  return {
    uid: user.id,
    email: user.email ?? '',
    ...(user.name ? { displayName: user.name } : {}),
  };
}

/** Rückmeldung an den Dialog, ob der Melder eine Mail bekommen hat. */
export interface BugReportWriteResult {
  notification?: ReporterNotificationResult;
}

export async function listBugReportsAction(): Promise<BugReport[]> {
  await actionAdminRequired();
  return listBugReports();
}

export async function getBugReportAction(id: string): Promise<BugReportDetail> {
  await actionAdminRequired();
  const detail = await getBugReportDetail(id);
  if (!detail) {
    throw new Error(`Bug report ${id} not found`);
  }
  return detail;
}

export async function listBugReportCommentsAction(
  id: string,
): Promise<BugReportComment[]> {
  await actionAdminRequired();
  return listBugReportComments(id);
}

/**
 * Ändert Status, Lösung, GitHub-Issue, Zuständigkeit und interne Notiz und
 * schreibt dieselbe Änderung als Verlaufseintrag in die Kommentare.
 */
export async function updateBugReportAction(
  id: string,
  patch: BugReportUpdateInput,
  options: { notifyReporter?: boolean } = {},
): Promise<BugReportWriteResult> {
  const session = await actionAdminRequired();
  const { notification } = await updateBugReport(
    id,
    patch,
    toActor(session.user),
    { notifyReporter: !!options.notifyReporter },
  );
  return notification ? { notification } : {};
}

export async function addBugReportCommentAction(
  id: string,
  text: string,
  options: {
    visibility?: BugReportCommentVisibility;
    notifyReporter?: boolean;
  } = {},
): Promise<BugReportWriteResult> {
  const session = await actionAdminRequired();
  const { notification } = await addBugReportComment(
    id,
    text,
    toActor(session.user),
    {
      visibility: options.visibility ?? 'internal',
      notifyReporter: !!options.notifyReporter,
    },
  );
  return notification ? { notification } : {};
}

export async function updateBugReportStatusAction(
  id: string,
  status: BugReportStatus,
  options: { notifyReporter?: boolean } = {},
): Promise<BugReportWriteResult> {
  return updateBugReportAction(id, { status }, options);
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
        updatedBy: toActor(session.user),
      },
      { merge: true },
    );
}
