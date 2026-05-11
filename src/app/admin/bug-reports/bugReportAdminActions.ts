'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { actionAdminRequired } from '../../auth';
import { firestore, getAdminStorage } from '../../../server/firebase/admin';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  DEFAULT_BUG_REPORT_CONFIG,
  type BugReport,
  type BugReportConfig,
  type BugReportCreatedBy,
  type BugReportStatus,
} from '../../../common/bugReport';

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
      ({ id: d.id, ...d.data() }) as BugReport,
  );
}

export async function getBugReportAction(id: string): Promise<{
  report: BugReport;
  screenshotUrls: string[];
  attachmentUrls: string[];
}> {
  await actionAdminRequired();
  const doc = await firestore.collection(BUG_REPORT_COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new Error(`Bug report ${id} not found`);
  }
  const report = { id: doc.id, ...doc.data() } as BugReport;

  const bucket = getAdminStorage().bucket();
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
  return { report, screenshotUrls, attachmentUrls };
}

export async function updateBugReportStatusAction(
  id: string,
  status: BugReportStatus,
): Promise<void> {
  const session = await actionAdminRequired();
  await firestore.collection(BUG_REPORT_COLLECTION).doc(id).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: toUpdatedBy(session.user),
  });
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
  return snap.data() as BugReportConfig;
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
