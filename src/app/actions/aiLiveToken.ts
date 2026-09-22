'use server';
import 'server-only';

import { GEMINI_LIVE_MODEL } from '../../common/ai';
import { buildLiveTokenRequest } from '../../common/aiLiveToken';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from '../../components/firebase/aiTools';
import { consumeLiveTokenQuota } from '../../server/ai/liveTokenQuota';
import { actionUserRequired } from '../auth';

/**
 * Prägt das kurzlebige Token für eine Live-Sitzung.
 *
 * Das ist die Stelle, an der die Berechtigung des Sprachassistenten
 * tatsächlich geprüft wird. Der bisherige Weg über Firebase AI Logic stützte
 * sich auf App Check — der sagt „eine echte Instanz der App", nicht „ein
 * berechtigter Benutzer". Hier gilt die Sitzung: Wer nicht angemeldet und
 * freigeschaltet ist, bekommt kein Token, und ohne Token gibt es keine
 * Verbindung.
 *
 * Der eigentliche API-Key bleibt in `GEMINI_LIVE_API_KEY` und verlässt den
 * Server nie. Er gehört **nicht** in den öffentlichen Browser-Key des
 * Firebase-Projekts — die Begründung steht in
 * [docs/api-keys.md](../../../docs/api-keys.md).
 */

const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';

export interface LiveTokenResult {
  /** Der Tokenname, etwa `auth_tokens/…`. Er ist das Zugangsmittel. */
  token?: string;
  /** Modell der Sitzung — der Browser braucht es für die Setup-Nachricht. */
  model?: string;
  error?: 'unconfigured' | 'quota' | 'failed';
  /** Klartext für das Protokoll, nie für den Benutzer. */
  detail?: string;
}

export async function createLiveToken(): Promise<LiveTokenResult> {
  const session = await actionUserRequired();

  const apiKey = process.env.GEMINI_LIVE_API_KEY;
  if (!apiKey) {
    // Kein Fehler, sondern der Normalfall in einer Umgebung ohne Live-Betrieb:
    // Der Assistent arbeitet dann im Einzelaufruf weiter.
    return { error: 'unconfigured' };
  }

  const uid = session.user?.id;
  if (uid && !(await consumeLiveTokenQuota(uid))) {
    return { error: 'quota' };
  }

  const request = buildLiveTokenRequest({
    model: GEMINI_LIVE_MODEL,
    systemInstruction: AI_SYSTEM_PROMPT,
    toolDeclarations: AI_TOOL_DECLARATIONS,
  });

  try {
    const response = await fetch(AUTH_TOKENS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `[AI] Live-Token nicht erhalten (${response.status}): ${detail.slice(0, 500)}`,
      );
      return { error: 'failed', detail: `HTTP ${response.status}` };
    }

    const { name } = (await response.json()) as { name?: string };
    if (!name) {
      return { error: 'failed', detail: 'Antwort ohne Tokennamen' };
    }

    return { token: name, model: GEMINI_LIVE_MODEL };
  } catch (error) {
    console.error('[AI] Live-Token konnte nicht geprägt werden:', error);
    return { error: 'failed', detail: (error as Error).message };
  }
}
