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

/**
 * Der Server hat das Token ausgegeben, die Live-API aber den WebSocket vor
 * `setupComplete` geschlossen. Code und Grund kommen aus dem `CloseEvent` —
 * nur dort steht, *warum*; der Server der App sieht davon nichts.
 */
export class LiveRejectedError extends Error {
  constructor(
    public readonly code: number,
    public readonly reason: string,
  ) {
    super(`Live-Sitzung: Verbindung vom Server abgewiesen${reason ? `: ${reason}` : ''}`);
    this.name = 'LiveRejectedError';
  }
}

/**
 * Abweisungen, die sich nicht in einer Minute bessern: Abrechnung und
 * Kontingent des API-Projekts. Beobachtet am 2026-11-26 mit Code 1011 und
 * „Your prepayment credits are depleted" — das Token wurde ohne Fehler
 * ausgegeben, erst der Handshake scheiterte. Als vorübergehend eingestuft
 * versprach der Knopf jede Minute einen neuen Versuch, der ebenso scheiterte.
 */
const PERMANENT_REJECTION = /prepayment credits|billing|quota|RESOURCE_EXHAUSTED/i;

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
  if (error instanceof LiveRejectedError && PERMANENT_REJECTION.test(error.reason)) {
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
