import { formatTimestamp } from '../../common/time-format';
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
