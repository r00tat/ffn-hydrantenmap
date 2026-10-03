import type { AtemschutzTrupp, WarnungKey } from '../../common/atemschutz';
import { naechsteWarnung, type WarnungOptionen } from '../../common/atemschutzUeberwachung';
import { hinweisId } from './ueberwachungHinweise';

/**
 * Der nächste Termin einer Atemschutzwarnung **auf diesem Gerät**.
 *
 * Offline kommt kein Push: Weder läuft die Aufgabe in Cloud Tasks an (die
 * Planung selbst braucht den Server), noch erreicht FCM das Gerät. Die offene
 * Seite muss den Termin deshalb selbst kennen — nicht nur jede Sekunde
 * nachsehen. Ein `setInterval` im Hintergrund drosselt der Browser auf einmal
 * je Minute; ein einzelner Zeitgeber auf genau den Termin trifft ihn, und die
 * App kann denselben Termin als native Benachrichtigung beim Betriebssystem
 * hinterlegen.
 *
 * Gerechnet wird mit `naechsteWarnung` — derselben Funktion, aus der der Server
 * seine Aufgabe plant. Zwei Unterschiede:
 *
 * - **Was dieses Gerät schon gezeigt hat, gilt als verschickt** (`gemeldet`).
 *   Offline vermerkt der Server nichts am Dokument; ohne diesen Abgleich käme
 *   immer wieder derselbe Termin heraus.
 * - **Nur Termine in der Zukunft.** Ein vergangener Termin ist entweder schon
 *   fällig (dann meldet ihn der Sekundentakt der Seite) oder durch eine Meldung
 *   erledigt — eine Druckabfrage nach dem Drittel lässt `naechsteWarnung` das
 *   Drittel weiter liefern, weil es nur nach der Buchführung filtert. Ein
 *   Zeitgeber darauf liefe sofort und immer wieder an.
 */

export interface LocalWarningPlan {
  /** Wie `hinweisId` — derselbe Schlüssel wie in der Anzeige der Seite. */
  id: string;
  truppId: string;
  key: WarnungKey;
  at: Date;
}

export interface LocalWarningOptions extends WarnungOptionen {
  /** Was dieses Gerät bereits gezeigt hat (`hinweisId`). */
  gemeldet?: ReadonlySet<string>;
}

const MAX_SKIPS = 3;

export function nextLocalWarningFor(
  trupp: AtemschutzTrupp,
  jetzt: Date,
  opts: LocalWarningOptions = {},
): LocalWarningPlan | undefined {
  const truppId = trupp.id;
  if (!truppId) return undefined;
  const { gemeldet, ...warnOpts } = opts;

  const handled: Partial<Record<WarnungKey, string>> = {
    ...(trupp.warnungen ?? {}),
  };
  if (gemeldet) {
    for (const key of ['drittel', 'zweiDrittel', 'rueckzug'] as const) {
      if (gemeldet.has(hinweisId(truppId, key))) handled[key] = 'lokal';
    }
  }

  // Höchstens drei Warnungen — nach drei übersprungenen bleibt keine mehr.
  for (let i = 0; i <= MAX_SKIPS; i++) {
    const plan = naechsteWarnung({ ...trupp, warnungen: handled }, jetzt, warnOpts);
    if (!plan) return undefined;
    const at = new Date(plan.faelligAb);
    if (at.getTime() > jetzt.getTime()) {
      return { id: hinweisId(truppId, plan.key), truppId, key: plan.key, at };
    }
    handled[plan.key] = 'vergangen';
  }
  return undefined;
}

/** Je Trupp der nächste Termin; Trupps ohne Termin fehlen. */
export function nextLocalWarnings(
  trupps: AtemschutzTrupp[],
  jetzt: Date,
  opts: LocalWarningOptions = {},
): LocalWarningPlan[] {
  const plans: LocalWarningPlan[] = [];
  for (const trupp of trupps) {
    const plan = nextLocalWarningFor(trupp, jetzt, opts);
    if (plan) plans.push(plan);
  }
  return plans;
}

export function earliestLocalWarning(plans: LocalWarningPlan[]): LocalWarningPlan | undefined {
  let earliest: LocalWarningPlan | undefined;
  for (const plan of plans) {
    if (!earliest || plan.at.getTime() < earliest.at.getTime()) earliest = plan;
  }
  return earliest;
}
