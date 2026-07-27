import { formatTimestamp } from '../../common/time-format';
import { stripNullish } from '../../common/stripNullish';
import { Firecall } from '../firebase/firestore';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

export const DEFAULT_EINSATZ_FW = 'Neusiedl am See';

export function createDefaultEinsatz(
  now: Date = new Date(),
  overrides: Partial<Firecall> = {},
): Firecall {
  // group is intentionally left unset here. The dialog will assign it
  // dynamically based on the logged-in user's group memberships, so
  // anonymous defaults can never leak credentials of an unrelated group.
  return {
    name: `Einsatz am ${formatTimestamp(now)}`,
    fw: DEFAULT_EINSATZ_FW,
    description: '',
    date: now.toISOString(),
    eintreffen: now.toISOString(),
    deleted: false,
    ...overrides,
  };
}

export function resetEinsatzToManual(
  current: Firecall,
  now: Date = new Date(),
): Firecall {
  return {
    ...current,
    name: `Einsatz am ${formatTimestamp(now)}`,
    description: '',
    date: now.toISOString(),
    eintreffen: now.toISOString(),
    abruecken: undefined,
    lat: undefined,
    lng: undefined,
    blaulichtSmsAlarmId: undefined,
    blaulichtSmsAlarmIds: undefined,
  };
}

/**
 * Maps a BlaulichtSMS alarm onto the alarm-derived fields of a Firecall.
 * `group`/`fw` are intentionally NOT set here — callers assign them from their
 * own context (dialog: keeps the current group; page/API: the selected group).
 */
export function buildFirecallFromAlarm(
  alarm: BlaulichtSmsAlarm,
): Partial<Firecall> {
  const parts = alarm.alarmText.split('/');
  const name =
    parts.length >= 5
      ? [parts[2], parts[3], parts[4]].join(' ').trim()
      : alarm.alarmText;
  const coords = alarm.geolocation?.coordinates ?? alarm.coordinates ?? null;
  return {
    name,
    date: new Date(alarm.alarmDate).toISOString(),
    description: alarm.alarmText,
    blaulichtSmsAlarmId: alarm.alarmId,
    blaulichtSmsAlarmIds: [alarm.alarmId],
    ...(coords ? { lat: coords.lat, lng: coords.lon } : {}),
  };
}

/**
 * Builds a complete, ready-to-edit Firecall draft from a BlaulichtSMS alarm.
 *
 * Unlike the bare `buildFirecallFromAlarm` this sets `deleted: false`, which is
 * mandatory: every firecall list query filters on `deleted == false`, and a
 * Firestore equality filter never matches a document where the field is absent.
 * A draft created without the flag therefore produced a firecall that was
 * invisible in the Einsatz overview and — because the alarm-dedup lookup also
 * filters on `deleted` — did not stop a second firecall from being created for
 * the same alarm.
 */
export function createEinsatzFromAlarm(
  alarm: BlaulichtSmsAlarm,
  { group, fw }: { group: string; fw: string },
): Firecall {
  return {
    ...buildFirecallFromAlarm(alarm),
    group,
    fw,
    deleted: false,
  } as Firecall;
}

/**
 * Builds the Firestore payload for a brand-new firecall document.
 *
 * `deleted` is defaulted to `false` here as a safety net for every caller: a
 * document written without it is excluded from all `deleted == false` list
 * queries and effectively unreachable through the UI.
 */
export function buildNewFirecallPayload(
  fc: Firecall,
  {
    user,
    lat,
    lng,
    now = new Date(),
  }: { user?: string; lat?: number; lng?: number; now?: Date },
): Partial<Firecall> {
  return stripNullish({
    ...fc,
    deleted: fc.deleted ?? false,
    user,
    created: now.toISOString(),
    lat: fc.lat ?? lat,
    lng: fc.lng ?? lng,
  });
}
