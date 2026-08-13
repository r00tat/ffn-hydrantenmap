/**
 * Die Wochenbericht-Mail: HTML-Tabellen mit einer lesbaren Text-Alternative.
 *
 * Der Bericht ist tabellarisch — in reinem Text fällt er bei jeder
 * Zeichenbreite auseinander, deshalb ist HTML hier die Hauptfassung und nicht
 * wie bei der Mangel-Mail eine Zutat. Der MIME-Aufbau ist derselbe:
 * `multipart/alternative`, Betreff RFC-2047-kodiert, beide Teile base64, damit
 * Umlaute jeden Transportweg unbeschädigt überstehen.
 */

import { formatCounterValue, formatDayLabel } from './fahrtenbuchExportModel';
import type {
  WeeklyReportModel,
  WeeklyReportRow,
  WeeklyReportVehicle,
  WeeklyReportWarning,
} from './weeklyReportModel';

export interface WeeklyReportEmailArgs {
  model: WeeklyReportModel;
  appBaseUrl: string;
  from: string;
  to: string;
  cc?: string[];
}

export interface BuiltWeeklyReportEmail {
  subject: string;
  text: string;
  html: string;
  raw: string;
}

const EMPTY_TEXT = 'Keine Fahrten in diesem Zeitraum.';

/**
 * Inline-Styles, weil Gmail und Outlook `<style>`-Blöcke verwerfen. Als
 * Konstanten und nicht als Literale im Markup, damit eine Tabelle nicht anders
 * aussieht als die nächste.
 */
const STYLE = {
  body: 'font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111;',
  h1: 'font-size: 18px; margin: 0 0 4px;',
  h2: 'font-size: 15px; margin: 24px 0 6px; border-bottom: 2px solid #3b82f6; padding-bottom: 4px;',
  table: 'border-collapse: collapse; width: 100%; font-size: 13px;',
  th: 'background-color: #e5e7eb; text-align: left; padding: 4px 6px; border: 1px solid #d1d5db;',
  td: 'padding: 4px 6px; border: 1px solid #e5e7eb; vertical-align: top;',
  tdRight:
    'padding: 4px 6px; border: 1px solid #e5e7eb; vertical-align: top; text-align: right;',
  rowDefect: 'background-color: #fef3c7;',
  warning:
    'margin: 6px 0 0; padding: 6px 8px; background-color: #fee2e2; border-left: 4px solid #dc2626; font-size: 13px;',
  muted: 'color: #6b7280; font-size: 13px;',
  total: 'margin: 6px 0 0; font-size: 13px; color: #374151;',
} as const;

/**
 * Kein Ersatz für `'` nötig: Jedes Attribut im erzeugten Markup steht in
 * doppelten Anführungszeichen, und die sind maskiert. Ein Apostroph in einem
 * Fahrzeugnamen oder Mangeltext kann also nichts aufbrechen.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** „5 km" bzw. nur „5" bei einem Zähler ohne Einheit. */
function withUnit(value: string, unit: string): string {
  if (!value) return '';
  return unit ? `${value} ${unit}` : value;
}

function counterValue(value: number | undefined, estimated: boolean): string {
  if (value === undefined) return '';
  const text = formatCounterValue(value);
  // `formatCounterValue` gibt bei NaN oder Infinity einen Leerstring zurück —
  // dann darf auch kein „ca." davor stehen, sonst stünde in der Spalte ein
  // Vorbehalt ohne Zahl.
  if (!text) return '';
  // Dieselbe Kennzeichnung wie im PDF-Export: In einem Nachweisdokument muss
  // eine geschätzte Zahl als solche erkennbar bleiben.
  return estimated ? `ca. ${text}` : text;
}

/** „17552 – 17557" bzw. der einzelne Wert bei einem Ablesezähler. */
function counterRange(row: WeeklyReportRow, index: number): string {
  const counter = row.counters[index];
  const start = counterValue(counter.start, false);
  const end = counterValue(counter.end, counter.estimated);
  if (start && end) return `${start} – ${end}`;
  return end || start;
}

function counterDiff(row: WeeklyReportRow, index: number): string {
  const counter = row.counters[index];
  return withUnit(counterValue(counter.diff, counter.estimated), counter.unit);
}

/** Platzhalter für eine leere Tabellenzelle — siehe `td`. */
const EMPTY_CELL = '–';

function th(label: string): string {
  return `<th style="${STYLE.th}">${escapeHtml(label)}</th>`;
}

/**
 * Eine Tabellenzelle. Leerer Inhalt wird zum Gedankenstrich, weil Outlook bei
 * einer leeren Zelle die Rahmen nicht rendert — die Zeile bekäme mitten in der
 * Tabelle ein Loch.
 */
function td(text: string, right = false): string {
  return `<td style="${right ? STYLE.tdRight : STYLE.td}">${escapeHtml(text) || EMPTY_CELL}</td>`;
}

function fuelText(row: WeeklyReportRow): string {
  return row.fuel
    .map((f) => `${withUnit(formatCounterValue(f.amount), f.unit)} ${f.label}`)
    .join(', ');
}

function warningText(warning: WeeklyReportWarning): string {
  switch (warning.kind) {
    case 'gap':
      return `${warning.date}: Lücke im ${warning.counterLabel} — davor endete er bei ${withUnit(formatCounterValue(warning.previousEnd), warning.unit)}, diese Fahrt beginnt bei ${withUnit(formatCounterValue(warning.nextStart), warning.unit)}.`;
    case 'overlap':
      return `${warning.date}: ${warning.counterLabel} überlappt — davor endete er bei ${withUnit(formatCounterValue(warning.previousEnd), warning.unit)}, diese Fahrt beginnt darunter bei ${withUnit(formatCounterValue(warning.nextStart), warning.unit)}.`;
    case 'decrease':
      return `${warning.date}: ${warning.counterLabel} sinkt innerhalb der Fahrt — Start ${withUnit(formatCounterValue(warning.start), warning.unit)}, Ende ${withUnit(formatCounterValue(warning.end), warning.unit)}.`;
    case 'missing':
      return `${warning.date}: ${warning.counterLabel} fehlt.`;
  }
}

function periodLabel(model: WeeklyReportModel): string {
  return `${formatDayLabel(model.period.from)} – ${formatDayLabel(model.period.to)}`;
}

function subjectOf(model: WeeklyReportModel): string {
  const base = `Fahrtenbuch-Wochenbericht KW${model.period.week}`;
  const withGroup = model.groupName?.trim()
    ? `${base} — ${model.groupName.trim()}`
    : base;
  return model.entryCount === 0 ? `${withGroup} (keine Fahrten)` : withGroup;
}

/**
 * Spaltenköpfe einer Fahrzeugtabelle; die Zählerspalten hängen am Fahrzeug.
 *
 * Die erste Zeile genügt als Vorlage: `buildWeeklyReportModel` ermittelt die
 * Zählerdefinitionen einmal je Fahrzeug und bildet daraus jede Zeile ab, also
 * tragen alle Zeilen dieselben Zähler in derselben Reihenfolge. Wäre das nicht
 * so, verrutschten Kopf und Zellen gegeneinander.
 */
function columnsOf(vehicle: WeeklyReportVehicle): string[] {
  const counterColumns = (vehicle.rows[0]?.counters ?? []).flatMap(
    (counter) => [
      counter.unit ? `${counter.label} (${counter.unit})` : counter.label,
      counter.unit ? `Gefahren (${counter.unit})` : 'Gefahren',
    ],
  );
  return [
    'Datum',
    'Zeit',
    'Fahrer',
    'Grund',
    'Zweck/Strecke',
    ...counterColumns,
    'Getankt',
    'Notizen',
  ];
}

function cellsOf(row: WeeklyReportRow): { text: string; right: boolean }[] {
  const counterCells = row.counters.flatMap((_counter, index) => [
    { text: counterRange(row, index), right: true },
    { text: counterDiff(row, index), right: true },
  ]);
  return [
    { text: row.date, right: false },
    { text: row.timeRange, right: false },
    { text: row.driver, right: false },
    { text: row.zweck, right: false },
    { text: row.ziel, right: false },
    ...counterCells,
    { text: fuelText(row), right: false },
    { text: row.note ?? '', right: false },
  ];
}

function totalsText(vehicle: WeeklyReportVehicle, separator: string): string {
  return vehicle.totals
    .map((t) => `${t.label}: ${withUnit(formatCounterValue(t.value), t.unit)}`)
    .join(separator);
}

function vehicleHtml(vehicle: WeeklyReportVehicle): string {
  const parts = [`<h2 style="${STYLE.h2}">${escapeHtml(vehicle.heading)}</h2>`];

  if (vehicle.rows.length === 0) {
    parts.push(`<p style="${STYLE.muted}">${EMPTY_TEXT}</p>`);
  } else {
    const head = columnsOf(vehicle).map(th).join('');
    const body = vehicle.rows
      .map((row) => {
        const cells = cellsOf(row)
          .map((cell) => td(cell.text, cell.right))
          .join('');
        return `<tr${row.defekt ? ` style="${STYLE.rowDefect}"` : ''}>${cells}</tr>`;
      })
      .join('');
    parts.push(
      `<table style="${STYLE.table}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    );
  }

  if (vehicle.totals.length > 0) {
    parts.push(
      `<p style="${STYLE.total}">Summe der Woche — ${escapeHtml(totalsText(vehicle, ' · '))}</p>`,
    );
  }

  for (const warning of vehicle.warnings) {
    parts.push(`<p style="${STYLE.warning}">${escapeHtml(warningText(warning))}</p>`);
  }

  return parts.join('');
}

function mangelHtml(model: WeeklyReportModel): string {
  if (model.openMangel.length === 0) return '';
  const rows = model.openMangel
    .map(
      (m) =>
        `<tr>${[
          m.vehicleName,
          m.statusLabel,
          m.description,
          m.reportedAt,
          m.reportedByName,
        ]
          .map((value) => td(value))
          .join('')}</tr>`,
    )
    .join('');
  return (
    `<h2 style="${STYLE.h2}">Offene Mängel (${model.openMangel.length})</h2>` +
    `<table style="${STYLE.table}"><thead><tr>` +
    ['Fahrzeug', 'Status', 'Mangel', 'Gemeldet', 'Melder'].map(th).join('') +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

function buildHtml(model: WeeklyReportModel, link: string): string {
  const heading = model.groupName?.trim()
    ? `Fahrtenbuch-Wochenbericht — ${escapeHtml(model.groupName.trim())}`
    : 'Fahrtenbuch-Wochenbericht';
  return (
    `<div style="${STYLE.body}">` +
    `<h1 style="${STYLE.h1}">${heading}</h1>` +
    `<p style="${STYLE.muted}">Zeitraum: ${periodLabel(model)} (KW${model.period.week})</p>` +
    model.vehicles.map(vehicleHtml).join('') +
    mangelHtml(model) +
    `<p style="${STYLE.muted}">Fahrtenbuch öffnen: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    '</div>'
  );
}

function buildText(model: WeeklyReportModel, link: string): string {
  const heading = model.groupName?.trim()
    ? `Fahrtenbuch-Wochenbericht — ${model.groupName.trim()}`
    : 'Fahrtenbuch-Wochenbericht';
  const lines: string[] = [
    heading,
    `Zeitraum: ${periodLabel(model)} (KW${model.period.week})`,
  ];

  for (const vehicle of model.vehicles) {
    lines.push('', vehicle.heading, '-'.repeat(vehicle.heading.length));
    if (vehicle.rows.length === 0) {
      lines.push(`  ${EMPTY_TEXT}`);
    }
    // Ein Block je Fahrt statt einer Textspalten-Tabelle: Spalten aus
    // Leerzeichen brechen auf einem Telefon in der ersten Zeile zusammen, ein
    // Block bleibt lesbar. Die Leerzeile davor trennt die Fahrten sichtbar.
    for (const row of vehicle.rows) {
      lines.push('', `  ${row.date} ${row.timeRange}  ${row.driver}`.trimEnd());
      const purpose = [row.zweck, row.ziel].filter(Boolean).join(' — ');
      if (purpose) lines.push(`    ${purpose}`);
      row.counters.forEach((counter, index) => {
        const range = counterRange(row, index);
        if (!range) return;
        const diff = counterDiff(row, index);
        lines.push(`    ${counter.label}: ${range}${diff ? ` (${diff})` : ''}`);
      });
      if (row.fuel.length > 0) lines.push(`    Getankt: ${fuelText(row)}`);
      if (row.note) lines.push(`    ${row.note}`);
    }
    if (vehicle.totals.length > 0) {
      // Gedankenstrich wie in der HTML-Fassung, nicht Doppelpunkt: Die Summen
      // tragen selbst schon einen („Summe der Woche: Kilometerstand: 43 km").
      lines.push('', `  Summe der Woche — ${totalsText(vehicle, ', ')}`);
    }
    for (const warning of vehicle.warnings) {
      lines.push(`  ! ${warningText(warning)}`);
    }
  }

  if (model.openMangel.length > 0) {
    const title = `Offene Mängel (${model.openMangel.length})`;
    lines.push('', title, '-'.repeat(title.length));
    for (const m of model.openMangel) {
      lines.push(
        `  ${m.vehicleName} [${m.statusLabel}] ${m.description}`,
        `    gemeldet ${m.reportedAt} von ${m.reportedByName}`,
      );
    }
  }

  lines.push('', `Fahrtenbuch öffnen: ${link}`);
  return lines.join('\r\n');
}

/**
 * base64 in Zeilen von 76 Zeichen.
 *
 * `Buffer.toString('base64')` liefert eine einzige Zeile; RFC 2045 §6.8 lässt
 * höchstens 76 Zeichen zu und SMTP höchstens 998 Oktetten je Zeile. Bei der
 * kurzen Mangel-Mail fällt das nicht auf, der HTML-Teil des Wochenberichts
 * wird aber mit jedem Fahrzeug länger und übersteigt die SMTP-Grenze schnell.
 * Gmail baut die Nachricht beim Versand ohnehin neu (die Mail des
 * Vorgängersystems kam quoted-printable an), aber darauf zu setzen heißt, den
 * Bericht auf ein undokumentiertes Verhalten zu stellen.
 */
function base64Lines(body: string): string {
  const encoded = Buffer.from(body).toString('base64');
  return (encoded.match(/.{1,76}/g) ?? ['']).join('\r\n');
}

export function buildWeeklyReportEmail({
  model,
  appBaseUrl,
  from,
  to,
  cc,
}: WeeklyReportEmailArgs): BuiltWeeklyReportEmail {
  const link = `${appBaseUrl.replace(/\/$/, '')}/fahrtenbuch/${model.groupId}`;
  const subject = subjectOf(model);
  const text = buildText(model, link);
  const html = buildHtml(model, link);

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

  // Die Text-Fassung zuerst: `multipart/alternative` ist nach aufsteigender
  // Güte sortiert, der Client nimmt den letzten Teil, den er darstellen kann.
  const raw = [
    headers,
    '',
    part('text/plain', text),
    part('text/html', html),
    `--${boundary}--`,
  ].join('\r\n');

  return { subject, text, html, raw };
}
