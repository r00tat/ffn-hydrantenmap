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
import {
  istVorwarnung,
  type UeberwachungStand,
  type WarnungFaellig,
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
  | 'push.rueckzugVoraus'
  | 'push.zeile'
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
  /**
   * Einzeilige Fassung für die Anzeige auf der **eigenen Seite** (Snackbar).
   *
   * Wie `body`, aber mit dem Titel anstelle des Einsatznamens: Auf der eigenen
   * Seite ist der Einsatz bekannt, der Trupp und die Frist sind es nicht.
   */
  zeile: string;
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
  const truppName = truppLabel(trupp) || t('push.truppOhneName');
  // Vor dem Zeitpunkt eine Vorwarnung, ab dem Zeitpunkt die Aufforderung: Mit
  // einem Vorlauf von einer Minute darf die Meldung nicht „jetzt umkehren"
  // heißen, solange noch eine Minute Arbeitszeit ist.
  const vorwarnung = istVorwarnung(stand, warnung.key);
  const title = vorwarnung
    ? t('push.rueckzugVoraus', {
        trupp: truppName,
        // Nie „in 0 min": Aufgerundet auf die nächste ganze Minute, mindestens
        // eine — die Meldung soll eine Frist nennen, keine Null.
        minuten: Math.max(1, Math.round(stand.minutenBisRueckzug)),
      })
    : t(`push.${warnung.key}`, { trupp: truppName });
  // Der Körper trägt die drei Zahlen, auf die es am Funkgerät ankommt: welcher
  // Einsatz, wie viel Luft vermutlich noch da ist, und wann umgekehrt werden
  // muss. Mehr passt in eine Benachrichtigung nicht hinein.
  const body = t('push.body', {
    einsatz: firecallName?.trim() || '—',
    druck: Math.round(stand.vermuteterDruck),
    zeit: uhrzeit(stand.rueckzugZeit),
  });
  const zeile = t('push.zeile', {
    titel: title,
    druck: Math.round(stand.vermuteterDruck),
    zeit: uhrzeit(stand.rueckzugZeit),
  });

  return {
    title,
    body,
    zeile,
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
