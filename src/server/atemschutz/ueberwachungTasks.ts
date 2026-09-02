import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  naechsteWarnung,
  type WarnungPlan,
} from '../../common/atemschutzUeberwachung';
import { getBaseUrl } from '../auth/baseUrl';

/**
 * Die Terminplanung der Atemschutzüberwachung über Cloud Tasks.
 *
 * **Warum keine Abfrage jede Minute:** Vorher rief Cloud Scheduler jede Minute
 * einen Lauf auf, der fast immer null Trupps fand — rund 44.000 Läufe im Monat
 * für ein paar Warnungen im Jahr. Die Termine stehen aber fest, sobald ein
 * Trupp abmarschiert ist: Drittel, zwei Drittel und der Rückzugszeitpunkt mit
 * Vorlauf lassen sich ausrechnen (`naechsteWarnung`). Statt nachzusehen wird
 * deshalb **eine** Aufgabe auf den nächsten dieser Zeitpunkte gelegt.
 *
 * **Warum immer nur eine:** Die Zeitpunkte verschieben sich, sobald eine
 * Druckabfrage den gemessenen Verbrauch ändert oder der Gerätesatz korrigiert
 * wird. Drei Aufgaben im Voraus wären nach der ersten Meldung drei falsche
 * Termine. Der Lauf zum Termin plant die nächste Aufgabe selbst
 * (`sendUeberwachungWarnungen`) — die Kette hängt sich also immer an den
 * aktuellen Stand.
 *
 * **Warum Doppelte nicht schaden:** Der Aufgabenname wird aus Trupp, Warnung
 * und Terminminute gebildet. Ein zweiter Aufruf mit demselben Ergebnis läuft in
 * `ALREADY_EXISTS` und wird verschluckt. Verschiebt sich der Termin, entsteht
 * eine zweite Aufgabe; die überholte läuft zwar an, findet dann aber keine
 * fällige Warnung (`offeneWarnungen` entscheidet zur Laufzeit) und plant nur
 * neu. Ein Termin zu früh ist damit harmlos, ein Termin zu spät gibt es nicht.
 */

/** Der Endpoint, den die Aufgabe aufruft — derselbe wie beim Zeitplan. */
const CHECK_PATH = '/api/atemschutz/ueberwachung-check';

const TASKS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Weiter als einen Tag im Voraus wird nichts eingeplant.
 *
 * `abmarschZeit` kommt aus einem Formularfeld, und ein vertipptes Datum ergäbe
 * eine Aufgabe, die in Wochen anläuft. Ein Atemschutzeinsatz dauert eine halbe
 * Stunde; alles jenseits eines Tages ist ein Tippfehler und keine Frist.
 */
const MAX_VORLAUF_MS = 24 * 60 * 60 * 1000;

export type TaskStatus =
  | 'planned'
  /** Dieselbe Aufgabe gab es schon — der Regelfall bei wiederholten Aufrufen. */
  | 'duplicate'
  /** Kein Termin: Trupp zurück, ohne Abmarsch oder alle Warnungen verschickt. */
  | 'nothingDue'
  /** Keine Queue konfiguriert — lokal der Normalfall. */
  | 'notConfigured'
  | 'failed';

export interface TaskErgebnis {
  status: TaskStatus;
  /** Der eingeplante Zeitpunkt (ISO), wenn einer bestimmt wurde. */
  faelligAb?: string;
  warnung?: WarnungPlan['key'];
  taskId?: string;
  error?: string;
}

interface TaskKonfiguration {
  /** `projects/<p>/locations/<l>/queues/<q>` */
  queue: string;
  /** Der Service Account, mit dessen OIDC-Token die Aufgabe aufruft. */
  invoker: string;
}

/**
 * Ohne Konfiguration wird nicht geplant, und das ist kein Fehler: In der
 * Entwicklung gibt es keine Queue, und die geöffnete Seite warnt dort selbst
 * (`useUeberwachungHinweise`).
 */
function konfiguration(): TaskKonfiguration | undefined {
  const queue = process.env.ATEMSCHUTZ_TASKS_QUEUE?.trim();
  const invoker = process.env.ATEMSCHUTZ_TASKS_INVOKER?.trim();
  if (!queue || !invoker) return undefined;
  return { queue, invoker };
}

let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  // Erst beim ersten Aufruf erzeugt — dieselbe Rücksicht wie in
  // `actions/maps/routes.ts`: Vitest hebt die `vi.mock`-Factory über die
  // Deklarationen des Testmoduls.
  if (!auth) auth = new GoogleAuth({ scopes: [TASKS_SCOPE] });
  return auth;
}

/**
 * Der Name der Aufgabe — die Dublettensperre.
 *
 * Die Terminminute gehört hinein und nicht der Zeitpunkt auf die Sekunde:
 * Zwei Aufrufe kurz hintereinander (Abmarsch erfassen, gleich darauf eine
 * Druckabfrage) rechnen denselben Termin mit Millisekundenunterschied aus und
 * legten sonst zwei Aufgaben auf dieselbe Minute.
 */
export function ueberwachungTaskId(
  truppId: string,
  warnung: string,
  faelligAb: string,
): string {
  const minute = Math.floor(new Date(faelligAb).getTime() / 60_000);
  // Cloud Tasks erlaubt im Namen nur Buchstaben, Ziffern, Bindestrich und
  // Unterstrich. Firestore-IDs halten das ein, ein Import von Hand muss es
  // nicht.
  const id = truppId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return `asue-${id}-${warnung}-${minute}`;
}

export interface PlaneTaskArgs {
  firecallId: string;
  /** Der Trupp mit seinem **aktuellen** Stand, inklusive `warnungen`. */
  trupp: AtemschutzTrupp;
  jetzt?: Date;
}

/**
 * Legt die Aufgabe für die nächste Warnung dieses Trupps an.
 *
 * Wirft nicht: Die Terminplanung ist eine Verbesserung gegenüber dem Abfragen
 * im Minutentakt, aber kein Grund, den Schreibvorgang scheitern zu lassen, der
 * sie ausgelöst hat. Fehler stehen im Ergebnis und im Log.
 */
export async function planeUeberwachungTask({
  firecallId,
  trupp,
  jetzt = new Date(),
}: PlaneTaskArgs): Promise<TaskErgebnis> {
  const plan = naechsteWarnung(trupp, jetzt);
  if (!plan || !trupp.id) return { status: 'nothingDue' };

  const faelligMs = new Date(plan.faelligAb).getTime();
  if (faelligMs - jetzt.getTime() > MAX_VORLAUF_MS) {
    return { status: 'nothingDue', faelligAb: plan.faelligAb };
  }
  // Ein vergangener Termin läuft sofort an — er ist ja bereits fällig.
  const termin = new Date(Math.max(faelligMs, jetzt.getTime())).toISOString();

  const config = konfiguration();
  if (!config) {
    return { status: 'notConfigured', faelligAb: termin, warnung: plan.key };
  }

  const taskId = ueberwachungTaskId(trupp.id, plan.key, termin);
  const basis = { faelligAb: termin, warnung: plan.key, taskId };

  try {
    const baseUrl = await getBaseUrl();
    const token = await getAuth().getAccessToken();
    const antwort = await fetch(
      `https://cloudtasks.googleapis.com/v2/${config.queue}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: {
            name: `${config.queue}/tasks/${taskId}`,
            scheduleTime: termin,
            httpRequest: {
              url: `${baseUrl}${CHECK_PATH}`,
              httpMethod: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // Der Rumpf trägt nur, was ins Log gehört: Der Lauf prüft ohnehin
              // alle Trupps im Einsatz und braucht keine Zielangabe.
              body: Buffer.from(
                JSON.stringify({
                  quelle: 'task',
                  firecallId,
                  truppId: trupp.id,
                  warnung: plan.key,
                }),
              ).toString('base64'),
              oidcToken: {
                serviceAccountEmail: config.invoker,
                // Dieselbe Audience, die `cronRequired` erwartet — ohne Angabe
                // gilt dort `getBaseUrl()`.
                audience: baseUrl,
              },
            },
          },
        }),
      },
    );

    if (antwort.status === 409) {
      // Dieselbe Aufgabe steht schon in der Queue. Der erwartete Fall, sobald
      // ein zweiter Schreibvorgang denselben Termin ausrechnet.
      return { ...basis, status: 'duplicate' };
    }
    if (!antwort.ok) {
      const text = await antwort.text().catch(() => '');
      console.error(
        `Atemschutz-Terminplanung fehlgeschlagen (${antwort.status})`,
        text.slice(0, 500),
      );
      return { ...basis, status: 'failed', error: `HTTP ${antwort.status}` };
    }
    return { ...basis, status: 'planned' };
  } catch (err) {
    console.error('Atemschutz-Terminplanung fehlgeschlagen', err);
    return { ...basis, status: 'failed', error: (err as Error).message };
  }
}
