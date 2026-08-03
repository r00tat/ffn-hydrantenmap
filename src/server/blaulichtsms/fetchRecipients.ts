import 'server-only';

import { ApiException } from '../../app/api/errors';
import { loadCredentials } from './fetchAlarms';

export interface BlaulichtSmsRecipientRecord {
  id: string;
  name: string;
}

function readId(record: Record<string, unknown>): string | undefined {
  for (const key of ['id', 'recipientId', 'participantId']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readName(record: Record<string, unknown>): string | undefined {
  const name = record.name;
  if (typeof name === 'string' && name.trim()) return name.trim();

  const first = typeof record.firstName === 'string' ? record.firstName.trim() : '';
  const last = typeof record.lastName === 'string' ? record.lastName.trim() : '';
  const combined = `${first} ${last}`.trim();
  return combined || undefined;
}

/**
 * Normalisiert die undokumentierte Antwort der Export-API auf `{ id, name }`.
 * Unbrauchbare Sätze werden verworfen statt zu raten.
 */
export function mapRecipients(payload: unknown): BlaulichtSmsRecipientRecord[] {
  let list: unknown = payload;
  if (!Array.isArray(list) && list && typeof list === 'object') {
    const wrapper = list as Record<string, unknown>;
    list = Array.isArray(wrapper.recipients)
      ? wrapper.recipients
      : Array.isArray(wrapper.data)
        ? wrapper.data
        : undefined;
  }
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const result: BlaulichtSmsRecipientRecord[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = readId(record);
    const name = readName(record);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name });
  }
  return result;
}

/**
 * Lädt die Teilnehmerliste einer Gruppe über die BlaulichtSMS-Export-API.
 * Wirft, damit Aufrufer den Fehler an die UI melden können.
 */
export async function fetchBlaulichtSmsRecipients(
  groupId: string,
): Promise<BlaulichtSmsRecipientRecord[]> {
  const creds = await loadCredentials(groupId);
  if (!creds) {
    throw new ApiException(`BlaulichtSMS not configured for group ${groupId}`, {
      status: 404,
    });
  }

  const response = await fetch(
    `https://api.blaulichtsms.net/blaulicht/api/public/v1/recipient/${encodeURIComponent(
      creds.customerId,
    )}/export`,
    {
      headers: {
        Accept: 'application/json',
        'X-Username': creds.username,
        'X-Password': creds.password,
      },
    },
  );

  if (!response.ok) {
    throw new ApiException(
      `BlaulichtSMS recipient export failed (${response.status} ${response.statusText})`,
      { status: 502 },
    );
  }

  return mapRecipients(await response.json());
}
