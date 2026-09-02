/**
 * Die Nutzlast einer Atemschutz-Warnung — gemeinsam von Server und Service
 * Worker gelesen.
 *
 * Rein und ohne Firestore, damit beide Seiten dieselbe Form benutzen: Der
 * Server baut sie, der Worker liest sie, und der Worker kann nichts
 * importieren, was auf `firebase-admin` zeigt.
 */

import type { WarnungKey } from './atemschutz';

/**
 * Kennzeichnet eine Nachricht als Atemschutz-Warnung.
 *
 * Nötig, weil der Service Worker bisher **jede** Data-Message als
 * Chat-Nachricht angezeigt hat. Ohne Unterscheidung erschiene die Warnung als
 * „Einsatz Chat: undefined".
 */
export const ASUE_PUSH_KIND = 'asue';

/**
 * Alle Werte sind Zeichenketten: FCM lässt in `data` nichts anderes zu, und ein
 * `number` käme auf der anderen Seite ohnehin als Zeichenkette an.
 */
export interface AtemschutzPushData {
  kind: typeof ASUE_PUSH_KIND;
  title: string;
  body: string;
  /** Wohin der Klick auf die Benachrichtigung führt. */
  url: string;
  firecallId: string;
  truppId: string;
  warnung: WarnungKey;
}

/** Ob eine eingegangene Data-Message eine Atemschutz-Warnung ist. */
export function isAtemschutzPush(
  data: Record<string, string> | undefined,
): data is AtemschutzPushData & Record<string, string> {
  return data?.kind === ASUE_PUSH_KIND;
}

/** Die Seite, auf der die Warnung bearbeitet wird. */
export function ueberwachungUrl(firecallId: string): string {
  return `/einsatz/${firecallId}/atemschutzueberwachung`;
}

/**
 * Kennung, unter der die Benachrichtigung angezeigt wird.
 *
 * Je Trupp und nicht je Warnung: Eine neue Warnung zum selben Trupp soll die
 * alte **ersetzen**. Drei Meldungen zu einem Trupp untereinander sind keine
 * dreifache Information, sondern eine dreifach so lange Liste, in der die
 * aktuelle untergeht.
 */
export function pushTag(truppId: string): string {
  return `asue-${truppId}`;
}
