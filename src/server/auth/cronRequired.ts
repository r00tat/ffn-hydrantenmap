import 'server-only';

import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import { getBaseUrl } from './baseUrl';

/**
 * Guard für Endpoints, die ein Zeitplan aufruft (Cloud Scheduler).
 *
 * Cloud Scheduler schickt ein OIDC-ID-Token seines Service Accounts. Geprüft
 * wird beides: dass Google das Token für diesen Dienst ausgestellt hat
 * (Signatur und Audience) und dass es von einem Konto kommt, das wir dafür
 * vorgesehen haben. Die Signatur allein genügt nicht — jedes Google-Konto
 * könnte sich eines für diese Audience ausstellen lassen.
 *
 * **Fail closed:** Ohne `CRON_INVOKER_EMAILS` wird abgelehnt. Anders als beim
 * SumUp-Webhook, der bei fehlendem Secret nur warnt: Diese Endpoints
 * verschicken Mails an gepflegte Verteilerlisten, ein offener Endpoint wäre ein
 * Mail-Relay.
 *
 * Generisch gehalten, damit weitere geplante Läufe denselben Guard benutzen.
 */

/**
 * Ein Client ohne Anmeldedaten genügt — er holt nur die öffentlichen
 * Google-Zertifikate. Der Konstruktor macht keine I/O und sucht keine
 * Credentials (anders als `GoogleAuth`), er belegt nur Felder; auf Modulebene
 * ist er deshalb unbedenklich. Der Client cacht die abgeholten Zertifikate,
 * eine gemeinsame Instanz spart also pro Aufruf einen Netzabruf.
 */
const client = new OAuth2Client();

function allowedInvokers(): string[] {
  return (process.env.CRON_INVOKER_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

/**
 * Erwartete Audience des Tokens. `CRON_OIDC_AUDIENCE` hat Vorrang, weil der
 * Scheduler auf die `run.app`-URL zeigen kann, während die App unter einer
 * Custom Domain läuft — dann wäre `getBaseUrl()` die falsche Erwartung.
 *
 * Der Rückfall auf `getBaseUrl()` ist im Request-Kontext die Origin der
 * Anfrage. Das ist keine Selbstbestätigung: `requestOrigin()` gibt nur zurück,
 * was auf der Allowlist steht (`ALLOWED_ORIGINS` bzw. `NEXTAUTH_URL`), ein
 * gefälschter `Host`-Header kommt also nicht durch. Wer es deterministisch
 * will, setzt `CRON_OIDC_AUDIENCE`.
 */
async function expectedAudience(): Promise<string> {
  return process.env.CRON_OIDC_AUDIENCE?.trim() || (await getBaseUrl());
}

export default async function cronRequired(
  req: NextRequest,
): Promise<TokenPayload> {
  // Erst die Anmeldedaten am Request prüfen, dann die Konfiguration: ein
  // Aufrufer ohne `Authorization` bekommt so auch bei fehlender Allowlist ein
  // 401 (fehlende Anmeldedaten) statt eines 403, das ihm verrät, dass der
  // Endpoint unkonfiguriert ist. Am Fail-closed-Verhalten ändert die
  // Reihenfolge nichts: die Allowlist wird in jedem Fall geprüft, bevor das
  // Token verifiziert wird oder der Aufruf durchgeht.
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    throw new ApiException('Unauthorized', { status: 401 });
  }
  // Strikt am Anfang — anders als bei `adminRequired`, das `Bearer ` irgendwo
  // im Wert akzeptiert. Cloud Scheduler schickt genau dieses Präfix.
  if (!authorization.startsWith('Bearer ')) {
    throw new ApiException('Bearer token required', { status: 403 });
  }
  const idToken = authorization.slice('Bearer '.length).trim();

  const allowed = allowedInvokers();
  if (allowed.length === 0) {
    console.error('cronRequired: CRON_INVOKER_EMAILS ist nicht konfiguriert');
    throw new ApiException('scheduled invocation is not configured', {
      status: 403,
    });
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: await expectedAudience(),
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.warn('cronRequired: Token nicht verifizierbar', err);
    throw new ApiException('invalid token', { status: 403 });
  }

  // Ohne `email` ist der Aufrufer nicht gegen die Allowlist zu prüfen, und ohne
  // diese Prüfung darf der Aufruf nicht durchgehen.
  if (!payload?.email) {
    throw new ApiException('invalid token', { status: 403 });
  }
  // `email_verified` ist im Token optional (siehe `TokenPayload`), deshalb wird
  // nur ein ausdrückliches `false` abgelehnt und ein fehlendes Claim nicht.
  //
  // Bewusst keine Pflicht: Die Sicherheit hängt an der Allowlist, nicht an
  // diesem Claim. Google stellt das Token aus und setzt darin die Adresse des
  // Service Accounts — der Inhaber kann keine fremde behaupten, ein
  // „unbestätigtes" `email` gibt es in diesem Fluss also gar nicht. Würde das
  // Claim zur Pflicht gemacht und Google liefert es für Service Accounts nicht
  // mit, lehnte der Guard in Produktion jeden legitimen Lauf ab — und keiner
  // der Tests hier könnte das zeigen, weil sie das Token mocken.
  if (payload.email_verified === false) {
    throw new ApiException('invalid token', { status: 403 });
  }
  // Beide Seiten kleingeschrieben vergleichen. Der lokale Teil einer
  // E-Mail-Adresse ist laut RFC 5321 genau genommen case-sensitiv; für
  // Service-Account-Adressen (`*.iam.gserviceaccount.com`, von Google immer
  // klein vergeben) ist das ohne Belang, und ein Tippfehler in der
  // Groß-/Kleinschreibung der Konfiguration soll den Lauf nicht stillschweigend
  // ausfallen lassen.
  if (!allowed.includes(payload.email.toLowerCase())) {
    console.warn('cronRequired: Aufrufer nicht erlaubt', {
      email: payload.email,
    });
    throw new ApiException('caller is not allowed', { status: 403 });
  }

  return payload;
}
