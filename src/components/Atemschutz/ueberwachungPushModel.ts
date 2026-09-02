import {
  truppLabel,
  type AtemschutzTrupp,
  type WarnungKey,
} from '../../common/atemschutz';
import {
  ASUE_PUSH_KIND,
  pushTag,
  ueberwachungUrl,
  type AtemschutzPushData,
} from '../../common/atemschutzPush';
import type {
  UeberwachungStand,
  WarnungFaellig,
} from '../../common/atemschutzUeberwachung';

/**
 * Der Text einer Atemschutz-Warnung.
 *
 * Getrennt vom Versand, damit die Formulierung ohne Firestore und ohne FCM
 * prüfbar ist — dieselbe Aufteilung wie zwischen `buildWeeklyReportEmail` und
 * `sendWeeklyReports`.
 */

/**
 * Die Schlüssel, die dieser Baustein verwendet — als Union und nicht als
 * `string`.
 *
 * Nur so lässt sich ein `createTranslator` aus dem Katalog direkt übergeben:
 * Dessen Schlüsselparameter ist die Union aller Schlüssel des Namensraums, und
 * ein `string` wäre dazu nicht zuweisbar. Ein `as unknown as` am Aufrufer wäre
 * die Alternative — und würde einen Tippfehler im Schlüssel verschweigen.
 */
export type PushKey =
  | `push.${WarnungKey}`
  | 'push.body'
  | 'push.truppOhneName';

/** Wie `ExportTranslate` im Fahrtenbuch: der Katalog wird hereingegeben. */
export type PushTranslate = (
  key: PushKey,
  values?: Record<string, string | number>,
) => string;

export interface UeberwachungPushArgs {
  firecallId: string;
  firecallName?: string;
  trupp: AtemschutzTrupp;
  stand: UeberwachungStand;
  warnung: WarnungFaellig;
  t: PushTranslate;
  /** Formatiert einen ISO-Zeitstempel als Uhrzeit. */
  uhrzeit: (iso: string) => string;
}

export interface UeberwachungPush {
  title: string;
  body: string;
  tag: string;
  data: AtemschutzPushData;
}

export function buildUeberwachungPush({
  firecallId,
  firecallName,
  trupp,
  stand,
  warnung,
  t,
  uhrzeit,
}: UeberwachungPushArgs): UeberwachungPush {
  const title = t(`push.${warnung.key}`, {
    trupp: truppLabel(trupp) || t('push.truppOhneName'),
  });
  // Der Körper trägt die drei Zahlen, auf die es am Funkgerät ankommt: welcher
  // Einsatz, wie viel Luft vermutlich noch da ist, und wann umgekehrt werden
  // muss. Mehr passt in eine Benachrichtigung nicht hinein.
  const body = t('push.body', {
    einsatz: firecallName?.trim() || '—',
    druck: Math.round(stand.vermuteterDruck),
    zeit: uhrzeit(stand.rueckzugZeit),
  });

  return {
    title,
    body,
    tag: pushTag(trupp.id ?? firecallId),
    data: {
      kind: ASUE_PUSH_KIND,
      title,
      body,
      url: ueberwachungUrl(firecallId),
      firecallId,
      truppId: trupp.id ?? '',
      warnung: warnung.key,
    },
  };
}
