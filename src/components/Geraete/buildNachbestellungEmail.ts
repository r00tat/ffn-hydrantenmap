/**
 * Die Mail „bitte nachbestellen", wenn ein Artikel unter seinen
 * Mindestbestand fällt.
 *
 * Eine Mail kann mehrere Artikel tragen: Ein Import oder eine Inventur kann
 * mehrere zugleich unter die Grenze bringen, und dafür soll niemand einen
 * Stapel Einzelmails bekommen. Aufbau wie `buildMangelEmail` — reine
 * Textnachricht, Betreff RFC-2047-kodiert, Text base64.
 */

export interface NachbestellungItem {
  geraetId: string;
  bezeichnung: string;
  inventarNr?: string;
  bestandGesamt: number;
  mindestbestand: number;
  einheit?: string;
}

export interface NachbestellungEmailArgs {
  items: NachbestellungItem[];
  groupId: string;
  groupName?: string;
  /** Gesetzt, wenn ein Verbrauch im Einsatz die Grenze unterschritten hat. */
  firecallName?: string;
  appBaseUrl: string;
  from: string;
  to: string;
  cc?: string[];
}

export interface BuiltNachbestellungEmail {
  subject: string;
  body: string;
  raw: string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(value);
}

function withUnit(value: number, einheit?: string): string {
  const unit = einheit?.trim();
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function itemLines(item: NachbestellungItem): string[] {
  const inventarNr = item.inventarNr?.trim();
  const name = inventarNr ? `${item.bezeichnung} (Inv.-Nr. ${inventarNr})` : item.bezeichnung;
  return [
    `- ${name}`,
    `  Bestand ${withUnit(item.bestandGesamt, item.einheit)}, Mindestbestand ${withUnit(
      item.mindestbestand,
      item.einheit,
    )}`,
  ];
}

export function buildNachbestellungEmail({
  items,
  groupName,
  firecallName,
  appBaseUrl,
  from,
  to,
  cc,
}: NachbestellungEmailArgs): BuiltNachbestellungEmail {
  const subject =
    items.length === 1
      ? `[Nachbestellen] ${items[0].bezeichnung}`
      : `[Nachbestellen] ${items.length} Artikel unter Mindestbestand`;

  const link = `${appBaseUrl.replace(/\/$/, '')}/geraete`;

  const lines: string[] = [
    items.length === 1
      ? 'Ein Artikel ist unter seinen Mindestbestand gefallen — bitte nachbestellen.'
      : 'Folgende Artikel sind unter ihren Mindestbestand gefallen — bitte nachbestellen.',
    '',
  ];
  if (firecallName?.trim()) lines.push(`Einsatz:  ${firecallName.trim()}`);
  if (groupName?.trim()) lines.push(`Gruppe:   ${groupName.trim()}`);
  if (firecallName?.trim() || groupName?.trim()) lines.push('');
  for (const item of items) lines.push(...itemLines(item));
  lines.push('', `Lager in der Einsatzkarte: ${link}`);
  const body = lines.join('\r\n');

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');

  const raw = [headers, '', textPart, `--${boundary}--`].join('\r\n');
  return { subject, body, raw };
}
