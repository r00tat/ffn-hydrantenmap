import { formatTimestamp } from '../../common/time-format';
import { Firecall } from '../firebase/firestore';

export const DEFAULT_EINSATZ_GROUP = 'ffnd';
export const DEFAULT_EINSATZ_FW = 'Neusiedl am See';

export function createDefaultEinsatz(
  now: Date = new Date(),
  overrides: Partial<Firecall> = {},
): Firecall {
  return {
    name: `Einsatz am ${formatTimestamp(now)}`,
    group: DEFAULT_EINSATZ_GROUP,
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
  };
}
