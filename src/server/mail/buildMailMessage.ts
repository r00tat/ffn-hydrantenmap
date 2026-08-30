import 'server-only';

export interface MailAttachment {
  content: Buffer;
  filename: string;
  mimeType: string;
}

export interface MailMessage {
  to: string;
  from: string;
  replyTo?: string;
  cc?: string[];
  subject: string;
  body: string;
  attachments?: MailAttachment[];
}

/**
 * Baut eine RFC-2822-Nachricht mit Anhängen.
 *
 * Gehört neben `sendRawMail` und nicht zu einem Aufrufer: Kostenersatz und
 * Füllungsrechnung schicken dieselbe Art Nachricht — ein PDF an einen
 * Empfänger mit CC —, und ein zweites handgeschriebenes MIME hätte dieselben
 * Fallstricke (Base64 der Kopfzeile, CRLF, Grenzmarke) noch einmal.
 *
 * Der Betreff wird immer base64-kodiert: Er trägt regelmäßig Umlaute, und ein
 * roher 8-Bit-Betreff kommt je nach Empfänger zerlegt an.
 */
export function buildMailMessage(message: MailMessage): string {
  const { to, from, replyTo, cc, subject, body, attachments = [] } = message;
  const boundary = `boundary_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2)}`;

  const headers = [
    `From: ${from}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');

  const attachmentParts = attachments.map((attachment) =>
    [
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      attachment.content.toString('base64'),
    ].join('\r\n'),
  );

  return [headers, '', textPart, ...attachmentParts, `--${boundary}--`].join(
    '\r\n',
  );
}
