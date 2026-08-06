import 'server-only';

import { gmail } from '@googleapis/gmail';
import { createWorkspaceAuth } from '../auth/workspace';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

/**
 * Absender aller vom Server verschickten Mails — das per Domain-Delegation
 * impersonierte Workspace-Konto. `undefined`, solange der Versand nicht
 * konfiguriert ist; Aufrufer, die den Absender in den Kopfzeilen brauchen,
 * prüfen das vor dem Bauen der Nachricht.
 */
export function mailSender(): string | undefined {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) return undefined;
  return process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT || undefined;
}

/**
 * Verschickt eine fertige RFC-822-Nachricht über die Gmail-API.
 *
 * Die base64url-Kodierung gehört hierher und nicht zum Aufrufer: Gmail
 * verlangt sie, und ein vergessenes `replace` fällt erst beim Empfänger auf.
 *
 * Wirft, wenn der Versand nicht konfiguriert ist. Aufrufer, für die eine Mail
 * ein Nebeneffekt ist (Bug-Report, Mangel-Benachrichtigung), fangen das ab —
 * der Datensatz ist da, und eine ausgefallene Benachrichtigung darf ihn nicht
 * entwerten.
 */
export async function sendRawMail(raw: string): Promise<void> {
  if (!mailSender()) {
    throw new Error('Email service not configured');
  }

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
