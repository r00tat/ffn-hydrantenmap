'use server';
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { actionUserRequired } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
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
import { getBaseUrl } from '../../server/auth/baseUrl';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  // The report id is client-generated (needed up front for screenshot upload
  // paths). Restrict it to a UUID v4 so it cannot point at an arbitrary
  // document path, and create the doc with `.create()` below so a caller can
  // never overwrite an existing report by supplying its id.
  if (!UUID_V4_REGEX.test(input.reportId ?? '')) {
    throw new Error('Invalid reportId');
  }

  const createdBy = {
    uid: session.user.id,
    email: session.user.email ?? '',
    ...(session.user.name ? { displayName: session.user.name } : {}),
  };

  // Für die Benachrichtigungsmail brauchen wir ein echtes Datum. Der Sentinel
  // aus `FieldValue.serverTimestamp()` wird erst vom Firestore-Server ersetzt
  // und ergäbe in der Mail `[object Object]` (#670).
  const report: Omit<BugReport, 'id'> = {
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    status: 'open',
    createdAt: new Date(),
    createdBy,
    context: input.context,
    logs: (input.logs ?? []).slice(-BUG_REPORT_MAX_LOG_ENTRIES),
    screenshots: input.screenshots ?? [],
    attachments: input.attachments ?? [],
  };

  const data = {
    ...report,
    // Maßgeblich ist die Serverzeit, nicht die Uhr dieser Instanz.
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = firestore
    .collection(BUG_REPORT_COLLECTION)
    .doc(input.reportId);
  // `.create()` fails with ALREADY_EXISTS if a report with this id already
  // exists, preventing an authorized user from overwriting another report.
  try {
    await docRef.create(data);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: number }).code === 6 // ALREADY_EXISTS
    ) {
      throw new Error('Report already exists');
    }
    throw err;
  }

  // Best-effort notification mail
  try {
    await sendNotification({
      ...report,
      id: input.reportId,
    });
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

  const from = mailSender();
  if (!from) {
    throw new Error('Email service not configured');
  }

  const [to, ...cc] = cfg.recipientEmails;
  const appBaseUrl = await getBaseUrl();

  const { raw } = buildBugReportEmail({ report, appBaseUrl, from, to, cc });
  await sendRawMail(raw);
}
