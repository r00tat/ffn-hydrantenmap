'use server';
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { gmail } from '@googleapis/gmail';
import { actionUserRequired } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import {
  APP_CONFIG_COLLECTION,
  BUG_REPORT_COLLECTION,
  BUG_REPORT_CONFIG_DOC,
  BUG_REPORT_MAX_LOG_ENTRIES,
  type BugReport,
  type BugReportConfig,
  type BugReportSubmitInput,
} from '../../common/bugReport';
import { buildBugReportEmail } from './buildBugReportEmail';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

interface SubmitResult {
  reportId: string;
}

export async function submitBugReportAction(
  input: BugReportSubmitInput,
): Promise<SubmitResult> {
  const session = await actionUserRequired();

  if (!input.title?.trim() || !input.description?.trim()) {
    throw new Error('Title and description required');
  }
  if (input.kind !== 'bug' && input.kind !== 'feature') {
    throw new Error('Invalid kind');
  }

  const createdBy = {
    uid: session.user.id,
    email: session.user.email ?? '',
    ...(session.user.name ? { displayName: session.user.name } : {}),
  };

  const data = {
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    status: 'open' as const,
    createdAt: FieldValue.serverTimestamp(),
    createdBy,
    context: input.context,
    logs: (input.logs ?? []).slice(-BUG_REPORT_MAX_LOG_ENTRIES),
    screenshots: input.screenshots ?? [],
    attachments: input.attachments ?? [],
  };

  const docRef = firestore
    .collection(BUG_REPORT_COLLECTION)
    .doc(input.reportId);
  await docRef.set(data);

  // Best-effort notification mail
  try {
    await sendNotification({
      ...data,
      id: input.reportId,
    } as unknown as BugReport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bug report notification failed:', err);
    try {
      await docRef.update({ notificationError: message });
    } catch {
      // swallow update failure
    }
  }

  return { reportId: input.reportId };
}

async function sendNotification(report: BugReport): Promise<void> {
  const configSnap = await firestore
    .collection(APP_CONFIG_COLLECTION)
    .doc(BUG_REPORT_CONFIG_DOC)
    .get();

  if (!configSnap.exists) return;
  const cfg = configSnap.data() as BugReportConfig;
  if (!cfg.enabled || !cfg.recipientEmails?.length) return;

  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT ||
    !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT
  ) {
    throw new Error('Email service not configured');
  }

  const from = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT;
  const [to, ...cc] = cfg.recipientEmails;
  const appBaseUrl = process.env.NEXTAUTH_URL ?? '';

  const { raw } = buildBugReportEmail({ report, appBaseUrl, from, to, cc });
  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const auth = createWorkspaceAuth(GMAIL_SCOPES);
  const client = gmail({ version: 'v1', auth });
  await client.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
}
