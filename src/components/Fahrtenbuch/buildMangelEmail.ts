import type {
  FahrtenbuchEntry,
  FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import { ZWECK_LABELS } from './germanLabels';

/**
 * Zeitzone der Zeitangaben in der Mail. Der Server läuft in UTC, die
 * Empfängerin liest in Österreich — ohne feste Zone stünde eine Abfahrt um
 * 08:30 als „07:30" in der Mail. Dieselbe Vorgabe wie beim PDF-Export und in
 * `src/i18n/request.ts`.
 */
const TIME_ZONE = 'Europe/Vienna';

export interface MangelEmailArgs {
  entry: FahrtenbuchEntry;
  /**
   * Für Kennzeichen und Zähler-Bezeichnungen — beides steht in den Stammdaten
   * und nicht am Eintrag.
   */
  vehicle: Pick<FahrtenbuchVehicle, 'name' | 'kennzeichen' | 'counters'>;
  groupId: string;
  groupName?: string;
  appBaseUrl: string;
  from: string;
  to: string;
  cc?: string[];
}

export interface BuiltMangelEmail {
  subject: string;
  body: string;
  raw: string;
}

function dateTimeFormat(): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  // Dieselbe Rückfallebene wie im PDF-Export: Eine Laufzeit ohne
  // Zeitzonendaten darf die Benachrichtigung nicht scheitern lassen.
  try {
    return new Intl.DateTimeFormat('de-AT', { timeZone: TIME_ZONE, ...options });
  } catch {
    return new Intl.DateTimeFormat('de-AT', { timeZone: 'UTC', ...options });
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTimeFormat().format(date);
}

/** „Kilometerstand: 12045 km" je Zähler, der einen Endstand trägt. */
function counterLines(
  entry: FahrtenbuchEntry,
  vehicle: MangelEmailArgs['vehicle'],
): string[] {
  return (vehicle.counters ?? [])
    .map((def) => {
      const end = entry.counters?.[def.id]?.end;
      if (end === undefined) return undefined;
      // `label` ist immer gesetzt (siehe `CounterDefinition`); `labelKey` wäre
      // hier nutzlos, weil der Server keinen Übersetzungskatalog lädt.
      return `${def.label}: ${end}${def.unit ? ` ${def.unit}` : ''}`;
    })
    .filter((line): line is string => !!line);
}

/**
 * Wer die Fahrt erfasst hat. Beim anmeldefreien Weg steht in `createdBy` nur
 * `share:<linkId>` — die Kennung des Links gehört nicht in die Mail, die
 * Herkunft schon: Sie sagt der Empfängerin, dass hinter dem Namen kein
 * angemeldetes Mitglied steht und niemand zurückgefragt werden kann.
 */
function reporter(entry: FahrtenbuchEntry): string {
  const viaShareLink = entry.createdBy?.startsWith(SHARE_ACTOR_PREFIX);
  const name = entry.createdByName?.trim();
  if (viaShareLink) {
    return name ? `${name} (über Freigabelink)` : 'über Freigabelink';
  }
  return name || '-';
}

export function buildMangelEmail({
  entry,
  vehicle,
  groupId,
  groupName,
  appBaseUrl,
  from,
  to,
  cc,
}: MangelEmailArgs): BuiltMangelEmail {
  const vehicleName = vehicle.name || entry.vehicleName || '-';
  const kennzeichen = vehicle.kennzeichen?.trim();
  const vehicleLabel = kennzeichen
    ? `${vehicleName} (${kennzeichen})`
    : vehicleName;
  const driver = entry.driverName?.trim() || '-';

  const subject = `[Mangel] ${vehicleName} — ${driver}`;

  const counters = counterLines(entry, vehicle);
  const link = `${appBaseUrl.replace(/\/$/, '')}/fahrtenbuch/${groupId}/${entry.vehicleId}`;

  const lines: string[] = [
    'Für eine Fahrt im Fahrtenbuch wurde ein Defekt oder Mangel gemeldet.',
    '',
    `Fahrzeug:     ${vehicleLabel}`,
    `Fahrer:       ${driver}`,
    `Abfahrt:      ${formatDateTime(entry.abfahrt) || '-'}`,
    `Ankunft:      ${formatDateTime(entry.ankunft) || '-'}`,
    `Zweck:        ${ZWECK_LABELS[entry.zweck] ?? entry.zweck}`,
  ];
  if (entry.firecallName?.trim()) {
    lines.push(`Einsatz:      ${entry.firecallName.trim()}`);
  }
  if (entry.ziel?.trim()) {
    lines.push(`Ziel:         ${entry.ziel.trim()}`);
  }
  // Der allgemeine Hinweis steht bei den Fahrtdaten und nicht im Mangel-Block:
  // „Tank halb voll" ist kein Werkstattauftrag.
  if (entry.hinweise?.trim()) {
    lines.push(`Hinweis:      ${entry.hinweise.trim()}`);
  }
  if (counters.length > 0) {
    lines.push(`Zählerstände: ${counters.join(', ')}`);
  }
  lines.push(`Erfasst von:  ${reporter(entry)}`);
  if (groupName?.trim()) {
    lines.push(`Gruppe:       ${groupName.trim()}`);
  }
  lines.push(
    '',
    'Mangel:',
    // Kein Rückfall auf `hinweise`: Seit der Mangel ein eigenes Feld hat, wäre
    // das der allgemeine Hinweis, fälschlich als Mangel ausgegeben. Leer bleibt
    // das Feld nur bei Einträgen aus der Zeit davor — die Validierung verlangt
    // es heute zusammen mit dem Häkchen.
    entry.mangel?.trim() || '(vom Melder ohne Beschreibung eingetragen)',
    '',
    `Fahrt im Fahrtenbuch: ${link}`,
  );
  const body = lines.join('\r\n');

  // Aufbau wie bei `buildBugReportEmail`: eine reine Text-Nachricht in einem
  // `multipart/alternative`, Betreff RFC-2047-kodiert und der Text base64, damit
  // Umlaute jeden Transportweg unbeschädigt überstehen.
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
