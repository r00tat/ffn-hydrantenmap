import type { AtemschutzTrupp, WarnungKey } from '../../common/atemschutz';
import {
  berechneStand,
  dringlichsteWarnung,
  faelligeWarnungen,
  type UeberwachungStand,
  type WarnungFaellig,
  type WarnungOptionen,
} from '../../common/atemschutzUeberwachung';

/**
 * Welche Warnungen die **offene Seite** selbst melden muss.
 *
 * Warum überhaupt im Browser, wenn der Zeitplan serverseitig warnt: Der
 * Serverlauf braucht Cloud Scheduler, einen Push-Token und die Erlaubnis des
 * Browsers. Fehlt eines davon — in der Entwicklung fehlt der Zeitplan
 * grundsätzlich —, käme bei einer Sicherheitsfunktion *nichts*. Die geöffnete
 * Seite rechnet dieselben Fristen ohnehin jede Sekunde mit; sie darf das
 * Ergebnis auch sagen.
 *
 * Die Buchführung am Dokument (`warnungen`) wird dabei **nicht** angefasst: Sie
 * gehört dem Serverlauf. Schriebe der Browser sie mit, unterdrückte er damit
 * den Push an alle *anderen* Geräte — genau die, die die Seite nicht offen
 * haben. Was dieses Gerät schon gezeigt hat, merkt es sich deshalb nur bei
 * sich (`gemeldet`).
 */

/** Schlüssel einer Meldung: je Bereitstellung und Warnstufe genau einmal. */
export function hinweisId(truppId: string, key: WarnungKey): string {
  return `${truppId}:${key}`;
}

export interface Hinweis {
  id: string;
  trupp: AtemschutzTrupp;
  warnung: WarnungFaellig;
  /** Für den Text der Meldung — vermuteter Druck und Rückzugszeit. */
  stand: UeberwachungStand;
}

export interface HinweisOptionen extends WarnungOptionen {
  /** Was dieses Gerät bereits gezeigt hat. */
  gemeldet?: ReadonlySet<string>;
}

export function neueHinweise(
  trupps: AtemschutzTrupp[],
  jetzt: Date,
  opts: HinweisOptionen = {},
): Hinweis[] {
  const gemeldet = opts.gemeldet ?? new Set<string>();
  const hinweise: Hinweis[] = [];

  for (const trupp of trupps) {
    const truppId = trupp.id;
    if (!truppId) continue;
    const faellig = faelligeWarnungen(trupp, jetzt, opts).filter(
      (w) => !gemeldet.has(hinweisId(truppId, w.key)),
    );
    // Nur die dringlichste, wie im Serverlauf: Wer die Seite eine Weile
    // geschlossen hatte, bekäme sonst drei Meldungen übereinander.
    const warnung = dringlichsteWarnung(faellig);
    if (!warnung) continue;
    const stand = berechneStand(trupp, jetzt, opts);
    if (!stand) continue;
    hinweise.push({
      id: hinweisId(truppId, warnung.key),
      trupp,
      warnung,
      stand,
    });
  }

  return hinweise;
}
