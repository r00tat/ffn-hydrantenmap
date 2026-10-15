import type { FirebaseApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { TimeoutError, withTimeout } from '../../lib/withTimeout';

/**
 * Höchstdauer eines App-Check-Tokenabrufs (reCAPTCHA plus Austausch).
 * Üblich sind ein bis zwei Sekunden.
 */
export const APP_CHECK_TOKEN_TIMEOUT_MS = 15_000;

const RECAPTCHA_ENTERPRISE_SCRIPT =
  'https://www.google.com/recaptcha/enterprise.js?render=explicit';

declare global {
  interface Window {
    grecaptcha?: { enterprise?: unknown };
  }
}

/** Die internen Methoden des SDK-Providers, die App Check aufruft. */
interface InternalProvider {
  getToken(isLimitedUse?: boolean): Promise<unknown>;
  initialize(app: FirebaseApp): void;
}

const base = ReCaptchaEnterpriseProvider.prototype as unknown as InternalProvider;

function loadRecaptchaScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RECAPTCHA_ENTERPRISE_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('reCAPTCHA script failed to load'));
    document.head.appendChild(script);
  });
}

export interface BoundedProviderDeps {
  timeoutMs: number;
  /** Ist reCAPTCHA Enterprise im Fenster angekommen? */
  hasRecaptcha: () => boolean;
  loadScript: () => Promise<void>;
  onTimeout: (err: TimeoutError) => void;
}

/**
 * reCAPTCHA-Enterprise-Provider für App Check, dessen Tokenabruf nicht
 * hängen bleiben kann.
 *
 * Das SDK kennt dort keine Zeitgrenze: Lädt das reCAPTCHA-Skript nicht (App
 * mit schlechter Verbindung gestartet), wartet jeder Abruf ewig auf die
 * Initialisierung; bleibt `execute()` stecken (Gerät aus dem Standby),
 * ebenso. App Check hält einen solchen Abruf als laufenden Austausch fest und
 * hängt jeden weiteren daran an. Firestore wiederum öffnet seine Streams erst,
 * wenn **beide** Tokens da sind, Auth und App Check. Der Lese-Stream bleibt
 * offen und liefert weiter, der Schreib-Stream schließt nach einer Minute
 * Leerlauf und kommt nicht mehr auf: Änderungen bleiben „ausstehend", bis die
 * App neu startet — sobald das gespeicherte App-Check-Token nach rund einer
 * Stunde erneuert werden muss.
 *
 * Mit der Zeitgrenze lehnt der Abruf ab. App Check gibt Firestore dann ein
 * Platzhalter-Token mit Fehler, und Firestore verbindet sich trotzdem — für
 * Firestore ist App Check nicht erzwungen (docs/api-keys.md). Ist das Skript
 * nie angekommen, lädt der nächste Abruf es selbst nach und initialisiert
 * reCAPTCHA neu.
 */
export class BoundedReCaptchaEnterpriseProvider extends ReCaptchaEnterpriseProvider {
  private readonly deps: BoundedProviderDeps;
  private firebaseApp?: FirebaseApp;
  private needsScriptReload = false;

  constructor(siteKey: string, deps: Partial<BoundedProviderDeps> = {}) {
    super(siteKey);
    this.deps = {
      timeoutMs: APP_CHECK_TOKEN_TIMEOUT_MS,
      hasRecaptcha: () =>
        typeof window !== 'undefined' && !!window.grecaptcha?.enterprise,
      loadScript: loadRecaptchaScript,
      onTimeout: (err) => console.warn('app check token request hung', err),
      ...deps,
    };
  }

  /** @internal Von App Check aufgerufen. */
  initialize(app: FirebaseApp): void {
    this.firebaseApp = app;
    base.initialize.call(this, app);
  }

  /** @internal Von App Check aufgerufen. */
  async getToken(isLimitedUse = false): Promise<unknown> {
    if (this.needsScriptReload && this.firebaseApp) {
      // Wirft, wenn das Skript wieder nicht kommt; der nächste Abruf versucht
      // es erneut.
      await this.deps.loadScript();
      this.needsScriptReload = false;
      base.initialize.call(this, this.firebaseApp);
    }

    try {
      return await withTimeout(
        base.getToken.call(this, isLimitedUse),
        this.deps.timeoutMs,
        'app check token',
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.needsScriptReload = !this.deps.hasRecaptcha();
        this.deps.onTimeout(err);
      }
      throw err;
    }
  }
}
