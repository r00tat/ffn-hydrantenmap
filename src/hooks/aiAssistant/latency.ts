/**
 * Laufzeitmessung für den Sprach-Assistenten.
 *
 * Der Assistent besteht aus mehreren Modell-Roundtrips hintereinander
 * (Transkription → Interpretation → Antwortformulierung) plus der
 * Werkzeugausführung dazwischen. Welcher Teil die Wartezeit dominiert, lässt
 * sich ohne Zahlen nicht sagen — deshalb misst ein Lauf jede Phase einzeln und
 * schreibt am Ende eine kopierbare Übersicht in die Konsole.
 *
 * Ein Lauf beginnt beim Loslassen des Aufnahme-Buttons und endet, wenn die
 * Antwort auf dem Schirm steht bzw. gesprochen wird. Er wird durch die
 * Aufrufkette gereicht, damit Aufnahme, Modell und Ausgabe in derselben
 * Zeitachse landen.
 */

export type LatencyDetail = Record<string, string | number | boolean | undefined>;

export interface LatencyPhase {
  name: string;
  /** Abstand zum Start des Laufs in ms */
  atMs: number;
  durationMs: number;
  detail?: LatencyDetail;
  /** Die Phase endete mit einem Fehler; die Dauer ist trotzdem gemessen. */
  failed?: boolean;
}

export interface LatencySummary {
  label: string;
  totalMs: number;
  /** Zeit, die in keiner Phase erfasst ist (Rendern, Zustandswechsel, …) */
  unaccountedMs: number;
  phases: LatencyPhase[];
  detail?: LatencyDetail;
}

export interface LatencyRun {
  readonly label: string;
  /** Misst eine asynchrone Phase — auch dann, wenn sie mit einem Fehler endet. */
  phase<T>(name: string, fn: () => Promise<T>, detail?: LatencyDetail): Promise<T>;
  /** Misst einen synchronen Abschnitt, z.B. das Serialisieren des Kontexts. */
  sync<T>(name: string, fn: () => T, detail?: LatencyDetail): T;
  /** Hält die Zeit seit dem letzten Ereignis als eigene Phase fest. */
  mark(name: string, detail?: LatencyDetail): void;
  /**
   * Ergänzt die zuletzt gemessene Phase — für Angaben, die erst nach ihrem
   * Ende feststehen, etwa der Token-Verbrauch aus der Modellantwort.
   */
  annotateLast(detail: LatencyDetail): void;
  /** Ergänzt Angaben zum gesamten Lauf, z.B. Größe des Audios. */
  note(detail: LatencyDetail): void;
  /** Schließt den Lauf ab und protokolliert ihn — mehrfach aufrufbar. */
  finish(): LatencySummary;
}

export interface LatencyRunOptions {
  now?: () => number;
  log?: (summary: LatencySummary, text: string) => void;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function defaultLog(summary: LatencySummary, text: string): void {
  console.info(text);
  // Zusätzlich maschinenlesbar, damit eine Messreihe ohne Abtippen in ein
  // Issue oder eine Tabelle wandern kann.
  console.info('[AI][latency-json]', JSON.stringify(summary));
}

function formatDetail(detail?: LatencyDetail): string {
  if (!detail) return '';
  const parts = Object.entries(detail)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function share(durationMs: number, totalMs: number): string {
  if (totalMs <= 0) return '  0%';
  return `${Math.round((durationMs / totalMs) * 100)}%`.padStart(4, ' ');
}

export function formatLatencySummary(summary: LatencySummary): string {
  const lines = [
    `[AI][latency] ${summary.label}: ${Math.round(summary.totalMs)} ms gesamt${formatDetail(summary.detail)}`,
  ];
  const nameWidth = Math.max(
    4,
    ...summary.phases.map((p) => p.name.length),
  );
  for (const phase of summary.phases) {
    lines.push(
      `  ${phase.name.padEnd(nameWidth)} ${String(Math.round(phase.durationMs)).padStart(6)} ms ${share(
        phase.durationMs,
        summary.totalMs
      )}${phase.failed ? ' FEHLER' : ''}${formatDetail(phase.detail)}`
    );
  }
  lines.push(
    `  ${'Rest'.padEnd(nameWidth)} ${String(Math.round(summary.unaccountedMs)).padStart(6)} ms ${share(
      summary.unaccountedMs,
      summary.totalMs
    )}`
  );
  return lines.join('\n');
}

export function startLatencyRun(label: string, options: LatencyRunOptions = {}): LatencyRun {
  const now = options.now ?? defaultNow;
  const log = options.log ?? defaultLog;

  const startedAt = now();
  let lastEventAt = startedAt;
  const phases: LatencyPhase[] = [];
  let runDetail: LatencyDetail | undefined;
  let summary: LatencySummary | null = null;

  const record = (name: string, startAt: number, endAt: number, detail?: LatencyDetail, failed?: boolean) => {
    phases.push({
      name,
      atMs: startAt - startedAt,
      durationMs: endAt - startAt,
      ...(detail ? { detail } : {}),
      ...(failed ? { failed: true } : {}),
    });
    lastEventAt = endAt;
  };

  return {
    label,

    async phase<T>(name: string, fn: () => Promise<T>, detail?: LatencyDetail): Promise<T> {
      const startAt = now();
      try {
        const result = await fn();
        record(name, startAt, now(), detail);
        return result;
      } catch (error) {
        record(name, startAt, now(), detail, true);
        throw error;
      }
    },

    sync<T>(name: string, fn: () => T, detail?: LatencyDetail): T {
      const startAt = now();
      try {
        const result = fn();
        record(name, startAt, now(), detail);
        return result;
      } catch (error) {
        record(name, startAt, now(), detail, true);
        throw error;
      }
    },

    mark(name: string, detail?: LatencyDetail): void {
      record(name, lastEventAt, now(), detail);
    },

    annotateLast(detail: LatencyDetail): void {
      const last = phases[phases.length - 1];
      if (!last) return;
      last.detail = { ...(last.detail ?? {}), ...detail };
    },

    note(detail: LatencyDetail): void {
      runDetail = { ...(runDetail ?? {}), ...detail };
    },

    finish(): LatencySummary {
      if (summary) return summary;
      const totalMs = now() - startedAt;
      const measured = phases.reduce((sum, phase) => sum + phase.durationMs, 0);
      summary = {
        label,
        totalMs,
        unaccountedMs: Math.max(0, totalMs - measured),
        phases,
        ...(runDetail ? { detail: runDetail } : {}),
      };
      log(summary, formatLatencySummary(summary));
      return summary;
    },
  };
}

/**
 * Token-Verbrauch einer Modellantwort als Messangaben. `thoughtsTokens` ist
 * der interessante Wert: Er zeigt, ob das Modell trotz einfacher Aufgabe
 * nachdenkt — die Vermutung aus Issue #740.
 */
export function tokenDetail(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}): LatencyDetail {
  if (!usage) return {};
  return {
    promptTokens: usage.promptTokenCount,
    antwortTokens: usage.candidatesTokenCount,
    thoughtsTokens: usage.thoughtsTokenCount,
    gesamtTokens: usage.totalTokenCount,
    // Systemprompt und Werkzeugdeklarationen sind gut 9k Token und gehen bei
    // jedem Aufruf mit. Ob Gemini sie implizit zwischenspeichert, steht hier.
    cacheTokens: usage.cachedContentTokenCount,
  };
}
