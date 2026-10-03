import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Geplante Benachrichtigungen beim Betriebssystem — in der Android-App.
 *
 * Im Browser bleibt einer Seite nur der eigene Zeitgeber, und der läuft nur,
 * solange die Seite lebt. Das Betriebssystem dagegen löst eine hinterlegte
 * Benachrichtigung auch bei gesperrtem Bildschirm und geschlossener App aus —
 * und braucht dafür kein Netz. Für die Atemschutzwarnungen offline ist das der
 * einzige Weg, der den gesperrten Bildschirm erreicht.
 *
 * **Hinter einer Laufzeitprüfung:** Das Plugin `@capacitor/local-notifications`
 * ist (noch) nicht installiert. Ohne das native Plugin meldet
 * `Capacitor.isPluginAvailable` `false`, und jeder Aufruf hier ist ein No-op.
 * Die Schnittstelle unten ist der Ausschnitt der Plugin-API, den wir nutzen;
 * `registerPlugin` liefert denselben Proxy, den das npm-Paket liefern würde.
 * Deshalb wird erst registriert, wenn das Plugin da ist — sonst warnte
 * Capacitor später über eine doppelte Registrierung.
 */

interface LocalNotificationSchema {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date; allowWhileIdle?: boolean };
  extra?: unknown;
  group?: string;
}

interface LocalNotificationsPlugin {
  schedule(options: { notifications: LocalNotificationSchema[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

const PLUGIN_NAME = 'LocalNotifications';

export interface NativeScheduledNotification {
  /** Stabiler Schlüssel; gleicher Schlüssel ersetzt die frühere Planung. */
  key: string;
  at: Date;
  title: string;
  body: string;
  /** Wohin ein Tipp auf die Benachrichtigung führen soll. */
  url?: string;
}

let plugin: LocalNotificationsPlugin | null = null;
/** Je Gruppe: Schlüssel → Signatur der zuletzt geplanten Benachrichtigung. */
const scheduled = new Map<string, Map<string, string>>();

export function isNativeLocalNotificationsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN_NAME);
  } catch {
    return false;
  }
}

function getPlugin(): LocalNotificationsPlugin {
  if (!plugin) plugin = registerPlugin<LocalNotificationsPlugin>(PLUGIN_NAME);
  return plugin;
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

function signature(item: NativeScheduledNotification): string {
  return `${item.at.getTime()}|${item.title}|${item.body}|${item.url ?? ''}`;
}

/**
 * Gleicht die geplanten Benachrichtigungen einer Gruppe mit `items` ab:
 * Neues und Geändertes wird geplant, Weggefallenes storniert, Unverändertes
 * nicht angefasst (der Aufrufer ruft das in jedem Sekundentakt auf).
 *
 * Fehler des Plugins — fehlende Erlaubnis etwa — werden nur geloggt: Die
 * Warnung steht ohnehin auf der Seite.
 */
export async function syncNativeNotifications(
  group: string,
  items: NativeScheduledNotification[],
): Promise<void> {
  if (!isNativeLocalNotificationsAvailable()) return;
  const previous = scheduled.get(group) ?? new Map<string, string>();
  const next = new Map<string, string>();
  const toSchedule: LocalNotificationSchema[] = [];

  for (const item of items) {
    const sig = signature(item);
    next.set(item.key, sig);
    if (previous.get(item.key) === sig) continue;
    toSchedule.push({
      id: notificationIdFor(item.key),
      title: item.title,
      body: item.body,
      schedule: { at: item.at, allowWhileIdle: true },
      extra: item.url ? { url: item.url } : undefined,
      group,
    });
  }
  const toCancel = [...previous.keys()]
    .filter((key) => !next.has(key))
    .map((key) => ({ id: notificationIdFor(key) }));

  scheduled.set(group, next);
  try {
    if (toCancel.length > 0) {
      await getPlugin().cancel({ notifications: toCancel });
    }
    if (toSchedule.length > 0) {
      await getPlugin().schedule({ notifications: toSchedule });
    }
  } catch (err) {
    // Beim nächsten Abgleich erneut versuchen.
    scheduled.set(group, previous);
    console.warn('native local notifications failed', err);
  }
}

/** Nur für Tests. */
export function resetNativeLocalNotificationsForTests(): void {
  plugin = null;
  scheduled.clear();
}
