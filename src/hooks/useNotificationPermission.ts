import { Capacitor } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { AppPermissions } from '../lib/permissions';

/**
 * Der Zustand der Benachrichtigungserlaubnis dieses **Geräts**.
 *
 * Warum ein eigener Hook und nicht ein `useState` in der Seite: Vorher merkte
 * sich die Atemschutzüberwachung nur, ob in *dieser* Sitzung jemand auf
 * „Benachrichtigungen einschalten" gedrückt hat — nach jedem Neuladen stand die
 * Aufforderung wieder da, obwohl die Erlaubnis längst erteilt war. Der Zustand
 * gehört dem Gerät, nicht dem Seitenaufruf.
 *
 * `useSyncExternalStore` und nicht ein Effekt mit `setState`: Der Wert kommt
 * von außerhalb von React (Browser bzw. Betriebssystem), er darf beim
 * Server-Rendern nicht gelesen werden, und `react-hooks/set-state-in-effect`
 * verbietet die naive Variante ohnehin. Der Schnappschuss liegt deshalb in
 * einer Modulvariablen — eine Erlaubnis gilt für das ganze Gerät, nicht je
 * Komponente.
 */
export type NotificationErlaubnis =
  /** Noch nicht gelesen — der Zustand beim Server-Rendern und vor dem ersten Blick. */
  | 'unbekannt'
  /** Dieses Gerät kann keine Benachrichtigungen anzeigen. */
  | 'nichtMoeglich'
  /** Noch nicht gefragt. */
  | 'default'
  | 'granted'
  | 'denied';

let stand: NotificationErlaubnis = 'unbekannt';
const listeners = new Set<() => void>();

function melde() {
  for (const listener of listeners) listener();
}

/**
 * Die Erlaubnis lesen, ohne sie zu erfragen.
 *
 * In der App entscheidet das Betriebssystem und nicht die WebView: Dort ist
 * `Notification.permission` oft `default`, obwohl die App die Erlaubnis hat —
 * genau die Verwechslung, die den Hinweis wieder auftauchen ließ.
 */
export async function leseErlaubnis(): Promise<NotificationErlaubnis> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { state } = await AppPermissions.checkPermission({
        type: 'notifications',
      });
      if (state === 'granted') return 'granted';
      // `permanentlyDenied` ist die einzige Ablehnung, die ein Knopf nicht
      // mehr aufheben kann; ein einfaches `denied` darf erneut gefragt werden.
      return state === 'permanentlyDenied' ? 'denied' : 'default';
    } catch {
      return 'unbekannt';
    }
  }
  if (typeof Notification === 'undefined') return 'nichtMoeglich';
  return Notification.permission;
}

/**
 * Den Zustand neu lesen und die Oberfläche benachrichtigen.
 *
 * Nötig nach dem eigenen Erlaubnis-Dialog: Das `change`-Ereignis der
 * Permissions-API gibt es nicht in jedem Browser (Safari) und in der App
 * überhaupt nicht.
 */
export async function pruefeNotificationErlaubnis(): Promise<NotificationErlaubnis> {
  const neu = await leseErlaubnis();
  if (neu !== stand) {
    stand = neu;
    melde();
  }
  return neu;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Beim ersten Beobachter lesen — im Browser synchron möglich, in der App
  // nicht, deshalb in beiden Fällen über denselben asynchronen Weg.
  void pruefeNotificationErlaubnis();

  let status: PermissionStatus | undefined;
  let aktiv = true;
  // Eine benannte Funktion, damit `removeEventListener` dieselbe Referenz
  // bekommt — eine neu erzeugte Pfeilfunktion würde nichts abmelden.
  const beiAenderung = () => void pruefeNotificationErlaubnis();
  navigator.permissions
    ?.query({ name: 'notifications' as PermissionName })
    .then((s) => {
      if (!aktiv) return;
      status = s;
      // Der Benutzer kann die Erlaubnis in den Website-Einstellungen wieder
      // entziehen, ohne die Seite neu zu laden.
      s.addEventListener('change', beiAenderung);
    })
    .catch(() => {
      // Safari kennt die Abfrage für `notifications` nicht — dann bleibt es
      // beim Wert, den `pruefeNotificationErlaubnis` gelesen hat.
    });

  return () => {
    aktiv = false;
    listeners.delete(onChange);
    status?.removeEventListener('change', beiAenderung);
  };
}

function getSnapshot(): NotificationErlaubnis {
  return stand;
}

function getServerSnapshot(): NotificationErlaubnis {
  return 'unbekannt';
}

export default function useNotificationPermission(): NotificationErlaubnis {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Nur für Tests: den gemerkten Zustand zurücksetzen. */
export function __resetNotificationErlaubnis() {
  stand = 'unbekannt';
}
