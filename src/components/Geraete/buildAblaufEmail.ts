/**
 * Die Sammelmail zu abgelaufenen und bald ablaufenden Chargen.
 *
 * Wöchentlich und je Gruppe eine Mail mit allen betroffenen Chargen — keine
 * Einzelmail je Charge: Wer Lager pflegt, arbeitet die Liste in einem Gang ab.
 * Aufbau wie der Wochenbericht des Fahrtenbuchs: HTML-Tabelle mit lesbarer
 * Text-Alternative, `multipart/alternative`, Betreff RFC-2047-kodiert, beide
 * Teile base64.
 */

import { formatCharge, formatLagerort } from '../../common/geraet';
import type { ExpiringCharge } from '../../common/geraetCharge';

export interface AblaufEmailArgs {
  items: ExpiringCharge[];
  groupName?: string;
  baseUrl: string;
  from: string;
  to: string;
  cc?: string[];
}

export interface BuiltAblaufEmail {
  subject: string;
  text: string;
  html: string;
  raw: string;
}

/** Inline-Styles, weil Gmail und Outlook `<style>`-Blöcke verwerfen. */
const STYLE = {
  body: 'font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111;',
  h1: 'font-size: 18px; margin: 0 0 8px;',
  table: 'border-collapse: collapse; width: 100%; font-size: 13px;',
  th: 'background-color: #e5e7eb; text-align: left; padding: 4px 6px; border: 1px solid #d1d5db;',
  td: 'padding: 4px 6px; border: 1px solid #e5e7eb; vertical-align: top;',
  tdRight:
    'padding: 4px 6px; border: 1px solid #e5e7eb; vertical-align: top; text-align: right;',
  rowExpired: 'background-color: #fee2e2;',
  rowSoon: 'background-color: #fef3c7;',
  muted: 'color: #6b7280; font-size: 13px;',
} as const;

const EMPTY_CELL = '–';

/** Alle Attribute stehen in doppelten Anführungszeichen — `'` muss nicht maskiert werden. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(value);
}

function withUnit(value: number, einheit?: string): string {
  const unit = einheit?.trim();
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** `YYYY-MM-DD` → `dd.mm.yyyy`; Unlesbares bleibt, wie es ist. */
function formatDate(iso: string | undefined): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso ?? '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function statusLabel(item: ExpiringCharge): string {
  return item.status === 'abgelaufen' ? 'abgelaufen' : 'läuft bald ab';
}

function losNummer(item: ExpiringCharge): string {
  return item.charge.losNummer?.trim() ?? '';
}

function lagerorte(item: ExpiringCharge): string[] {
  return item.jeBestand.map(
    ({ bestand, menge }) =>
      `${formatLagerort(bestand.lagerort) || EMPTY_CELL}: ${withUnit(menge, item.geraet.einheit)}`,
  );
}

function subjectOf(items: ExpiringCharge[], groupName?: string): string {
  const expired = items.filter((i) => i.status === 'abgelaufen').length;
  const soon = items.length - expired;
  const parts: string[] = [];
  if (expired > 0) parts.push(`${expired} abgelaufen`);
  if (soon > 0) parts.push(soon === 1 ? '1 läuft bald ab' : `${soon} laufen bald ab`);
  const base = `Chargen: ${parts.join(', ')}`;
  const name = groupName?.trim();
  return name ? `${base} — ${name}` : base;
}

function th(label: string): string {
  return `<th style="${STYLE.th}">${escapeHtml(label)}</th>`;
}

/** Leere Zelle als Gedankenstrich: Outlook rendert sonst ihre Rahmen nicht. */
function td(text: string, right = false): string {
  return `<td style="${right ? STYLE.tdRight : STYLE.td}">${escapeHtml(text) || EMPTY_CELL}</td>`;
}

function buildHtml(items: ExpiringCharge[], groupName: string | undefined, link: string): string {
  const heading = groupName?.trim()
    ? `Ablaufende Chargen — ${escapeHtml(groupName.trim())}`
    : 'Ablaufende Chargen';
  const head = ['Artikel', 'Charge', 'Los-Nr.', 'Ablaufdatum', 'Status', 'Menge', 'Lagerorte']
    .map(th)
    .join('');
  const rows = items
    .map((item) => {
      const style = item.status === 'abgelaufen' ? STYLE.rowExpired : STYLE.rowSoon;
      const orte = lagerorte(item).map(escapeHtml).join('<br>') || EMPTY_CELL;
      return (
        `<tr style="${style}">` +
        td(item.geraet.bezeichnung) +
        td(formatCharge(item.charge)) +
        td(losNummer(item)) +
        td(formatDate(item.charge.ablaufDatum)) +
        td(statusLabel(item)) +
        td(withUnit(item.menge, item.geraet.einheit), true) +
        `<td style="${STYLE.td}">${orte}</td>` +
        '</tr>'
      );
    })
    .join('');
  return (
    `<div style="${STYLE.body}">` +
    `<h1 style="${STYLE.h1}">${heading}</h1>` +
    `<p>Folgende Chargen sind abgelaufen oder laufen bald ab — bitte prüfen, verbrauchen oder ausbuchen.</p>` +
    `<table style="${STYLE.table}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="${STYLE.muted}">Lager in der Einsatzkarte: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    '</div>'
  );
}

function buildText(items: ExpiringCharge[], groupName: string | undefined, link: string): string {
  const lines: string[] = [
    'Folgende Chargen sind abgelaufen oder laufen bald ab — bitte prüfen, verbrauchen oder ausbuchen.',
    '',
  ];
  if (groupName?.trim()) lines.push(`Gruppe: ${groupName.trim()}`, '');
  // Ein Block je Charge statt Textspalten: Spalten aus Leerzeichen brechen auf
  // einem Telefon zusammen.
  for (const item of items) {
    const los = losNummer(item);
    const charge = formatCharge(item.charge);
    const chargeText = los && !charge.includes(los) ? `${charge} (Los ${los})` : charge;
    lines.push(
      `- ${item.geraet.bezeichnung} — ${chargeText}`,
      `  Ablauf ${formatDate(item.charge.ablaufDatum)} (${statusLabel(item)}), Menge ${withUnit(
        item.menge,
        item.geraet.einheit,
      )}`,
      ...lagerorte(item).map((ort) => `  ${ort}`),
    );
  }
  lines.push('', `Lager in der Einsatzkarte: ${link}`);
  return lines.join('\r\n');
}

/** base64 in Zeilen von 76 Zeichen (RFC 2045 §6.8) — siehe `buildWeeklyReportEmail`. */
function base64Lines(body: string): string {
  const encoded = Buffer.from(body).toString('base64');
  return (encoded.match(/.{1,76}/g) ?? ['']).join('\r\n');
}

export function buildAblaufEmail({
  items,
  groupName,
  baseUrl,
  from,
  to,
  cc,
}: AblaufEmailArgs): BuiltAblaufEmail {
  const link = `${baseUrl.replace(/\/$/, '')}/geraete`;
  const subject = subjectOf(items, groupName);
  const text = buildText(items, groupName, link);
  const html = buildHtml(items, groupName, link);

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const part = (contentType: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${contentType}; charset="UTF-8"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(body),
    ].join('\r\n');

  // Text zuerst: `multipart/alternative` ist nach aufsteigender Güte sortiert.
  const raw = [
    headers,
    '',
    part('text/plain', text),
    part('text/html', html),
    `--${boundary}--`,
  ].join('\r\n');

  return { subject, text, html, raw };
}
