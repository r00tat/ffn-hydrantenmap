import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications';

/**
 * Geplante Benachrichtigungen beim Betriebssystem — in der Android-App.
 *
 * Im Browser bleibt einer Seite nur der eigene Zeitgeber, und der läuft nur,
 * solange die Seite lebt. Das Betriebssystem dagegen löst eine hinterlegte
 * Benachrichtigung auch bei gesperrtem Bildschirm und geschlossener App aus —
 * und braucht dafür kein Netz. Für die Atemschutzwarnungen offline ist das der
 * einzige Weg, der den gesperrten Bildschirm erreicht.
 *
 * **Hinter einer Laufzeitprüfung:** Die App lädt ihre Seiten vom Server
 * (`server.url` in `capacitor/capacitor.config.ts`). Eine ältere installierte
 * App ohne das native Plugin `@capacitor/local-notifications` bekommt also
 * denselben Code — dort meldet `Capacitor.isPluginAvailable` `false`, und jeder
 * Aufruf hier ist ein No-op. Im Browser ebenso: Die Web-Implementierung des
 * Plugins kann nichts planen, was eine geschlossene Seite überlebt.
 */

const PLUGIN_NAME = 'LocalNotifications';

/** Wichtigkeit `IMPORTANCE_HIGH`/`MAX` (5): Heads-up, Ton, Vibration. */
const IMPORTANCE_MAX = 5;
/** `VISIBILITY_PUBLIC` (1): voller Text auf dem Sperrbildschirm. */
const VISIBILITY_PUBLIC = 1;

export interface NativeNotificationChannel {
  /** Kennung des Android-Kanals. Einmal angelegt, sind Ton und Wichtigkeit fest. */
  id: string;
  /** Erscheint in den Android-Einstellungen der App. */
  name: string;
  description?: string;
}

export interface NativeScheduledNotification {
  /** Stabiler Schlüssel; gleicher Schlüssel ersetzt die frühere Planung. */
  key: string;
  at: Date;
  title: string;
  body: string;
  /** Wohin ein Tipp auf die Benachrichtigung führen soll. */
  url?: string;
}

/**
 * Ob die App Benachrichtigungen auf die Minute genau auslösen darf
 * („Alarme & Erinnerungen", Android 12+).
 *
 * `unavailable`: kein natives Plugin (Browser oder ältere App).
 */
export type ExactAlarmState = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Je Gruppe: Schlüssel → Signatur der zuletzt geplanten Benachrichtigung. */
const scheduled = new Map<string, Map<string, string>>();
const createdChannels = new Set<string>();
let exactState: ExactAlarmState | undefined;
const exactListeners = new Set<() => void>();

export function isNativeLocalNotificationsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN_NAME);
  } catch {
    return false;
  }
}

/**
 * Positive 31-Bit-Kennung aus einem Schlüssel (FNV-1a). Android verlangt eine
 * `int`-Kennung; dieselbe Kennung ersetzt eine geplante Benachrichtigung.
 */
export function notificationIdFor(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1 || 1;
}

function signature(item: NativeScheduledNotification, exact: boolean): string {
  return `${item.at.getTime()}|${item.title}|${item.body}|${item.url ?? ''}|${exact}`;
}

function setExactState(next: ExactAlarmState): ExactAlarmState {
  if (next !== exactState) {
    exactState = next;
    for (const listener of exactListeners) listener();
  }
  return next;
}

function toExactState(value: string | undefined): ExactAlarmState {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Die Erlaubnis für exakte Alarme beim Betriebssystem nachlesen.
 *
 * Nötig, wenn der Benutzer aus den Systemeinstellungen zurückkommt: Android
 * meldet die Änderung nicht von sich aus an die WebView.
 */
export async function refreshExactAlarmState(): Promise<ExactAlarmState> {
  if (!isNativeLocalNotificationsAvailable()) return setExactState('unavailable');
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    return setExactState(toExactState(exact_alarm));
  } catch (err) {
    // Vor Android 12 gibt es die Einstellung nicht — dort ist jeder Alarm
    // ohnehin erlaubt.
    console.warn('exact alarm check failed', err);
    return setExactState('granted');
  }
}

/** Der gemerkte Zustand; liest beim ersten Aufruf beim Betriebssystem nach. */
export async function getExactAlarmState(): Promise<ExactAlarmState> {
  return exactState ?? refreshExactAlarmState();
}

/** Für `useSyncExternalStore`: der zuletzt gelesene Zustand, ohne nachzulesen. */
export function peekExactAlarmState(): ExactAlarmState | undefined {
  return exactState;
}

export function subscribeExactAlarmState(listener: () => void): () => void {
  exactListeners.add(listener);
  return () => {
    exactListeners.delete(listener);
  };
}

/**
 * Den Benutzer in die Systemeinstellung „Alarme & Erinnerungen" führen — nur
 * als Handlung, nie beim Laden.
 *
 * Danach wird alles neu geplant, damit bereits unscharf hinterlegte Warnungen
 * exakt werden.
 */
export async function requestExactAlarms(): Promise<ExactAlarmState> {
  if (!isNativeLocalNotificationsAvailable()) return setExactState('unavailable');
  try {
    const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting();
    const next = setExactState(toExactState(exact_alarm));
    if (next === 'granted') scheduled.clear();
    return next;
  } catch (err) {
    console.warn('exact alarm request failed', err);
    return refreshExactAlarmState();
  }
}

async function ensureChannel(channel: NativeNotificationChannel): Promise<void> {
  if (createdChannels.has(channel.id)) return;
  // `createChannel` überschreibt auf Android nur Name und Beschreibung eines
  // bestehenden Kanals; Wichtigkeit und Ton bleiben, wie der Benutzer sie
  // eingestellt hat. Erneutes Anlegen bei jedem Start ist deshalb harmlos.
  await LocalNotifications.createChannel({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    importance: IMPORTANCE_MAX,
    visibility: VISIBILITY_PUBLIC,
    vibration: true,
    lights: true,
  });
  createdChannels.add(channel.id);
}

/**
 * Gleicht die geplanten Benachrichtigungen einer Gruppe mit `items` ab:
 * Neues und Geändertes wird geplant, Weggefallenes storniert, Unverändertes
 * nicht angefasst (der Aufrufer ruft das in jedem Sekundentakt auf).
 *
 * **Exakt nur mit Erlaubnis.** Das Plugin öffnet bei `isExactNotification:
 * true` ohne Erlaubnis bei jedem `schedule()` die Systemeinstellungen — bei
 * einem Abgleich im Sekundentakt wäre die App unbedienbar. Ohne Erlaubnis wird
 * deshalb unscharf geplant; die Seite bietet die Erlaubnis als Knopf an
 * (`requestExactAlarms`).
 *
 * Fehler des Plugins — fehlende Erlaubnis etwa — werden nur geloggt: Die
 * Warnung steht ohnehin auf der Seite.
 */
export async function syncNativeNotifications(
  group: string,
  items: NativeScheduledNotification[],
  channel: NativeNotificationChannel,
): Promise<void> {
  if (!isNativeLocalNotificationsAvailable()) return;
  // Nach dem ersten Mal aus dem Speicher; die Erlaubnis gehört zur Signatur,
  // damit eine nachträglich erteilte alles exakt neu planen lässt.
  const exact = (await getExactAlarmState()) === 'granted';
  const previous = scheduled.get(group) ?? new Map<string, string>();
  const next = new Map<string, string>();
  const toSchedule: LocalNotificationSchema[] = [];

  for (const item of items) {
    const sig = signature(item, exact);
    next.set(item.key, sig);
    if (previous.get(item.key) === sig) continue;
    toSchedule.push({
      id: notificationIdFor(item.key),
      title: item.title,
      body: item.body,
      schedule: { at: item.at, allowWhileIdle: true },
      extra: item.url ? { url: item.url } : undefined,
      group,
      channelId: channel.id,
      autoCancel: true,
      foreground: true,
      isExactNotification: exact,
    });
  }
  const toCancel = [...previous.keys()]
    .filter((key) => !next.has(key))
    .map((key) => ({ id: notificationIdFor(key) }));

  scheduled.set(group, next);
  try {
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel });
    }
    if (toSchedule.length > 0) {
      await ensureChannel(channel);
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
  } catch (err) {
    // Beim nächsten Abgleich erneut versuchen.
    scheduled.set(group, previous);
    console.warn('native local notifications failed', err);
  }
}

/**
 * Nur Pfade der eigenen App: Die Adresse steht in der Benachrichtigung und
 * kommt damit aus Daten, die nicht nur die App selbst schreibt.
 */
function isAppPath(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

/**
 * Ein Tipp auf eine Benachrichtigung öffnet die App; ohne diesen Listener
 * landete der Benutzer auf der zuletzt offenen Seite statt bei dem Trupp, um
 * den es geht. Gibt eine Funktion zum Abmelden zurück.
 */
export async function addNativeNotificationTapListener(
  onUrl: (url: string) => void,
): Promise<() => void> {
  if (!isNativeLocalNotificationsAvailable()) return () => {};
  const handle = await LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      const url = (action.notification.extra as { url?: unknown } | undefined)?.url;
      if (isAppPath(url)) onUrl(url);
    },
  );
  return () => {
    void handle.remove();
  };
}

/** Nur für Tests. */
export function resetNativeLocalNotificationsForTests(): void {
  scheduled.clear();
  createdChannels.clear();
  exactState = undefined;
  exactListeners.clear();
}
