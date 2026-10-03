'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type {
  AtemschutzTrupp,
  Geraetesatz,
  WarnungKey,
} from '../../common/atemschutz';
import {
  berechneStand,
  istVorwarnung,
} from '../../common/atemschutzUeberwachung';
import {
  isNativeLocalNotificationsAvailable,
  syncNativeNotifications,
  type NativeScheduledNotification,
} from '../../lib/nativeLocalNotifications';
import { useSnackbar } from '../providers/SnackbarProvider';
import {
  earliestLocalWarning,
  nextLocalWarnings,
} from './localWarningSchedule';
import { buildUeberwachungPush } from './ueberwachungPushModel';
import {
  dringlichsterHinweis,
  neueHinweise,
  type Hinweis,
} from './ueberwachungHinweise';

export interface UeberwachungHinweiseArgs {
  firecallId: string;
  firecallName?: string;
  /** Die Trupps unter Atemschutz — andere haben keine Frist. */
  trupps: AtemschutzTrupp[];
  /** Die laufende Uhr; jeder Tick prüft die Fristen erneut. */
  jetzt: Date;
  vorgabe: Geraetesatz;
}

interface Meldung {
  title: string;
  body: string;
  tag: string;
  url: string;
  dringend: boolean;
}

/**
 * Wie lange eine Meldung auf der Seite stehen bleibt.
 *
 * Der Rückzug ist die sicherheitsrelevante Meldung und bekommt mehr Zeit; die
 * Drittel-Erinnerungen sind Meldedisziplin. Beide gehen wieder von selbst — eine
 * Snackbar, die stehen bleibt, verdeckt am Telefon die Karte darunter, und genau
 * die trägt die Zahlen.
 */
/**
 * Zuschlag auf den Termin des Weckers: `faelligeWarnungen` vergleicht mit
 * `>=`, und ein Zeitgeber, der eine Millisekunde zu früh anläuft, fände nichts
 * und plante denselben Termin erneut.
 */
const WAKE_SLACK_MS = 500;

/** `setTimeout` läuft über 2^31-1 ms sofort an — und ein Termin liegt nie so weit. */
const MAX_TIMER_MS = 2_147_000_000;

const SNACKBAR_MS: Record<WarnungKey, number> = {
  drittel: 6000,
  zweiDrittel: 6000,
  rueckzug: 10_000,
};

/**
 * Rot erst, wenn der Zeitpunkt erreicht ist — dieselbe Regel wie der Alert auf
 * der Karte.
 */
function severityVon(hinweis: Hinweis): 'warning' | 'error' {
  return istVorwarnung(hinweis.stand, hinweis.warnung.key) ||
    hinweis.warnung.key !== 'rueckzug'
    ? 'warning'
    : 'error';
}

/**
 * Zeigt eine Benachrichtigung — über den Service Worker, wenn es einen gibt.
 *
 * Der Umweg über die Registrierung und nicht `new Notification`: Nur so
 * greifen `tag` und `renotify`, und nur so ist es dieselbe Benachrichtigung wie
 * die des Servers. Beide tragen `asue-<truppId>`; die zweite ersetzt damit die
 * erste, statt sich darunter zu stapeln. Ohne Service Worker — im
 * Android-WebView etwa — bleibt der einfache Konstruktor.
 */
async function zeige(meldung: Meldung): Promise<void> {
  const optionen = {
    body: meldung.body,
    icon: '/brand/icon-192.png',
    tag: meldung.tag,
    renotify: true,
    // Der Rückzugszeitpunkt ist eine Sicherheitsmeldung und darf nicht von
    // selbst verschwinden; die Erinnerungen dürfen es.
    requireInteraction: meldung.dringend,
    data: { url: meldung.url },
  } as NotificationOptions;

  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(meldung.title, optionen);
        return;
      }
    }
    new Notification(meldung.title, optionen);
  } catch (err) {
    // Eine abgelehnte Benachrichtigung darf die Seite nicht mitnehmen: Die
    // Warnung steht ohnehin auf der Karte und in der Snackbar.
    console.warn('Atemschutzwarnung konnte nicht angezeigt werden', err);
  }
}

/**
 * Meldet fällige Atemschutzwarnungen aus der **geöffneten Seite** heraus.
 *
 * Gegenstück zum Serverlauf (`sendUeberwachungWarnungen`) und keine
 * Verdopplung: Der Serverlauf erreicht die Geräte, die die Seite *nicht* offen
 * haben; er braucht dafür Cloud Scheduler, einen Push-Token und die Erlaubnis
 * des Browsers. In der Entwicklung gibt es keinen Zeitplan, und selbst in der
 * Cloud ist eine Warnung, die von einer einzigen Kette abhängt, für eine
 * Sicherheitsfunktion zu wenig.
 *
 * **Die Snackbar zuerst, die Benachrichtigung als Zugabe.** Vorher stieg dieser
 * Hook vor allem anderen aus, wenn `Notification.permission` nicht `granted`
 * war — dann wurde nicht einmal gerechnet, und auf der Seite war nichts zu
 * sehen. Jetzt ist die Anzeige auf der Seite der verlässliche Weg, und die
 * Systembenachrichtigung erreicht zusätzlich den gesperrten Bildschirm.
 *
 * Was schon gezeigt wurde, steht in einem Ref und nicht am Dokument: Die
 * Buchführung dort gehört dem Serverlauf, und ein Vermerk aus dem Browser
 * unterdrückte den Push an alle anderen Geräte.
 *
 * **Offline plant die Seite den nächsten Termin selbst** (siehe
 * `localWarningSchedule.ts`): ein Zeitgeber auf genau den nächsten Termin, der
 * die Prüfung auslöst, auch wenn der Sekundentakt im Hintergrund gedrosselt
 * ist; und in der App — sofern das Plugin `@capacitor/local-notifications`
 * vorhanden ist — je Trupp eine beim Betriebssystem hinterlegte
 * Benachrichtigung, die auch den gesperrten Bildschirm erreicht. Doppelt
 * erscheint nichts: Die Benachrichtigung aus der Seite trägt denselben `tag`
 * wie der Push des Servers, die native dieselbe Kennung je Trupp.
 */
export default function useUeberwachungHinweise({
  firecallId,
  firecallName,
  trupps,
  jetzt,
  vorgabe,
}: UeberwachungHinweiseArgs): void {
  const t = useTranslations('atemschutz.ueberwachung');
  const format = useFormatter();
  const showSnackbar = useSnackbar();
  const gemeldet = useRef(new Set<string>());
  // Vom Wecker gesetzt: Läuft der Termin an, prüft die Seite mit dieser Zeit,
  // auch wenn `jetzt` (der Sekundentakt) im Hintergrund stehen geblieben ist.
  const [geweckt, setGeweckt] = useState<Date>();
  const pruefZeit =
    geweckt && geweckt.getTime() > jetzt.getTime() ? geweckt : jetzt;
  const wecker = useRef<{ key: string; handle: ReturnType<typeof setTimeout> }>(
    undefined,
  );

  useEffect(() => {
    const hinweise = neueHinweise(trupps, pruefZeit, {
      vorgabe,
      gemeldet: gemeldet.current,
    });
    if (hinweise.length === 0) return;

    // Erst vermerken, dann melden — und **alle**, nicht nur den gezeigten: Die
    // überholten Erinnerungen dieses Ticks sind mit der dringlicheren Meldung
    // erledigt, und im nächsten Tick nachgereicht wären sie irreführend.
    for (const hinweis of hinweise) gemeldet.current.add(hinweis.id);

    const uhrzeit = (iso: string) =>
      format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
    const texte = (hinweis: Hinweis) =>
      buildUeberwachungPush({
        firecallId,
        firecallName,
        trupp: hinweis.trupp,
        stand: hinweis.stand,
        warnung: hinweis.warnung,
        t,
        uhrzeit,
      });

    const wichtigster = dringlichsterHinweis(hinweise);
    if (wichtigster) {
      showSnackbar(
        texte(wichtigster).zeile,
        severityVon(wichtigster),
        undefined,
        SNACKBAR_MS[wichtigster.warnung.key],
      );
    }

    if (typeof Notification === 'undefined') return;
    // Ohne Erlaubnis nicht fragen: Ein Berechtigungsdialog, der aus einem
    // Zeitgeber aufgeht, kommt ohne Zusammenhang — die Seite bietet ihn
    // stattdessen als Handlung an. Die Snackbar oben ist längst draußen.
    if (Notification.permission !== 'granted') return;

    for (const hinweis of hinweise) {
      const push = texte(hinweis);
      void zeige({
        title: push.title,
        body: push.body,
        tag: push.tag,
        url: push.data.url,
        dringend: hinweis.warnung.key === 'rueckzug',
      });
    }
  }, [
    firecallId,
    firecallName,
    format,
    pruefZeit,
    showSnackbar,
    t,
    trupps,
    vorgabe,
  ]);

  // Der Wecker auf den nächsten Termin. Nach der Prüfung oben deklariert, damit
  // er sieht, was sie gerade als gemeldet vermerkt hat. Bleibt der Termin
  // derselbe, bleibt auch der Zeitgeber stehen — sonst würde er mit jedem
  // Sekundentakt neu gestellt.
  useEffect(() => {
    const plan = earliestLocalWarning(
      nextLocalWarnings(trupps, pruefZeit, {
        vorgabe,
        gemeldet: gemeldet.current,
      }),
    );
    const key = plan ? `${plan.id}@${plan.at.getTime()}` : '';
    if (wecker.current?.key === key) return;
    if (wecker.current) clearTimeout(wecker.current.handle);
    wecker.current = undefined;
    if (!plan) return;
    const delay = Math.min(
      MAX_TIMER_MS,
      Math.max(0, plan.at.getTime() - Date.now()) + WAKE_SLACK_MS,
    );
    const handle = setTimeout(() => {
      wecker.current = undefined;
      setGeweckt(new Date());
    }, delay);
    wecker.current = { key, handle };
  }, [pruefZeit, trupps, vorgabe]);

  useEffect(() => {
    const ref = wecker;
    return () => {
      if (ref.current) clearTimeout(ref.current.handle);
      ref.current = undefined;
    };
  }, []);

  // In der App: je Trupp den nächsten Termin beim Betriebssystem hinterlegen.
  // Der Abgleich plant nur Geändertes neu; was wegfällt (Trupp zurück,
  // Rückzug angetreten), wird storniert. Beim Verlassen der Seite bleiben die
  // Termine bewusst stehen — gerade dann sollen sie ankommen.
  useEffect(() => {
    if (!isNativeLocalNotificationsAvailable()) return;
    const uhrzeit = (iso: string) =>
      format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
    const items: NativeScheduledNotification[] = [];
    for (const plan of nextLocalWarnings(trupps, pruefZeit, {
      vorgabe,
      gemeldet: gemeldet.current,
    })) {
      const trupp = trupps.find((tr) => tr.id === plan.truppId);
      if (!trupp) continue;
      const stand = berechneStand(trupp, plan.at, { vorgabe });
      if (!stand) continue;
      const push = buildUeberwachungPush({
        firecallId,
        firecallName,
        trupp,
        stand,
        warnung: { key: plan.key, faelligSeit: plan.at.toISOString() },
        t,
        uhrzeit,
      });
      items.push({
        key: push.tag,
        at: plan.at,
        title: push.title,
        body: push.body,
        url: push.data.url,
      });
    }
    void syncNativeNotifications(`asue-${firecallId}`, items);
  }, [firecallId, firecallName, format, pruefZeit, t, trupps, vorgabe]);
}
