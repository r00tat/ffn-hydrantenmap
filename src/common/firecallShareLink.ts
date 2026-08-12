/**
 * Ein über den Share-Dialog erzeugter Gastzugang zu einem Einsatz, aufbereitet
 * für die Liste im Dialog. Die Daten stammen aus dem `user`-Dokument des Gasts
 * (siehe `FirebaseUserInfo`) plus `lastSignInTime` aus Firebase Auth.
 */
export interface FirecallShareLink {
  uid: string;
  /** Reiner Gastname, ohne den „(Einsatz-Gast …)"-Zusatz des Anzeigenamens. */
  name: string;
  canWrite: boolean;
  /**
   * Fehlt bei Zugängen aus der Zeit vor der Link-Verwaltung — sie gelten als
   * abgelaufen.
   */
  expiresAt?: number;
  createdAt?: number;
  createdByName?: string;
  lastSignInAt?: number;
  /** `authorized === false` im Benutzerdokument. */
  disabled: boolean;
}

export type ShareLinkStatus = 'active' | 'disabled' | 'expired';

export const SHARE_LINK_PRESETS = ['1d', '7d', '30d', 'custom'] as const;
export type ShareLinkPreset = (typeof SHARE_LINK_PRESETS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Obergrenze für die Gültigkeit. Ein Zugang ohne absehbares Ende soll es nicht
 * geben — ein vergessener Link wäre sonst dauerhaft offen.
 */
export const MAX_SHARE_LINK_DURATION_MS = 365 * DAY_MS;

const PRESET_DURATIONS: Record<Exclude<ShareLinkPreset, 'custom'>, number> = {
  '1d': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

/**
 * Status eines Zugangs. Ablauf schlägt Deaktivierung: ein abgelaufener Zugang
 * braucht ohnehin ein neues Datum, bevor eine Reaktivierung etwas bewirkt.
 */
export function shareLinkStatus(
  link: Pick<FirecallShareLink, 'expiresAt' | 'disabled'>,
  now: number
): ShareLinkStatus {
  if (!link.expiresAt || link.expiresAt <= now) {
    return 'expired';
  }
  return link.disabled ? 'disabled' : 'active';
}

/** Ablaufzeitpunkt für ein Preset. `custom` hat keine feste Dauer. */
export function expiryFromPreset(preset: ShareLinkPreset, now: number): number {
  if (preset === 'custom') {
    throw new Error('custom preset has no fixed duration');
  }
  return now + PRESET_DURATIONS[preset];
}

/**
 * Klemmt ein gewünschtes Ablaufdatum auf den erlaubten Bereich. Ein Datum in
 * der Vergangenheit ist ein Eingabefehler und kein zu korrigierender Wert —
 * stillschweigend „jetzt + irgendwas" daraus zu machen würde einen Zugang
 * verlängern, den jemand gerade beenden wollte.
 */
export function clampExpiry(expiresAt: number, now: number): number {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('expiry must be in the future');
  }
  return Math.min(expiresAt, now + MAX_SHARE_LINK_DURATION_MS);
}
