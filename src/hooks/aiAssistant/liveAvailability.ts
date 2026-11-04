/**
 * Wann der Sprach-Assistent das Live-Gespräch wieder versucht.
 *
 * Vorher genügte **ein** gescheiterter Aufbau, und das Gerät blieb bis zum
 * Neuladen beim Einzelaufruf. Auf einem Tablet im Einsatz reicht dafür ein
 * kurzer Funkloch-Moment beim Handshake — und danach war „Live nicht
 * verfügbar", obwohl Token und Dienst in Ordnung waren (beobachtet an einem
 * Gerät ohne Admin-Rechte, das am selben Tag fünf Tokens erfolgreich bekommen
 * hatte).
 *
 * Deshalb wird unterschieden: Was sich nicht von selbst bessert (kein Live-Key
 * in der Umgebung, Tageskontingent aufgebraucht), bleibt für die Lebensdauer
 * der Seite beim Einzelaufruf. Alles andere — Netz, Zeitüberschreitung, ein
 * Fehler der API — wird nach einer kurzen Pause wieder versucht.
 */

export type LiveUnavailableReason = 'unconfigured' | 'quota' | 'failed';

/** Der Server hat kein Token ausgegeben — mit dem Grund aus `createLiveToken`. */
export class LiveUnavailableError extends Error {
  constructor(
    public readonly reason: LiveUnavailableReason,
    detail?: string,
  ) {
    super(`Live-Token nicht verfügbar (${reason}${detail ? `: ${detail}` : ''})`);
    this.name = 'LiveUnavailableError';
  }
}

export type LiveFailureKind = 'permanent' | 'transient';

/** Pause nach einem vorübergehenden Fehler, bevor Live erneut versucht wird. */
export const LIVE_RETRY_AFTER_MS = 60_000;

export function classifyLiveFailure(error: unknown): LiveFailureKind {
  if (
    error instanceof LiveUnavailableError &&
    (error.reason === 'unconfigured' || error.reason === 'quota')
  ) {
    return 'permanent';
  }
  return 'transient';
}

export interface LiveAvailability {
  /** Ob der nächste Tipp das Live-Gespräch versuchen soll. */
  canTry: () => boolean;
  recordFailure: (error: unknown) => LiveFailureKind;
  recordSuccess: () => void;
}

export function createLiveAvailability(now: () => number = Date.now): LiveAvailability {
  let permanent = false;
  let retryAt = 0;
  return {
    canTry: () => !permanent && now() >= retryAt,
    recordFailure: (error) => {
      const kind = classifyLiveFailure(error);
      if (kind === 'permanent') permanent = true;
      else retryAt = now() + LIVE_RETRY_AFTER_MS;
      return kind;
    },
    recordSuccess: () => {
      retryAt = 0;
    },
  };
}
